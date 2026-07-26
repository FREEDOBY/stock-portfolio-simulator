"""베어장 위험 스코어 엔진 단위 테스트"""
import numpy as np
import pandas as pd
import pytest

from app.services.bear_market_risk import BearMarketRiskEngine


@pytest.fixture
def engine():
    return BearMarketRiskEngine()


def _monthly(values, start="2020-01"):
    return pd.Series(values, index=pd.date_range(start, periods=len(values), freq="ME"), dtype=float)


def _flat_inputs(months=36):
    """전 축이 조용한 기준 입력 (점등 없음)"""
    n = months
    return {
        "fedfunds": _monthly([1.0] * n),
        "m2": _monthly(list(np.linspace(100, 100 * 1.06 ** (n / 12), n))),   # YoY ≈ +6%
        "cpi": _monthly(list(np.linspace(100, 100 * 1.02 ** (n / 12), n))),  # YoY ≈ +2%
        "t10y2y": _monthly([1.5] * n),
        "baa10y": _monthly([1.8] * n),
        "bank": _monthly([5.0] * n),
        "card": pd.Series([2.0] * (n // 3), index=pd.date_range("2020-03", periods=n // 3, freq="QE")),
        "ncbcel": _monthly([20_000_000.0] * n),   # 백만달러
        "gdp": _monthly([25_000.0] * n),          # 십억달러
        "vix": _monthly([18.0] * n),
        "nasdaq_weekly": pd.Series(
            [10000.0] * (n * 4), index=pd.date_range("2020-01-03", periods=n * 4, freq="W-FRI")),
    }


class TestAxisTriggers:
    """합성 시리즈로 축별 신호 점등"""

    # UT-101: 연준 인상 사이클 점등
    def test_hike_cycle_triggered(self, engine):
        inputs = _flat_inputs()
        inputs["fedfunds"] = _monthly(list(np.linspace(0.25, 4.5, 36)))  # 12개월 +1%p 이상
        result = engine.evaluate(inputs)
        tight = next(a for a in result["axes"] if a["key"] == "tightening")
        hike = next(s for s in tight["signals"] if s["key"] == "hike_cycle")
        assert hike["status"] == "점등"
        assert hike["points"] == 30

    # UT-102: M2 YoY 마이너스 → 만점
    def test_m2_negative(self, engine):
        inputs = _flat_inputs()
        inputs["m2"] = _monthly(list(np.linspace(100, 95, 36)))  # 감소
        result = engine.evaluate(inputs)
        tight = next(a for a in result["axes"] if a["key"] == "tightening")
        m2 = next(s for s in tight["signals"] if s["key"] == "m2_squeeze")
        assert m2["points"] == 25

    # UT-103: Baa 스프레드 레벨·확대 동시 점등
    def test_credit_spread(self, engine):
        inputs = _flat_inputs()
        inputs["baa10y"] = _monthly([1.8] * 24 + list(np.linspace(2.5, 5.5, 12)))
        result = engine.evaluate(inputs)
        credit = next(a for a in result["axes"] if a["key"] == "credit")
        by_key = {s["key"]: s for s in credit["signals"]}
        assert by_key["spread_level"]["points"] == 30      # 5.5 >= 4.5
        assert by_key["spread_widening"]["points"] == 20   # 6개월 저점 대비 +0.5%p 이상
        assert credit["score"] is not None and credit["score"] >= 35

    # UT-104: 쇼크축 — 낙폭 + 40주선 이탈
    def test_shock_breakdown(self, engine):
        inputs = _flat_inputs()
        weekly = [10000.0] * 112 + list(np.linspace(10000, 7000, 44))  # -30% 하락 (156주 = 36개월)
        inputs["nasdaq_weekly"] = pd.Series(
            weekly, index=pd.date_range("2020-01-03", periods=len(weekly), freq="W-FRI"))
        inputs["vix"] = _monthly([18.0] * 33 + [35.0] * 3)
        result = engine.evaluate(inputs)
        shock = next(a for a in result["axes"] if a["key"] == "shock")
        by_key = {s["key"]: s for s in shock["signals"]}
        assert by_key["below_40w"]["points"] == 30
        assert by_key["drawdown"]["points"] == 30       # -30% <= -20%
        assert by_key["vix_spike"]["points"] == 15
        assert shock["state_label"] == "이탈"

    # UT-105: 조용한 입력 → 전 축 낮은 점수
    def test_quiet_baseline(self, engine):
        result = engine.evaluate(_flat_inputs())
        for axis in result["axes"]:
            if axis["score"] is not None:
                assert axis["score"] < 35, f"{axis['key']} 오탐: {axis['score']}"


class TestCoverage:
    """커버리지(데이터 없음) 처리"""

    # UT-111: 스프레드 전체 결측 → credit 축 가용 배점 미달로 null
    def test_credit_null_without_spread(self, engine):
        inputs = _flat_inputs()
        inputs["baa10y"] = None
        result = engine.evaluate(inputs)
        credit = next(a for a in result["axes"] if a["key"] == "credit")
        # 남은 신호 = bank 20 + card 15 + curve 15 = 50 < 60 → 판정 보류
        assert credit["score"] is None

    # UT-112: 결측 신호는 분모에서 제외 (희석 없음)
    def test_no_dilution(self, engine):
        inputs = _flat_inputs()
        inputs["m2"] = None  # M2 결측 → 분모에서 제외
        inputs["fedfunds"] = _monthly(list(np.linspace(0.25, 6.0, 36)))  # hike 30 + hold(6%>4%) 15
        inputs["cpi"] = _monthly([100.0] * 36)  # CPI YoY 0% → 실질금리 +6% → 15, 인플레 압력 0/20
        result = engine.evaluate(inputs)
        tight = next(a for a in result["axes"] if a["key"] == "tightening")
        # (30+15+15+0) / (30+15+15+20) = 60/80 = 75 (M2 결측이 분모를 희석하지 않음)
        assert tight["score"] == 75.0


class TestQuarterlyPropagation:
    """분기 데이터 처리 정합"""

    # UT-121: 카드 연체율 4분기 연속 상승 — 분기 원시 계산 후 월간 전파
    def test_card_delinq_flag(self, engine):
        inputs = _flat_inputs(48)
        inputs["card"] = pd.Series(
            [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.1, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0],
            index=pd.date_range("2020-03", periods=16, freq="QE"))
        result = engine.evaluate(inputs)
        credit = next(a for a in result["axes"] if a["key"] == "credit")
        card = next(s for s in credit["signals"] if s["key"] == "card_delinq")
        assert card["points"] == 15


class TestStage:
    """행동 단계 판정 (defense > reduce > watch > normal)"""

    # UT-141: 조용한 입력 → normal
    def test_stage_normal(self, engine):
        result = engine.evaluate(_flat_inputs())
        assert result["summary"]["stage"] in ("normal", "watch")  # 버블 신호 경계 허용

    # UT-142: 단일 축 경고 → watch
    def test_stage_watch(self, engine):
        inputs = _flat_inputs()
        inputs["fedfunds"] = _monthly(list(np.linspace(0.25, 6.0, 36)))
        inputs["cpi"] = _monthly([100.0] * 36)
        result = engine.evaluate(inputs)
        assert result["summary"]["stage"] == "watch"

    # UT-143: 예측축 2개 동시 경고 → reduce
    def test_stage_reduce(self, engine):
        inputs = _flat_inputs()
        inputs["fedfunds"] = _monthly(list(np.linspace(0.25, 6.0, 36)))
        inputs["cpi"] = _monthly([100.0] * 36)
        inputs["baa10y"] = _monthly([1.8] * 24 + list(np.linspace(2.5, 5.5, 12)))
        result = engine.evaluate(inputs)
        assert result["summary"]["stage"] == "reduce"

    # UT-144: 쇼크축 이탈 → defense (예측축과 무관하게 최우선)
    def test_stage_defense(self, engine):
        inputs = _flat_inputs()
        weekly = [10000.0] * 112 + list(np.linspace(10000, 7000, 44))
        inputs["nasdaq_weekly"] = pd.Series(
            weekly, index=pd.date_range("2020-01-03", periods=len(weekly), freq="W-FRI"))
        inputs["vix"] = _monthly([18.0] * 33 + [35.0] * 3)
        result = engine.evaluate(inputs)
        assert result["summary"]["stage"] == "defense"

    # UT-145: history 각 행에 stage 필드 존재
    def test_history_has_stage(self, engine):
        result = engine.evaluate(_flat_inputs())
        assert all("stage" in row for row in result["history"])


class TestHistoryConsistency:
    """현재 판정과 소급 시계열의 로직 공유 (회귀 방지 핵심)"""

    # UT-131: history 마지막 행 == axes[].score
    def test_history_last_equals_current(self, engine):
        inputs = _flat_inputs()
        inputs["fedfunds"] = _monthly(list(np.linspace(0.25, 5.0, 36)))
        inputs["baa10y"] = _monthly([1.8] * 24 + list(np.linspace(2.5, 5.0, 12)))
        result = engine.evaluate(inputs)
        last = result["history"][-1]
        for axis in result["axes"]:
            assert last[axis["key"]] == axis["score"], f"{axis['key']} 불일치"

    # UT-132: validation 구조 (에피소드별 축 max·passed 필드)
    def test_validation_structure(self, engine):
        result = engine.evaluate(_flat_inputs())
        assert isinstance(result["validation"], list)
        for ep in result["validation"]:
            assert set(ep) >= {"key", "label", "peak", "expected", "axes", "passed"}

    # UT-133: reference 구조 — 하락장별 지표 스냅샷 + 현재 행
    def test_reference_structure(self, engine):
        result = engine.evaluate(_flat_inputs())
        ref = result["reference"]
        assert len(ref["columns"]) > 0
        assert all({"key", "label", "axis", "axis_label"} <= set(c) for c in ref["columns"])
        assert ref["rows"][-1]["key"] == "current"
        # 현재 행은 모든 지표 값이 채워져야 함 (합성 입력이 전 시리즈 제공)
        cur = ref["rows"][-1]["metrics"]
        col_keys = {c["key"] for c in ref["columns"]}
        assert set(cur.keys()) == col_keys
