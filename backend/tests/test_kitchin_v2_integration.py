"""키친사이클 v2 통합 테스트 - MacroCalculator ↔ SignalEngine ↔ MacroService 연동"""
import pytest
import pandas as pd
import numpy as np

from app.services.macro_calculator import MacroCalculator
from app.services.signal_engine import SignalEngine
from app.models.signal_schemas import SignalStatus, SignalVerdict


@pytest.fixture
def calc():
    return MacroCalculator()


@pytest.fixture
def engine():
    return SignalEngine()


def _make_series(values: list[float], start: str = "2022-01") -> pd.Series:
    return pd.Series(values, index=pd.date_range(start, periods=len(values), freq="ME"))


def _accelerating(base=100, months=36):
    """가속 상승 (YoY 기울기 양수)"""
    v, vals = base, []
    for i in range(months):
        v *= 1 + 0.005 + i * 0.001
        vals.append(v)
    return _make_series(vals)


def _declining(base=200, months=36):
    """하락 (YoY 기울기 음수)"""
    v, vals = base, []
    for i in range(months):
        v *= 1 - 0.005 - i * 0.0003
        vals.append(v)
    return _make_series(vals)


class TestCalculatorToSignalIntegration:
    """@requirement REQ-001, REQ-002, REQ-003, REQ-007"""

    # IT-001: 가속 수요 + 하락 재고 → Phase 1 BUY
    def test_rising_trend_pipeline(self, calc, engine):
        demand1 = _accelerating()
        demand2 = _accelerating(base=50)
        inv1 = _declining()

        pmi_trend, pmi_str = calc.composite_trend_v2([(demand1, 2.0), (demand2, 1.5)])
        inv_trend, inv_str = calc.composite_trend_v2([(inv1, 1.0)])

        assert pmi_trend == "rising"
        assert inv_trend == "falling"

        result = engine.signal_3_kitchen_cycle(
            pmi_trend=pmi_trend, inventory_trend=inv_trend,
            pmi_strength=pmi_str, inventory_strength=inv_str,
        )
        assert result.status == SignalStatus.BUY
        assert "Phase 1" in result.reason
        assert 0 < result.score <= 2.0

    # IT-002: 단순화 후 — OI Ratio 없이 Phase 판정
    def test_phase_without_oi_ratio(self, calc, engine):
        demand = _accelerating()
        inv = _declining()

        pmi_trend, pmi_str = calc.trend_direction_v2(demand)
        inv_trend, inv_str = calc.trend_direction_v2(inv)

        result = engine.signal_3_kitchen_cycle(
            pmi_trend=pmi_trend, inventory_trend=inv_trend,
            pmi_strength=pmi_str, inventory_strength=inv_str,
        )
        # OI Ratio transitioning 없으므로 정상 Phase 판정
        assert result.status in (SignalStatus.BUY, SignalStatus.SELL, SignalStatus.WAIT)

    # IT-003: OI Ratio proxy → signal 전달
    def test_oi_ratio_proxy_to_signal(self, calc, engine):
        demand = _make_series([100 + i * 5 for i in range(24)])
        inventory = _make_series([100 + i * 1 for i in range(24)])

        oi_ratio = calc.oi_ratio_proxy(demand, inventory)
        assert oi_ratio is not None
        assert oi_ratio > 1.0

    # IT-004: 전체 시그널 점수 계산
    def test_overall_score_with_kitchen_v2(self, calc, engine):
        demand = _accelerating()
        inv = _declining()

        pmi_trend, pmi_str = calc.composite_trend_v2([(demand, 1.0)])
        inv_trend, inv_str = calc.composite_trend_v2([(inv, 1.0)])

        signals = [
            engine.signal_1_dca(),
            engine.signal_3_kitchen_cycle(
                pmi_trend=pmi_trend, inventory_trend=inv_trend,
                pmi_strength=pmi_str, inventory_strength=inv_str,
            ),
        ]
        score, verdict = engine.calculate_overall(signals)
        assert isinstance(score, float)
        assert isinstance(verdict, SignalVerdict)


class TestEdgeCases:
    """@requirement EDGE-001~004"""

    # IT-005: 단일 재고 소스
    def test_single_inventory_source(self, calc, engine):
        isratio = _declining(base=1.4)
        demand = _accelerating()

        inv_trend, inv_str = calc.composite_trend_v2([(isratio, 1.0)])
        pmi_trend, pmi_str = calc.composite_trend_v2([(demand, 1.0)])

        if pmi_trend and inv_trend:
            result = engine.signal_3_kitchen_cycle(
                pmi_trend=pmi_trend, inventory_trend=inv_trend,
                pmi_strength=pmi_str, inventory_strength=inv_str,
            )
            assert result.status in (SignalStatus.BUY, SignalStatus.SELL, SignalStatus.WAIT)

    # IT-006: 모든 지표 횡보
    def test_all_flat_indicators(self, calc, engine):
        rng = np.random.RandomState(42)
        flat = _make_series([100 + rng.normal(0, 0.5) for _ in range(36)])

        pmi_trend, pmi_str = calc.composite_trend_v2([(flat, 1.0)])
        inv_trend, inv_str = calc.composite_trend_v2([(flat, 1.0)])

        result = engine.signal_3_kitchen_cycle(
            pmi_trend=pmi_trend, inventory_trend=inv_trend,
            pmi_strength=pmi_str, inventory_strength=inv_str,
        )
        assert result.status == SignalStatus.WAIT
