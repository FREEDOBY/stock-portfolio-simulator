"""키친사이클 트렌드 판별 고도화 v2 단위 테스트"""
import pytest
import pandas as pd
import numpy as np

from app.services.macro_calculator import MacroCalculator
from app.services.signal_engine import SignalEngine
from app.models.signal_schemas import SignalStatus


@pytest.fixture
def calc():
    return MacroCalculator()


@pytest.fixture
def engine():
    return SignalEngine()


def _make_series(values: list[float], start: str = "2022-01") -> pd.Series:
    """테스트용 월간 시리즈 생성"""
    return pd.Series(
        values,
        index=pd.date_range(start, periods=len(values), freq="ME"),
    )


def _make_accelerating(base: float = 100, months: int = 36) -> pd.Series:
    """가속 상승 데이터 (YoY% 기울기 양수)"""
    # 증가율이 점점 커지는 데이터
    values = []
    v = base
    for i in range(months):
        v *= 1 + 0.005 + i * 0.001  # 월 증가율이 점점 커짐
        values.append(v)
    return _make_series(values)


def _make_decelerating(base: float = 100, months: int = 36) -> pd.Series:
    """감속 상승 데이터 (YoY% 기울기 음수) — 값은 올라가지만 증가율은 꺾임"""
    values = []
    v = base
    for i in range(months):
        rate = max(0.02 - i * 0.0005, 0.001)  # 월 증가율 감소
        v *= 1 + rate
        values.append(v)
    return _make_series(values)


def _make_declining(base: float = 200, months: int = 36) -> pd.Series:
    """하락 데이터 (YoY% 음수 + 기울기 음수)"""
    values = []
    v = base
    for i in range(months):
        v *= 1 - 0.005 - i * 0.0003
        values.append(v)
    return _make_series(values)


def _make_flat(base: float = 100, months: int = 36) -> pd.Series:
    """횡보 데이터"""
    rng = np.random.RandomState(42)
    values = [base + rng.normal(0, 0.5) for _ in range(months)]
    return _make_series(values)


# ═══════════════════════════════════════════════════════════════
# REQ-001: YoY% 기울기 기반 트렌드 판별
# ═══════════════════════════════════════════════════════════════

class TestTrendDirectionV2:
    """@requirement REQ-001"""

    # UT-001: REQ-001 - 가속 상승 → rising
    def test_rising_trend(self, calc):
        series = _make_accelerating()
        direction, strength = calc.trend_direction_v2(series)
        assert direction == "rising"
        assert 0 < strength <= 1.0

    # UT-002: REQ-001 - 하락 데이터 → falling
    def test_falling_trend(self, calc):
        series = _make_declining()
        direction, strength = calc.trend_direction_v2(series)
        assert direction == "falling"
        assert 0 < strength <= 1.0

    # UT-003: REQ-001 - 데이터 부족 (19개월 미만)
    def test_insufficient_data(self, calc):
        series = _make_series([100 + i for i in range(10)])
        direction, strength = calc.trend_direction_v2(series)
        assert direction is None
        assert strength == 0.0

    # UT-004: REQ-001 - 횡보 → None 또는 매우 낮은 strength
    def test_flat_trend(self, calc):
        # 완전한 횡보 (노이즈 없음)
        series = _make_series([100.0] * 36)
        direction, strength = calc.trend_direction_v2(series)
        assert direction is None


# ═══════════════════════════════════════════════════════════════
# REQ-002: 트렌드 강도 (R²) 산출
# ═══════════════════════════════════════════════════════════════

class TestTrendStrength:
    """@requirement REQ-002"""

    # UT-005: REQ-002 - 강한 가속 vs 약한 가속, R² 차이
    def test_strong_vs_weak_rising(self, calc):
        strong = _make_accelerating(months=36)
        # 약한 상승: 노이즈 많이 섞인 데이터
        rng = np.random.RandomState(42)
        weak_vals = [100 * (1 + 0.01) ** i + rng.normal(0, 5) for i in range(36)]
        weak = _make_series(weak_vals)

        dir_s, strong_str = calc.trend_direction_v2(strong)
        dir_w, weak_str = calc.trend_direction_v2(weak)

        # 강한 트렌드가 R² 더 높음
        if dir_s is not None and dir_w is not None:
            assert strong_str >= weak_str

    # UT-006: REQ-002 - strength(R²) 범위는 0~1
    def test_strength_range(self, calc):
        series = _make_accelerating()
        _, strength = calc.trend_direction_v2(series)
        assert 0.0 <= strength <= 1.0

    # UT-007: REQ-002 - 감속 상승 (값은 올라가지만 증가율 꺾임) → falling
    def test_decelerating_is_falling(self, calc):
        series = _make_decelerating()
        direction, strength = calc.trend_direction_v2(series)
        # YoY%의 기울기가 음수 → falling (핵심 테스트!)
        assert direction == "falling"


# ═══════════════════════════════════════════════════════════════
# REQ-003: 복합 트렌드 강도 가중합산
# ═══════════════════════════════════════════════════════════════

class TestCompositeTrendV2:
    """@requirement REQ-003"""

    # UT-008: REQ-003 - 다수 rising → rising
    def test_majority_rising(self, calc):
        rising = _make_accelerating()
        falling = _make_declining()
        inputs = [(rising, 2.0), (rising, 2.0), (falling, 1.0)]
        direction, strength = calc.composite_trend_v2(inputs)
        assert direction == "rising"
        assert strength > 0

    # UT-009: REQ-003 - 모든 지표 횡보 → None
    def test_all_flat(self, calc):
        flat = _make_flat()
        inputs = [(flat, 1.0), (flat, 1.0)]
        direction, strength = calc.composite_trend_v2(inputs)
        assert direction is None

    # UT-010: REQ-003 - 빈 리스트 → None
    def test_empty_inputs(self, calc):
        direction, strength = calc.composite_trend_v2([])
        assert direction is None
        assert strength == 0.0


# ═══════════════════════════════════════════════════════════════
# REQ-004: OI Ratio proxy 계산
# ═══════════════════════════════════════════════════════════════

class TestOIRatioProxy:
    """@requirement REQ-004"""

    # UT-011: REQ-004 - 수요 증가 > 재고 증가 → ratio > 1.0
    def test_demand_outpacing_inventory(self, calc):
        demand = _make_series([100 + i * 5 for i in range(24)])
        inventory = _make_series([100 + i * 1 for i in range(24)])
        ratio = calc.oi_ratio_proxy(demand, inventory)
        assert ratio is not None
        assert ratio > 1.0

    # UT-012: REQ-004 - 재고 증가 > 수요 증가 → ratio < 1.0
    def test_inventory_outpacing_demand(self, calc):
        demand = _make_series([100 + i * 1 for i in range(24)])
        inventory = _make_series([100 + i * 5 for i in range(24)])
        ratio = calc.oi_ratio_proxy(demand, inventory)
        assert ratio is not None
        assert ratio < 1.0

    # UT-013: REQ-004 - 데이터 부족 → None
    def test_insufficient_data(self, calc):
        demand = _make_series([100, 101])
        inventory = _make_series([100, 101])
        ratio = calc.oi_ratio_proxy(demand, inventory)
        assert ratio is None

    # UT-023: REQ-004 - 둘 다 감소 → 부호 정규화
    def test_both_declining(self, calc):
        demand = _make_series([200 - i * 5 for i in range(24)])
        inventory = _make_series([200 - i * 2 for i in range(24)])
        ratio = calc.oi_ratio_proxy(demand, inventory)
        assert ratio is not None
        assert ratio < 1.0

    # UT-024: REQ-004 - 수요 증가 + 재고 감소 → 강한 수요 우위
    def test_demand_up_inventory_down(self, calc):
        demand = _make_series([100 + i * 3 for i in range(24)])
        inventory = _make_series([200 - i * 3 for i in range(24)])
        ratio = calc.oi_ratio_proxy(demand, inventory)
        assert ratio is not None
        assert ratio > 1.0


# ═══════════════════════════════════════════════════════════════
# REQ-005: Phase 전환 완충 (이중확인)
# ═══════════════════════════════════════════════════════════════

class TestPhaseSimplified:
    """@requirement REQ-003 - OI Ratio 제거 후 단순 Phase 판정"""

    # UT-014: IPMAN↑ + ISRATIO↓ → Phase 1 (OI Ratio 없이)
    def test_phase1_without_oi_ratio(self, engine):
        result = engine.signal_3_kitchen_cycle(
            pmi_trend="rising",
            inventory_trend="falling",
            pmi_strength=0.8,
            inventory_strength=0.7,
        )
        assert result.status == SignalStatus.BUY
        assert "Phase 1" in result.reason
        assert result.score > 0


# ═══════════════════════════════════════════════════════════════
# REQ-006: BUSINV 데이터 추가
# ═══════════════════════════════════════════════════════════════

class TestBUSINVConfig:
    """@requirement REQ-006"""

    # UT-017: REQ-006 - FRED_SERIES_CONFIG에 BUSINV 포함
    def test_businv_in_config(self):
        from app.models.macro_schemas import FRED_SERIES_CONFIG
        ids = [c["id"] for c in FRED_SERIES_CONFIG]
        assert "BUSINV" in ids


# ═══════════════════════════════════════════════════════════════
# REQ-007: 키친사이클 시그널 고도화
# ═══════════════════════════════════════════════════════════════

class TestKitchinSignalV2:
    """@requirement REQ-007"""

    # UT-018: REQ-007 - Phase 1 + 높은 strength → 높은 score
    def test_high_strength_high_score(self, engine):
        result = engine.signal_3_kitchen_cycle(
            pmi_trend="rising",
            inventory_trend="falling",
            pmi_strength=0.9,
            inventory_strength=0.8,
        )
        assert result.score > 1.0

    # UT-019: REQ-007 - Phase 1 + 낮은 strength → 낮은 score
    def test_low_strength_low_score(self, engine):
        result = engine.signal_3_kitchen_cycle(
            pmi_trend="rising",
            inventory_trend="falling",
            pmi_strength=0.2,
            inventory_strength=0.2,
        )
        assert result.score < 1.0

    # UT-020: REQ-007 - 트렌드 데이터 없음 → WAIT
    def test_no_trend_data(self, engine):
        result = engine.signal_3_kitchen_cycle(
            pmi_trend=None,
            inventory_trend=None,
        )
        assert result.status == SignalStatus.WAIT
        assert result.score == 0.0

    # UT-021: REQ-007 - Phase 3 (하락) + 높은 strength → 큰 음수 score
    def test_phase3_bearish(self, engine):
        result = engine.signal_3_kitchen_cycle(
            pmi_trend="falling",
            inventory_trend="rising",
            pmi_strength=0.9,
            inventory_strength=0.8,
        )
        assert result.score < 0
        assert result.status == SignalStatus.SELL


# ═══════════════════════════════════════════════════════════════
# REQ-009: 카테고리 요약에 강도 포함
# ═══════════════════════════════════════════════════════════════

class TestCategorySummary:
    """@requirement REQ-009"""

    # UT-022: REQ-009 - key_values에 strength 포함
    def test_summary_has_strength(self):
        from app.services.macro_service import MacroService
        service = MacroService.__new__(MacroService)
        indicators = {
            "pmi_trend": "rising",
            "pmi_strength": 0.8,
            "inventory_trend": "falling",
            "inventory_strength": 0.7,
            "cli_mom": pd.Series([0.1, 0.2, 0.15]),
            "cli_cycle_stage": "expansion",
        }
        summary = service._build_category_summary(indicators)
        assert "strength" in summary["business_cycle"]["key_values"]
