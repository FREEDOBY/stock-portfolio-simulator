"""매매 시그널 판정 엔진 - 6개 시그널 + 종합 점수"""
import logging
from typing import Optional

import pandas as pd

from ..models.signal_schemas import (
    SignalResult,
    SignalStatus,
    SignalVerdict,
    SignalHistoryEntry,
)

logger = logging.getLogger(__name__)


class SignalEngine:
    """매매 시그널 판정"""

    # 가중치
    WEIGHTS = {
        1: 0.5,   # 적립식 매수
        2: 1.5,   # OECD CLI
        3: 2.0,   # 키친사이클
        4: 2.0,   # 200주선 + 엘리엇
        5: 1.5,   # MACD 쌍바닥
        6: 1.0,   # 계단식법
    }

    def __init__(self):
        self._history: list[SignalHistoryEntry] = []
        self._prev_states: dict[int, SignalStatus] = {}

    # ─── 시그널 1: 적립식 매수 ───

    def signal_1_dca(self) -> SignalResult:
        """@implements REQ-001 - 항상 매수"""
        return SignalResult(
            signal_id=1, name="적립식 매수", score=1.0,
            weight=self.WEIGHTS[1], status=SignalStatus.BUY,
            reason="매달 정기 매수 리마인더",
        )

    # ─── 시그널 2: OECD CLI MoM% ───

    def signal_2_cli_mom(self, mom_series: pd.Series) -> SignalResult:
        """@implements REQ-002 - CLI MoM% 3개월 연속 패턴"""
        if len(mom_series) < 3:
            return SignalResult(
                signal_id=2, name="OECD CLI", score=0.0,
                weight=self.WEIGHTS[2], status=SignalStatus.WAIT,
                reason="데이터 부족",
            )

        last3 = mom_series.dropna().tail(3)
        if len(last3) < 3:
            return SignalResult(
                signal_id=2, name="OECD CLI", score=0.0,
                weight=self.WEIGHTS[2], status=SignalStatus.WAIT,
                reason="유효 데이터 부족",
            )

        vals = last3.values

        # 매수: 3개월 연속 음수이며 절대값 줄어듦
        if all(v < 0 for v in vals):
            abs_vals = [abs(v) for v in vals]
            if abs_vals[0] > abs_vals[1] > abs_vals[2]:
                return SignalResult(
                    signal_id=2, name="OECD CLI", score=1.5,
                    weight=self.WEIGHTS[2], status=SignalStatus.BUY,
                    reason=f"MoM% 3개월 연속 음수, 절대값 감소 ({vals[-1]:.2f}%)",
                )

        # 매도: 3개월 연속 양수이며 절대값 줄어듦
        if all(v > 0 for v in vals):
            abs_vals = [abs(v) for v in vals]
            if abs_vals[0] > abs_vals[1] > abs_vals[2]:
                return SignalResult(
                    signal_id=2, name="OECD CLI", score=-1.5,
                    weight=self.WEIGHTS[2], status=SignalStatus.SELL,
                    reason=f"MoM% 3개월 연속 양수, 절대값 감소 ({vals[-1]:.2f}%)",
                )

        return SignalResult(
            signal_id=2, name="OECD CLI", score=0.0,
            weight=self.WEIGHTS[2], status=SignalStatus.WAIT,
            reason=f"조건 불충족 (MoM%: {vals[-1]:.2f}%)",
        )

    # ─── 시그널 3: 키친사이클 ───

    def signal_3_kitchen_cycle(
        self,
        pmi_trend: Optional[str],
        inventory_trend: Optional[str],
    ) -> SignalResult:
        """@implements REQ-003 - 키친사이클 4단계 판별"""
        if pmi_trend is None or inventory_trend is None:
            return SignalResult(
                signal_id=3, name="키친사이클", score=0.0,
                weight=self.WEIGHTS[3], status=SignalStatus.WAIT,
                reason="트렌드 데이터 없음",
            )

        phase_map = {
            ("rising", "falling"): (1, 2.0, SignalStatus.BUY, "Phase 1: 수동적 재고축소 (상승 초기)"),
            ("rising", "rising"): (2, 1.0, SignalStatus.BUY, "Phase 2: 적극적 재고확충 (상승 중기)"),
            ("falling", "rising"): (3, -1.0, SignalStatus.SELL, "Phase 3: 수동적 재고축적 (하락 초기)"),
            ("falling", "falling"): (4, 0.0, SignalStatus.WAIT, "Phase 4: 적극적 재고감축 (하락 후기)"),
        }

        key = (pmi_trend, inventory_trend)
        phase, score, status, reason = phase_map.get(key, (0, 0.0, SignalStatus.WAIT, "판별 불가"))

        return SignalResult(
            signal_id=3, name="키친사이클", score=score,
            weight=self.WEIGHTS[3], status=status, reason=reason,
        )

    # ─── CLI 교차검증 ───

    def cli_cross_validate(
        self,
        cli_value: Optional[float],
        mom: Optional[float],
        acceleration: Optional[float],
    ) -> Optional[str]:
        """@implements REQ-004 - CLI 교차검증 6상태 판별

        Returns: 상태 문자열 또는 None
        """
        if cli_value is None or mom is None or acceleration is None:
            return None

        if cli_value > 100:
            if mom > 0 and acceleration > 0:
                return "상승 가속 (불장 초중반)"
            elif mom > 0 and acceleration < 0:
                return "상승 감속 (천장 접근)"
            elif mom < 0:
                return "하락 시작 (천장 통과)"
        else:  # cli_value <= 100
            if mom < 0 and acceleration < 0:
                return "하락 가속 (바닥 전)"
            elif mom < 0 and acceleration > 0:
                return "하락 감속 (바닥 접근)"
            elif mom > 0:
                return "회복 시작 (바닥 통과)"

        return None

    # ─── 시그널 4-매수: 200주선 접근 ───

    def signal_4_buy_sma200(self, distance_pct: Optional[float]) -> SignalResult:
        """@implements REQ-005 - 200주선 접근 거리% 기반"""
        if distance_pct is None:
            return SignalResult(
                signal_id=4, name="200주선 접근", score=0.0,
                weight=self.WEIGHTS[4], status=SignalStatus.WAIT,
                reason="데이터 없음",
            )

        if distance_pct < 0:
            score, reason = 2.0, f"200주선 하회 ({distance_pct:.1f}%) → 적극 매수 구간"
        elif distance_pct <= 10:
            score, reason = 1.0, f"200주선 근접 ({distance_pct:.1f}%) → 매수 준비"
        elif distance_pct <= 30:
            score, reason = 0.5, f"200주선 접근 ({distance_pct:.1f}%) → 관심"
        else:
            score, reason = 0.0, f"200주선 상회 ({distance_pct:.1f}%) → 중립"

        status = SignalStatus.BUY if score > 0 else SignalStatus.WAIT

        return SignalResult(
            signal_id=4, name="200주선 접근", score=score,
            weight=self.WEIGHTS[4], status=status, reason=reason,
        )

    # ─── 시그널 4-매도: MACD 3쌍봉 하락다이버전스 ───

    def signal_4_sell_macd_divergence(
        self,
        price_peaks: list[float],
        macd_peaks: list[float],
        elliott_count: int = 0,
    ) -> SignalResult:
        """@implements REQ-006, REQ-012 - MACD 3쌍봉 + 엘리엇"""
        divergence_count = 0

        if len(price_peaks) >= 2 and len(macd_peaks) >= 2:
            # 최근 피크들을 비교
            pairs = min(len(price_peaks), len(macd_peaks))
            for i in range(1, pairs):
                if price_peaks[i] > price_peaks[i - 1] and macd_peaks[i] < macd_peaks[i - 1]:
                    divergence_count += 1

        # 엘리엇 3회 + 다이버전스 → 매도 확정
        if elliott_count >= 3 and divergence_count >= 1:
            return SignalResult(
                signal_id=4, name="MACD 다이버전스", score=-2.0,
                weight=self.WEIGHTS[4], status=SignalStatus.SELL,
                reason=f"엘리엇 5파 {elliott_count}회 + MACD 다이버전스 → 매도 확정",
            )

        if divergence_count >= 2:  # 3쌍봉 = 2번의 연속 하락
            return SignalResult(
                signal_id=4, name="MACD 다이버전스", score=-2.0,
                weight=self.WEIGHTS[4], status=SignalStatus.SELL,
                reason=f"3쌍봉 하락다이버전스 감지 ({divergence_count + 1}개 피크)",
            )
        elif divergence_count == 1:
            return SignalResult(
                signal_id=4, name="MACD 다이버전스", score=-1.0,
                weight=self.WEIGHTS[4], status=SignalStatus.WAIT,
                reason="2쌍봉 하락다이버전스 → 주의",
            )

        return SignalResult(
            signal_id=4, name="MACD 다이버전스", score=0.0,
            weight=self.WEIGHTS[4], status=SignalStatus.WAIT,
            reason="다이버전스 없음",
        )

    # ─── 시그널 5: MACD 쌍바닥 + RSI ───

    def signal_5_macd_bottom_rsi(
        self,
        price_troughs: list[float],
        macd_troughs: list[float],
        rsi_value: Optional[float] = None,
    ) -> SignalResult:
        """@implements REQ-007 - 쌍바닥 상승다이버전스 + RSI"""
        # 쌍바닥 상승 다이버전스 확인
        if len(price_troughs) >= 2 and len(macd_troughs) >= 2:
            if price_troughs[-1] < price_troughs[-2] and macd_troughs[-1] > macd_troughs[-2]:
                return SignalResult(
                    signal_id=5, name="MACD 쌍바닥", score=2.0,
                    weight=self.WEIGHTS[5], status=SignalStatus.BUY,
                    reason="쌍바닥 상승 다이버전스 감지",
                )

        # RSI 독립 조건
        if rsi_value is not None:
            if rsi_value <= 25:
                return SignalResult(
                    signal_id=5, name="RSI 극과매도", score=1.5,
                    weight=self.WEIGHTS[5], status=SignalStatus.BUY,
                    reason=f"RSI {rsi_value:.1f} → 극과매도",
                )
            elif rsi_value <= 30:
                return SignalResult(
                    signal_id=5, name="RSI 과매도", score=0.5,
                    weight=self.WEIGHTS[5], status=SignalStatus.BUY,
                    reason=f"RSI {rsi_value:.1f} → 과매도",
                )

        return SignalResult(
            signal_id=5, name="MACD 쌍바닥/RSI", score=0.0,
            weight=self.WEIGHTS[5], status=SignalStatus.WAIT,
            reason="시그널 없음",
        )

    # ─── 시그널 6: 계단식법 ───

    def signal_6_staircase(
        self,
        drawdown_pct: Optional[float],
        kitchen_phase: Optional[int],
    ) -> SignalResult:
        """@implements REQ-008 - 계단식법 (하락기 전용)"""
        # Phase 3, 4 (하락기)에서만 활성화
        if kitchen_phase not in (3, 4):
            return SignalResult(
                signal_id=6, name="계단식법", score=0.0,
                weight=self.WEIGHTS[6], status=SignalStatus.WAIT,
                reason="상승기 → 비활성",
            )

        if drawdown_pct is None:
            return SignalResult(
                signal_id=6, name="계단식법", score=0.0,
                weight=self.WEIGHTS[6], status=SignalStatus.WAIT,
                reason="Drawdown 데이터 없음",
            )

        if drawdown_pct <= -40:
            score, reason = 2.0, f"Drawdown {drawdown_pct:.1f}% → 3단계 매수"
        elif drawdown_pct <= -30:
            score, reason = 1.5, f"Drawdown {drawdown_pct:.1f}% → 2단계 매수"
        elif drawdown_pct <= -20:
            score, reason = 1.0, f"Drawdown {drawdown_pct:.1f}% → 1단계 매수"
        elif drawdown_pct <= -15:
            score, reason = 0.5, f"Drawdown {drawdown_pct:.1f}% → 준비"
        else:
            score, reason = 0.0, f"Drawdown {drawdown_pct:.1f}% → 대기"

        status = SignalStatus.BUY if score > 0 else SignalStatus.WAIT

        return SignalResult(
            signal_id=6, name="계단식법", score=score,
            weight=self.WEIGHTS[6], status=status, reason=reason,
        )

    # ─── 종합 점수 ───

    def calculate_overall(
        self,
        signals: list[SignalResult],
    ) -> tuple[float, SignalVerdict]:
        """@implements REQ-009 - 종합 점수 가중합산 + 5단계 판정"""
        total_weighted = sum(s.score * s.weight for s in signals)
        total_weight = sum(s.weight for s in signals)

        if total_weight == 0:
            return 0.0, SignalVerdict.HOLD

        score = total_weighted / total_weight

        # 점수 → 판정
        if score >= 0.6:
            verdict = SignalVerdict.AGGRESSIVE_BUY
        elif score >= 0.2:
            verdict = SignalVerdict.BUY
        elif score >= -0.2:
            verdict = SignalVerdict.HOLD
        elif score >= -0.6:
            verdict = SignalVerdict.CAUTION
        else:
            verdict = SignalVerdict.SELL

        return round(score, 4), verdict


# 싱글톤
signal_engine = SignalEngine()
