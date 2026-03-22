"""침체 경고 시스템 - 8개 선행지표 가중 합산"""
import logging
from enum import Enum
from typing import Optional

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


class WarningLevel(str, Enum):
    NORMAL = "normal"      # Level 0: 0~15%
    CAUTION = "caution"    # Level 1: 15~35%
    WARNING = "warning"    # Level 2: 35~60%
    DANGER = "danger"      # Level 3: 60%+


# 지표별 가중치
INDICATOR_WEIGHTS = {
    # 균열 지표 (선행)
    "yield_curve_inversion": 3.0,
    "bank_lending": 2.5,
    "temp_employment": 2.5,
    "credit_delinquency": 2.0,
    "cli_decline": 2.0,
    "hy_spread": 1.5,
    "sahm_rule": 1.5,
    "yield_curve_uninversion": 1.0,
    # 과열 지표
    "buffett_overvalued": 1.5,
    "sma200_overextended": 1.0,
    "fed_rate_high": 1.5,
}

TOTAL_WEIGHT = sum(INDICATOR_WEIGHTS.values())  # 20.0


class RecessionWarningEngine:
    """경기침체 경고 엔진 - 8개 선행지표 기반"""

    def check_yield_curve_inversion(self, t10y2y: Optional[pd.Series]) -> dict:
        """수익률 곡선 역전: T10Y2Y < 0"""
        name = "수익률 곡선 역전"
        weight = INDICATOR_WEIGHTS["yield_curve_inversion"]

        if t10y2y is None or t10y2y.empty:
            return {"id": "yield_curve_inversion", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 없음"}

        last = float(t10y2y.iloc[-1])
        triggered = bool(last < 0)

        return {
            "id": "yield_curve_inversion",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(last, 3),
            "detail": f"10Y-2Y: {last:.3f}% {'(역전!)' if triggered else '(정상)'}",
        }

    def check_yield_curve_uninversion(self, t10y2y: Optional[pd.Series]) -> dict:
        """수익률 곡선 재양전: 과거 12개월 내 음수였다가 현재 양수"""
        name = "수익률 곡선 재양전"
        weight = INDICATOR_WEIGHTS["yield_curve_uninversion"]

        if t10y2y is None or len(t10y2y) < 3:
            return {"id": "yield_curve_uninversion", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 부족"}

        current = float(t10y2y.iloc[-1])
        # 최근 24개월만 확인 (과거 전체가 아닌 최근 역전만 의미 있음)
        recent = t10y2y.tail(min(len(t10y2y), 24))
        had_recent_inversion = bool((recent.iloc[:-1] < 0).any())
        triggered = bool(current > 0 and had_recent_inversion)

        return {
            "id": "yield_curve_uninversion",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(current, 3),
            "detail": f"현재 {current:.3f}%, 24개월 내 역전 {'있음 → 재양전!' if triggered else '없음'}",
        }

    def check_bank_lending(self, drtscilm: Optional[pd.Series]) -> dict:
        """은행 대출 기준 강화: DRTSCILM > 20%"""
        name = "은행 대출기준 강화"
        weight = INDICATOR_WEIGHTS["bank_lending"]

        if drtscilm is None or drtscilm.empty:
            return {"id": "bank_lending", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 없음"}

        last = float(drtscilm.iloc[-1])
        triggered = bool(last > 20)

        return {
            "id": "bank_lending",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(last, 1),
            "detail": f"강화 비율: {last:.1f}% {'(경고!)' if triggered else '(정상)'}",
        }

    def check_temp_employment(self, temphelps: Optional[pd.Series]) -> dict:
        """임시직 고용 감소: 3개월 MA가 직전 대비 하락"""
        name = "임시직 고용 감소"
        weight = INDICATOR_WEIGHTS["temp_employment"]

        if temphelps is None or len(temphelps) < 6:
            return {"id": "temp_employment", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 부족"}

        ma3 = temphelps.rolling(3).mean()
        valid = ma3.dropna()
        if len(valid) < 4:
            return {"id": "temp_employment", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "이동평균 데이터 부족"}

        # 최근 3개월 MA가 3개월 전 대비 하락
        current_ma = float(valid.iloc[-1])
        prev_ma = float(valid.iloc[-4]) if len(valid) >= 4 else float(valid.iloc[0])
        change_pct = ((current_ma - prev_ma) / prev_ma) * 100
        triggered = bool(change_pct < -1)  # 1% 이상 감소

        return {
            "id": "temp_employment",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(change_pct, 2),
            "detail": f"3개월 MA 변화: {change_pct:+.2f}% {'(감소!)' if triggered else '(안정)'}",
        }

    def check_credit_delinquency(self, drcclacbs: Optional[pd.Series]) -> dict:
        """신용카드 연체율 상승: 4분기 연속 상승"""
        name = "신용카드 연체율 상승"
        weight = INDICATOR_WEIGHTS["credit_delinquency"]

        if drcclacbs is None or len(drcclacbs) < 4:
            return {"id": "credit_delinquency", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 부족"}

        last4 = drcclacbs.tail(4).values
        consecutive_rise = bool(all(last4[i] < last4[i + 1] for i in range(len(last4) - 1)))

        return {
            "id": "credit_delinquency",
            "name": name,
            "triggered": consecutive_rise,
            "weight": weight,
            "value": round(float(last4[-1]), 2),
            "detail": f"연체율: {last4[-1]:.2f}% {'(4분기 연속 상승!)' if consecutive_rise else '(안정)'}",
        }

    def check_cli_decline(self, cli_value: Optional[float], mom: Optional[float]) -> dict:
        """CLI 하락: CLI < 100 & MoM% < 0"""
        name = "OECD CLI 하락"
        weight = INDICATOR_WEIGHTS["cli_decline"]

        if cli_value is None or mom is None:
            return {"id": "cli_decline", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 없음"}

        triggered = bool(cli_value < 100 and mom < 0)

        return {
            "id": "cli_decline",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(cli_value, 2),
            "detail": f"CLI: {cli_value:.2f}, MoM: {mom:+.2f}% {'(수축!)' if triggered else '(확장)'}",
        }

    def check_hy_spread(self, spread: Optional[float]) -> dict:
        """HY 스프레드 확대: > 4% (5%=레드라인, 4%=경고)"""
        name = "하이일드 스프레드 확대"
        weight = INDICATOR_WEIGHTS["hy_spread"]

        if spread is None:
            return {"id": "hy_spread", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 없음"}

        triggered = bool(spread > 4)

        return {
            "id": "hy_spread",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(spread, 2),
            "detail": f"스프레드: {spread:.2f}% {'(위험!)' if triggered else '(정상)'}",
        }

    def check_sahm_rule(self, sahm_value: Optional[float]) -> dict:
        """Sahm Rule 발동: >= 0.5"""
        name = "Sahm Rule 발동"
        weight = INDICATOR_WEIGHTS["sahm_rule"]

        if sahm_value is None:
            return {"id": "sahm_rule", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 없음"}

        triggered = bool(sahm_value >= 0.5)

        return {
            "id": "sahm_rule",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(sahm_value, 3),
            "detail": f"Sahm: {sahm_value:.3f} {'(발동!)' if triggered else '(정상)'}",
        }

    # ─── 과열 지표 ───

    def check_buffett_overvalued(self, buffett: Optional[float]) -> dict:
        """버핏지표 과열: > 130% (역사 평균 86%, 2007년 105%)"""
        name = "버핏지표 과열"
        weight = INDICATOR_WEIGHTS["buffett_overvalued"]

        if buffett is None:
            return {"id": "buffett_overvalued", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 없음"}

        triggered = bool(buffett > 130)

        return {
            "id": "buffett_overvalued",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(buffett, 1),
            "detail": f"버핏: {buffett:.1f}% {'(과열!)' if triggered else '(정상)'}",
        }

    def check_sma200_overextended(self, distance_pct: Optional[float]) -> dict:
        """200주선 과이격: > 25%"""
        name = "200주선 과이격"
        weight = INDICATOR_WEIGHTS["sma200_overextended"]

        if distance_pct is None:
            return {"id": "sma200_overextended", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 없음"}

        triggered = bool(distance_pct > 25)

        return {
            "id": "sma200_overextended",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(distance_pct, 1),
            "detail": f"거리: {distance_pct:+.1f}% {'(과이격!)' if triggered else '(정상)'}",
        }

    def check_fed_rate_high(self, fed_rate: Optional[float]) -> dict:
        """Fed 금리 고점 유지: > 4%"""
        name = "Fed 금리 고수준"
        weight = INDICATOR_WEIGHTS["fed_rate_high"]

        if fed_rate is None:
            return {"id": "fed_rate_high", "name": name, "triggered": False, "weight": weight, "value": None, "detail": "데이터 없음"}

        triggered = bool(fed_rate > 4)

        return {
            "id": "fed_rate_high",
            "name": name,
            "triggered": triggered,
            "weight": weight,
            "value": round(fed_rate, 2),
            "detail": f"Fed: {fed_rate:.2f}% {'(긴축!)' if triggered else '(정상)'}",
        }

    def calculate_warning_level(self, checks: list[dict]) -> tuple[float, WarningLevel]:
        """가중 합산 → 침체 확률(%) + 레벨 판정"""
        if not checks:
            return 0.0, WarningLevel.NORMAL

        total_weight = sum(c["weight"] for c in checks)
        if total_weight == 0:
            return 0.0, WarningLevel.NORMAL

        triggered_weight = sum(c["weight"] for c in checks if c["triggered"])
        score = (triggered_weight / total_weight) * 100

        if score >= 60:
            level = WarningLevel.DANGER
        elif score >= 35:
            level = WarningLevel.WARNING
        elif score >= 15:
            level = WarningLevel.CAUTION
        else:
            level = WarningLevel.NORMAL

        return round(score, 2), level

    def evaluate(self, indicators: dict) -> dict:
        """전체 평가: 8개 지표 체크 → 종합 경고"""
        checks = []

        # 1. 금리차 역전
        t10y2y = indicators.get("t10y2y")
        checks.append(self.check_yield_curve_inversion(t10y2y))

        # 2. 은행 대출 기준
        drtscilm = indicators.get("drtscilm")
        checks.append(self.check_bank_lending(drtscilm))

        # 3. 임시직 고용
        temphelps = indicators.get("temphelps")
        checks.append(self.check_temp_employment(temphelps))

        # 4. 신용카드 연체율
        drcclacbs = indicators.get("drcclacbs")
        checks.append(self.check_credit_delinquency(drcclacbs))

        # 5. CLI 하락
        checks.append(self.check_cli_decline(
            cli_value=indicators.get("cli_value"),
            mom=indicators.get("cli_mom_last"),
        ))

        # 6. HY 스프레드
        checks.append(self.check_hy_spread(indicators.get("hy_spread")))

        # 7. Sahm Rule
        checks.append(self.check_sahm_rule(indicators.get("sahm_value")))

        # 8. 금리차 재양전
        checks.append(self.check_yield_curve_uninversion(t10y2y))

        # 9. 버핏지표 과열
        checks.append(self.check_buffett_overvalued(indicators.get("buffett")))

        # 10. 200주선 과이격
        checks.append(self.check_sma200_overextended(indicators.get("distance_pct")))

        # 11. Fed 금리 고수준
        checks.append(self.check_fed_rate_high(indicators.get("fed_rate")))

        score, level = self.calculate_warning_level(checks)
        triggered_count = sum(1 for c in checks if c["triggered"])

        return {
            "score": score,
            "level": level.value,
            "triggered_count": triggered_count,
            "total_checks": len(checks),
            "checks": checks,
        }


# 싱글톤
recession_warning_engine = RecessionWarningEngine()
