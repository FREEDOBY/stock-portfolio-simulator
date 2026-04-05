"""매매 시그널 판정 엔진 단위 테스트"""
import pytest
import pandas as pd
import numpy as np

from app.services.signal_engine import SignalEngine
from app.models.signal_schemas import (
    SignalResult, SignalStatus, SignalVerdict, SignalHistoryEntry,
)


@pytest.fixture
def engine():
    return SignalEngine()


# ─── 시그널 1: 적립식 매수 ───

class TestSignal1:
    # UT-001: REQ-001 - 항상 매수, 점수 +1
    def test_always_buy(self, engine):
        result = engine.signal_1_dca()
        assert result.score == 1.0
        assert result.status == SignalStatus.BUY


# ─── 시그널 2: OECD CLI MoM% ───

class TestSignal2:
    # UT-002: REQ-002 - 매수 조건: 3개월 연속 음수이며 절대값 줄어듦
    def test_buy_signal(self, engine):
        mom = pd.Series([-2.0, -1.5, -1.0], index=pd.date_range("2025-01", periods=3, freq="ME"))
        result = engine.signal_2_cli_mom(mom)
        assert result.status == SignalStatus.BUY
        assert result.score > 0

    # UT-003: REQ-002 - 양수 연속 + 둔화 → 상승 유지 (새 로직)
    def test_positive_decelerating(self, engine):
        mom = pd.Series([2.0, 1.5, 1.0], index=pd.date_range("2025-01", periods=3, freq="ME"))
        result = engine.signal_2_cli_mom(mom)
        assert result.status == SignalStatus.BUY
        assert result.score > 0

    # UT-004: REQ-002 - 대기 (조건 불충족)
    def test_wait_signal(self, engine):
        mom = pd.Series([1.0, -0.5, 0.8], index=pd.date_range("2025-01", periods=3, freq="ME"))
        result = engine.signal_2_cli_mom(mom)
        assert result.status == SignalStatus.WAIT

    # UT-005: REQ-002 - 데이터 부족
    def test_insufficient_data(self, engine):
        mom = pd.Series([1.0], index=pd.date_range("2025-01", periods=1, freq="ME"))
        result = engine.signal_2_cli_mom(mom)
        assert result.status == SignalStatus.WAIT


# ─── 시그널 3: 키친사이클 ───

class TestSignal3:
    # UT-006: REQ-003 - Phase1 수동적 재고축소 (PMI 상승 + 재고 감소)
    def test_phase1_buy(self, engine):
        result = engine.signal_3_kitchen_cycle(pmi_trend="rising", inventory_trend="falling")
        assert result.score == 2.0
        assert "Phase 1" in result.reason

    # UT-007: REQ-003 - Phase2 적극적 재고확충
    def test_phase2_hold(self, engine):
        result = engine.signal_3_kitchen_cycle(pmi_trend="rising", inventory_trend="rising")
        assert result.score == 1.0

    # UT-008: REQ-003 - Phase3 수동적 재고축적
    def test_phase3_sell_prep(self, engine):
        result = engine.signal_3_kitchen_cycle(pmi_trend="falling", inventory_trend="rising")
        assert result.score == -1.0

    # UT-009: REQ-003 - Phase4 적극적 재고감축
    def test_phase4_wait(self, engine):
        result = engine.signal_3_kitchen_cycle(pmi_trend="falling", inventory_trend="falling")
        assert result.score == -0.5  # base_score=-0.5 * default strength=1.0

    # UT-010: REQ-003 - 트렌드 None
    def test_none_trend(self, engine):
        result = engine.signal_3_kitchen_cycle(pmi_trend=None, inventory_trend=None)
        assert result.status == SignalStatus.WAIT


# ─── 시그널 4-매수: 200주선 접근 ───

class TestSignal4Buy:
    # UT-011: REQ-005 - 적극 매수 (거리 < 0%)
    def test_aggressive_buy(self, engine):
        result = engine.signal_4_buy_sma200(distance_pct=-5.0)
        assert result.score == 2.0

    # UT-012: REQ-005 - 매수 준비 (0~10%)
    def test_buy_ready(self, engine):
        result = engine.signal_4_buy_sma200(distance_pct=5.0)
        assert result.score == 1.0

    # UT-013: REQ-005 - 관심 (10~30%)
    def test_interest(self, engine):
        result = engine.signal_4_buy_sma200(distance_pct=20.0)
        assert result.score == 0.5

    # UT-014: REQ-005 - 과열 주의 (30~50%)
    def test_overheated(self, engine):
        result = engine.signal_4_buy_sma200(distance_pct=35.0)
        assert result.score == -0.5
        assert result.status == SignalStatus.SELL


# ─── 시그널 4-매도: MACD 3쌍봉 다이버전스 ───

class TestSignal4Sell:
    # UT-015: REQ-006 - 3쌍봉 하락다이버전스 → 매도
    def test_triple_divergence_sell(self, engine):
        # 주가 상승, MACD 하락
        price_peaks = [100, 110, 120]
        macd_peaks = [5.0, 4.0, 3.0]
        result = engine.signal_4_sell_macd_divergence(price_peaks, macd_peaks, elliott_count=0)
        assert result.score == -2.0
        assert result.status == SignalStatus.SELL

    # UT-016: REQ-006 - 2개만 → 주의
    def test_double_divergence_caution(self, engine):
        price_peaks = [100, 110]
        macd_peaks = [5.0, 4.0]
        result = engine.signal_4_sell_macd_divergence(price_peaks, macd_peaks, elliott_count=0)
        assert result.score == -1.0

    # UT-017: REQ-012 - 엘리엇 3회 + MACD 다이버전스 → 매도 확정
    def test_elliott_plus_divergence(self, engine):
        price_peaks = [100, 110]
        macd_peaks = [5.0, 4.0]
        result = engine.signal_4_sell_macd_divergence(price_peaks, macd_peaks, elliott_count=3)
        assert result.score == -2.0

    # UT-018: REQ-006 - 다이버전스 없음
    def test_no_divergence(self, engine):
        price_peaks = [100, 110, 120]
        macd_peaks = [3.0, 4.0, 5.0]  # MACD도 상승 → 다이버전스 없음
        result = engine.signal_4_sell_macd_divergence(price_peaks, macd_peaks, elliott_count=0)
        assert result.score == 0.0


# ─── 시그널 5: MACD 쌍바닥 + RSI ───

class TestSignal5:
    # UT-019: REQ-007 - 쌍바닥 상승 다이버전스
    def test_double_bottom_divergence(self, engine):
        price_troughs = [100, 90]   # 주가 하락
        macd_troughs = [-5.0, -3.0]  # MACD 상승
        result = engine.signal_5_macd_bottom_rsi(price_troughs, macd_troughs, rsi_value=35)
        assert result.score == 2.0
        assert result.status == SignalStatus.BUY

    # UT-020: REQ-007 - RSI <= 25 극과매도
    def test_rsi_extreme_oversold(self, engine):
        result = engine.signal_5_macd_bottom_rsi([], [], rsi_value=22)
        assert result.score == 1.5

    # UT-021: REQ-007 - RSI <= 30 과매도
    def test_rsi_oversold(self, engine):
        result = engine.signal_5_macd_bottom_rsi([], [], rsi_value=28)
        assert result.score == 0.5

    # UT-022: REQ-007 - 조건 없음
    def test_no_signal(self, engine):
        result = engine.signal_5_macd_bottom_rsi([], [], rsi_value=50)
        assert result.score == 0.0


# ─── 시그널 6: 계단식법 ───

class TestSignal6:
    # UT-023: REQ-008 - 하락기 + Drawdown -40% → 3단계
    def test_step3(self, engine):
        result = engine.signal_6_staircase(drawdown_pct=-42, kitchen_phase=4)
        assert result.score == 2.0

    # UT-024: REQ-008 - 하락기 + Drawdown -20% → 1단계
    def test_step1(self, engine):
        result = engine.signal_6_staircase(drawdown_pct=-22, kitchen_phase=3)
        assert result.score == 1.0

    # UT-025: REQ-008 - 상승기에서는 비활성
    def test_inactive_in_bull(self, engine):
        result = engine.signal_6_staircase(drawdown_pct=-25, kitchen_phase=1)
        assert result.score == 0.0

    # UT-026: REQ-008 - Drawdown > -15% → 0
    def test_no_drawdown(self, engine):
        result = engine.signal_6_staircase(drawdown_pct=-10, kitchen_phase=4)
        assert result.score == 0.0


# ─── 종합 점수 ───

class TestOverallVerdict:
    # UT-027: REQ-009 - 종합 점수 계산 + 판정
    def test_overall_score_aggressive_buy(self, engine):
        signals = [
            SignalResult(signal_id=1, name="DCA", score=1.0, weight=0.5, status=SignalStatus.BUY, reason=""),
            SignalResult(signal_id=2, name="CLI", score=1.5, weight=1.5, status=SignalStatus.BUY, reason=""),
            SignalResult(signal_id=3, name="Kitchen", score=2.0, weight=2.0, status=SignalStatus.BUY, reason=""),
            SignalResult(signal_id=4, name="SMA200", score=1.0, weight=2.0, status=SignalStatus.BUY, reason=""),
            SignalResult(signal_id=5, name="MACD Bot", score=0.0, weight=1.5, status=SignalStatus.WAIT, reason=""),
            SignalResult(signal_id=6, name="Staircase", score=0.0, weight=1.0, status=SignalStatus.WAIT, reason=""),
        ]
        score, verdict = engine.calculate_overall(signals)
        assert score > 0.6
        assert verdict == SignalVerdict.AGGRESSIVE_BUY

    # UT-028: REQ-009 - 매도 판정
    def test_overall_score_sell(self, engine):
        signals = [
            SignalResult(signal_id=1, name="DCA", score=1.0, weight=0.5, status=SignalStatus.BUY, reason=""),
            SignalResult(signal_id=2, name="CLI", score=-1.5, weight=1.5, status=SignalStatus.SELL, reason=""),
            SignalResult(signal_id=3, name="Kitchen", score=-1.0, weight=2.0, status=SignalStatus.SELL, reason=""),
            SignalResult(signal_id=4, name="SMA200", score=-2.0, weight=2.0, status=SignalStatus.SELL, reason=""),
            SignalResult(signal_id=5, name="MACD Bot", score=0.0, weight=1.5, status=SignalStatus.WAIT, reason=""),
            SignalResult(signal_id=6, name="Staircase", score=0.0, weight=1.0, status=SignalStatus.WAIT, reason=""),
        ]
        score, verdict = engine.calculate_overall(signals)
        assert score < -0.6
        assert verdict == SignalVerdict.SELL


# ─── CLI 교차검증 ───

class TestCLICrossValidation:
    # UT-031: REQ-004 - 상승 가속
    def test_bull_accelerating(self, engine):
        result = engine.cli_cross_validate(cli_value=101.0, mom=0.3, acceleration=0.1)
        assert "상승 가속" in result

    # UT-032: REQ-004 - 상승 감속
    def test_bull_decelerating(self, engine):
        result = engine.cli_cross_validate(cli_value=101.0, mom=0.3, acceleration=-0.1)
        assert "상승 감속" in result

    # UT-033: REQ-004 - 하락 시작
    def test_decline_start(self, engine):
        result = engine.cli_cross_validate(cli_value=101.0, mom=-0.2, acceleration=-0.1)
        assert "하락 시작" in result

    # UT-034: REQ-004 - 하락 가속
    def test_decline_accelerating(self, engine):
        result = engine.cli_cross_validate(cli_value=99.0, mom=-0.5, acceleration=-0.2)
        assert "하락 가속" in result

    # UT-035: REQ-004 - 하락 감속 (매수 준비)
    def test_decline_decelerating(self, engine):
        result = engine.cli_cross_validate(cli_value=99.0, mom=-0.3, acceleration=0.1)
        assert "하락 감속" in result

    # UT-036: REQ-004 - 회복 시작 (매수)
    def test_recovery_start(self, engine):
        result = engine.cli_cross_validate(cli_value=99.0, mom=0.1, acceleration=0.05)
        assert "회복 시작" in result

    # UT-037: REQ-004 - 데이터 없음
    def test_none_data(self, engine):
        result = engine.cli_cross_validate(cli_value=None, mom=None, acceleration=None)
        assert result is None


# ─── 시그널 스키마 ───

class TestSchemas:
    # UT-029: REQ-011 - SignalResult 스키마
    def test_signal_result_schema(self):
        r = SignalResult(
            signal_id=1, name="DCA", score=1.0, weight=0.5,
            status=SignalStatus.BUY, reason="항상 매수"
        )
        assert r.signal_id == 1
        assert r.status == SignalStatus.BUY

    # UT-030: REQ-010 - SignalHistoryEntry 스키마
    def test_history_entry_schema(self):
        e = SignalHistoryEntry(
            date="2026-01-15", signal_id=4,
            prev_status=SignalStatus.WAIT, new_status=SignalStatus.SELL,
            reason="MACD 3쌍봉 하락다이버전스"
        )
        assert e.signal_id == 4
        assert e.new_status == SignalStatus.SELL
