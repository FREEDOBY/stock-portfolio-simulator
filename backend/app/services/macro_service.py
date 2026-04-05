"""매크로 통합 서비스 - 데이터 수집 → 지표 계산 → 시그널 판정 파이프라인"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd
import numpy as np

from .macro_data_fetcher import MacroDataFetcher, macro_data_fetcher
from .macro_calculator import MacroCalculator, macro_calculator
from .signal_engine import SignalEngine, signal_engine
from ..models.macro_schemas import SeriesDataPoint, MacroRawData
from ..models.signal_schemas import SignalResult, SignalHistoryEntry, SignalStatus
from .recession_warning import RecessionWarningEngine, recession_warning_engine

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {"business_cycle", "liquidity", "sentiment", "valuation", "technical", "labor_household"}

# 한국 표준시 (UTC+9)
KST = timezone(timedelta(hours=9))


def _get_reset_boundary() -> datetime:
    """오늘(KST) 06:00 기준 리셋 경계를 반환. 현재가 06:00 이전이면 어제 06:00."""
    now = datetime.now(KST)
    today_reset = now.replace(hour=6, minute=0, second=0, microsecond=0)
    if now < today_reset:
        today_reset -= timedelta(days=1)
    return today_reset


def _is_cache_valid(cached_at: Optional[datetime]) -> bool:
    """캐시가 KST 06:00 기준으로 아직 유효한지 확인"""
    if cached_at is None:
        return False
    return cached_at >= _get_reset_boundary()


class MacroService:
    """매크로 분석 통합 서비스"""

    def __init__(self):
        self.fetcher: MacroDataFetcher = macro_data_fetcher
        self.calc: MacroCalculator = macro_calculator
        self.engine: SignalEngine = signal_engine
        self._elliott_count: int = 0
        self._signal_history: list[dict] = []
        self._last_signals: dict[int, SignalStatus] = {}
        self.warning_engine: RecessionWarningEngine = recession_warning_engine
        # KST 06:00 일간 캐시
        self._dashboard_cache: Optional[dict] = None
        self._dashboard_cached_at: Optional[datetime] = None
        self._category_cache: dict[str, dict] = {}
        self._category_cached_at: dict[str, datetime] = {}

    def get_dashboard(self) -> dict:
        """대시보드 데이터: 종합 판정 + 카테고리 요약 + 시그널 (KST 06:00 일간 캐시)"""
        if _is_cache_valid(self._dashboard_cached_at) and self._dashboard_cache is not None:
            logger.info("Dashboard cache hit (valid until next KST 06:00)")
            return self._dashboard_cache

        raw = self.fetcher.fetch_all()

        # 파생 지표 계산
        indicators = self._compute_indicators(raw)

        # 시그널 판정
        signals = self._evaluate_signals(indicators)

        # 종합 점수
        score, verdict = self.engine.calculate_overall(signals)

        # 시그널 히스토리 업데이트
        self._update_history(signals)

        # 카테고리 요약
        categories = self._build_category_summary(indicators)

        # 침체 경고 시스템
        recession_warning = self._evaluate_recession_warning(raw, indicators)

        # 코스톨라니 달걀모델
        kostolany = self._kostolany_egg(raw, indicators)

        result = {
            "overall": {
                "score": score,
                "verdict": verdict.value,
                "signals": [s.model_dump() for s in signals],
                "history": self._signal_history[-20:],
                "updated_at": datetime.now().isoformat(),
            },
            "categories": categories,
            "recession_warning": recession_warning,
            "kostolany": kostolany,
        }

        # 캐시 저장
        self._dashboard_cache = result
        self._dashboard_cached_at = datetime.now(KST)
        logger.info("Dashboard cached (valid until next KST 06:00)")

        return result

    def get_category_detail(self, category: str) -> dict:
        """카테고리별 상세 데이터 (차트용, KST 06:00 일간 캐시)"""
        # 캐시 확인
        if category in self._category_cache and _is_cache_valid(self._category_cached_at.get(category)):
            logger.info("Category '%s' cache hit", category)
            return self._category_cache[category]

        if category == "technical":
            result = self._get_technical_detail()
            self._category_cache[category] = result
            self._category_cached_at[category] = datetime.now(KST)
            return result

        series_data = self.fetcher.fetch_category(category)
        result = {sid: sd.model_dump() for sid, sd in series_data.items()}

        # Yahoo Finance 데이터 추가 (카테고리별)
        if category == "sentiment":
            raw = self.fetcher.fetch_all()
            result["VIX"] = {"series_id": "VIX", "name": "VIX", "data": [
                {"date": p.date, "value": p.value} for p in raw.vix
            ], "status": "live"}

        if category == "liquidity":
            raw = self.fetcher.fetch_all()
            result["DXY"] = {"series_id": "DXY", "name": "Dollar Index", "data": [
                {"date": p.date, "value": p.value} for p in raw.dxy
            ], "status": "live"}

        # 캐시 저장
        self._category_cache[category] = result
        self._category_cached_at[category] = datetime.now(KST)
        logger.info("Category '%s' cached (valid until next KST 06:00)", category)

        return result

    def get_signal_history(self) -> list[dict]:
        """시그널 상태 변경 이력"""
        return self._signal_history

    def set_elliott_count(self, count: int) -> dict:
        """엘리엇 파동 수동 입력"""
        self._elliott_count = count
        return {"elliott_count": count, "status": "updated"}

    # ─── 내부 메서드 ───

    def _compute_indicators(self, raw: MacroRawData) -> dict:
        """원시 데이터 → 파생 지표"""
        indicators: dict = {}

        # OECD CLI MoM% + 가속도
        cli_data = self._series_to_pd(raw.fred_series.get("USALOLITOAASTSAM"))
        if cli_data is not None and not cli_data.empty:
            indicators["cli_mom"] = self.calc.mom_percent(cli_data)
            indicators["cli_acceleration"] = self.calc.acceleration(indicators["cli_mom"])
            indicators["cli_value"] = cli_data.iloc[-1] if len(cli_data) > 0 else None
        else:
            indicators["cli_mom"] = pd.Series([], dtype=float)
            indicators["cli_acceleration"] = pd.Series([], dtype=float)
            indicators["cli_value"] = None

        # 키친사이클 핵심 2지표: IPMAN(수요/생산) + ISRATIO(재고)
        ipman = self._series_to_pd(raw.fred_series.get("IPMAN"))
        if ipman is not None and not ipman.empty:
            pmi_trend, pmi_strength = self.calc.trend_direction_v2(ipman)
        else:
            pmi_trend, pmi_strength = None, 0.0
        indicators["pmi_trend"] = pmi_trend
        indicators["pmi_strength"] = pmi_strength

        isratio_data = self._series_to_pd(raw.fred_series.get("ISRATIO"))
        if isratio_data is not None and not isratio_data.empty:
            inv_trend, inv_strength = self.calc.trend_direction_v2(isratio_data)
        else:
            inv_trend, inv_strength = None, 0.0
        indicators["inventory_trend"] = inv_trend
        indicators["inventory_strength"] = inv_strength

        # CLI 기반 큰 방향 (1차 판별)
        cli_val = indicators.get("cli_value")
        cli_mom_series = indicators.get("cli_mom", pd.Series([], dtype=float))
        last_mom = float(cli_mom_series.dropna().iloc[-1]) if len(cli_mom_series.dropna()) > 0 else None
        indicators["cli_cycle_stage"] = self._determine_cli_stage(cli_val, last_mom)

        # 나스닥 주봉 → SMA, MACD, RSI
        nasdaq_prices = self._points_to_pd(raw.nasdaq_weekly)
        if nasdaq_prices is not None and len(nasdaq_prices) > 0:
            sma200 = self.calc.sma(nasdaq_prices, window=200)
            indicators["sma200"] = sma200.iloc[-1] if sma200.notna().any() else None
            indicators["sma50"] = self.calc.sma(nasdaq_prices, window=50).iloc[-1] if len(nasdaq_prices) >= 50 else None
            indicators["current_price"] = nasdaq_prices.iloc[-1]
            indicators["distance_pct"] = self.calc.distance_from_sma(
                float(nasdaq_prices.iloc[-1]),
                float(sma200.iloc[-1]) if pd.notna(sma200.iloc[-1]) else 0,
            ) if pd.notna(sma200.iloc[-1]) else None

            macd_l, macd_s, macd_h = self.calc.macd(nasdaq_prices)
            indicators["macd_line"] = macd_l
            indicators["macd_signal"] = macd_s
            indicators["macd_histogram"] = macd_h

            indicators["rsi"] = self.calc.rsi(nasdaq_prices)
            indicators["rsi_value"] = float(indicators["rsi"].iloc[-1]) if pd.notna(indicators["rsi"].iloc[-1]) else None

            indicators["drawdown_pct"] = self.calc.drawdown_percent(nasdaq_prices.tail(52))
            indicators["nasdaq_prices"] = nasdaq_prices  # 다이버전스 피크 추출용
        else:
            indicators.update({
                "sma200": None, "sma50": None, "current_price": None,
                "distance_pct": None, "macd_line": pd.Series([], dtype=float),
                "macd_signal": pd.Series([], dtype=float),
                "macd_histogram": pd.Series([], dtype=float),
                "rsi": pd.Series([], dtype=float), "rsi_value": None,
                "drawdown_pct": None, "nasdaq_prices": pd.Series([], dtype=float),
            })

        # M2 YoY%
        m2_data = self._series_to_pd(raw.fred_series.get("M2SL"))
        indicators["m2_yoy"] = self.calc.yoy_percent(m2_data).iloc[-1] if m2_data is not None and len(m2_data) >= 13 else None

        # CPI YoY%
        cpi_data = self._series_to_pd(raw.fred_series.get("CPIAUCSL"))
        indicators["cpi_yoy"] = float(self.calc.yoy_percent(cpi_data).iloc[-1]) if cpi_data is not None and len(cpi_data) >= 13 else None

        # 버핏지표
        wilshire = self._last_value(raw.fred_series.get("NCBCEL"))
        gdp = self._last_value(raw.fred_series.get("GDP"))
        # NCBCEL은 백만달러, GDP는 십억달러 → NCBCEL/1000으로 단위 통일
        indicators["buffett"] = self.calc.buffett_indicator(wilshire / 1000, gdp) if wilshire and gdp else None

        # VIX
        vix_prices = self._points_to_pd(raw.vix)
        indicators["vix_value"] = float(vix_prices.iloc[-1]) if vix_prices is not None and len(vix_prices) > 0 else None

        # 하이일드 스프레드
        hy = self._last_value(raw.fred_series.get("BAMLH0A0HYM2"))
        indicators["hy_spread"] = hy

        # Fed 금리
        fed = self._last_value(raw.fred_series.get("FEDFUNDS"))
        indicators["fed_rate"] = fed

        return indicators

    def _evaluate_signals(self, indicators: dict) -> list[SignalResult]:
        """지표 → 시그널 판정"""
        signals = []

        # 시그널 1
        signals.append(self.engine.signal_1_dca())

        # 시그널 2
        signals.append(self.engine.signal_2_cli_mom(
            indicators.get("cli_mom", pd.Series([], dtype=float)),
            accel_series=indicators.get("cli_acceleration"),
        ))

        # 시그널 3 키친사이클 + CLI 교차검증
        s3 = self.engine.signal_3_kitchen_cycle(
            pmi_trend=indicators.get("pmi_trend"),
            inventory_trend=indicators.get("inventory_trend"),
            pmi_strength=indicators.get("pmi_strength", 1.0),
            inventory_strength=indicators.get("inventory_strength", 1.0),
        )

        # CLI 교차검증 6상태
        cli_mom_series = indicators.get("cli_mom", pd.Series([], dtype=float))
        cli_accel_series = indicators.get("cli_acceleration", pd.Series([], dtype=float))
        last_mom = float(cli_mom_series.dropna().iloc[-1]) if len(cli_mom_series.dropna()) > 0 else None
        last_accel = float(cli_accel_series.dropna().iloc[-1]) if len(cli_accel_series.dropna()) > 0 else None
        cli_state = self.engine.cli_cross_validate(
            cli_value=indicators.get("cli_value"),
            mom=last_mom,
            acceleration=last_accel,
        )
        if cli_state:
            s3.reason += f" | CLI: {cli_state}"
        signals.append(s3)

        # 키친사이클 Phase 추출 (시그널 6용)
        kitchen_phase = None
        if "Phase 1" in s3.reason:
            kitchen_phase = 1
        elif "Phase 2" in s3.reason:
            kitchen_phase = 2
        elif "Phase 3" in s3.reason:
            kitchen_phase = 3
        elif "Phase 4" in s3.reason:
            kitchen_phase = 4

        # 시그널 4: 200주선 + MACD 다이버전스 종합
        nasdaq = indicators.get("nasdaq_prices", pd.Series([], dtype=float))
        macd_line = indicators.get("macd_line", pd.Series([], dtype=float))

        s4_sma = self.engine.signal_4_buy_sma200(indicators.get("distance_pct"))
        s4_div = self.engine.signal_4_sell_macd_divergence(
            price_peaks=self._find_peaks(nasdaq, is_max=True),
            macd_peaks=self._find_peaks(macd_line, is_max=True),
            elliott_count=self._elliott_count,
        )
        # 두 시그널 합산 (200주선 위치 + MACD 다이버전스)
        combined_score = (s4_sma.score + s4_div.score) / 2
        combined_reason = f"{s4_sma.reason} | {s4_div.reason}"
        if combined_score > 0:
            combined_status = SignalStatus.BUY
        elif combined_score < 0:
            combined_status = SignalStatus.SELL
        else:
            combined_status = SignalStatus.WAIT
        signals.append(SignalResult(
            signal_id=4, name="기술적 종합", score=round(combined_score, 1),
            weight=self.engine.WEIGHTS[4], status=combined_status,
            reason=combined_reason,
        ))

        # 시그널 5
        signals.append(self.engine.signal_5_macd_bottom_rsi(
            price_troughs=self._find_peaks(nasdaq, is_max=False),
            macd_troughs=self._find_peaks(macd_line, is_max=False),
            rsi_value=indicators.get("rsi_value"),
        ))

        # 시그널 6
        signals.append(self.engine.signal_6_staircase(
            drawdown_pct=indicators.get("drawdown_pct"),
            kitchen_phase=kitchen_phase,
        ))

        return signals

    def _update_history(self, signals: list[SignalResult]):
        """시그널 상태 변경 이력 기록"""
        now = datetime.now().strftime("%Y-%m-%d")
        for s in signals:
            prev = self._last_signals.get(s.signal_id)
            if prev is not None and prev != s.status:
                self._signal_history.append({
                    "date": now,
                    "signal_id": s.signal_id,
                    "prev_status": prev.value,
                    "new_status": s.status.value,
                    "reason": s.reason,
                })
            self._last_signals[s.signal_id] = s.status

    def _build_category_summary(self, indicators: dict) -> dict:
        """카테고리별 요약 데이터"""
        kitchen_phase = "N/A"
        pmi = indicators.get("pmi_trend", "N/A")
        inv = indicators.get("inventory_trend", "N/A")
        if pmi == "rising" and inv == "falling":
            kitchen_phase = "Phase 1"
        elif pmi == "rising" and inv == "rising":
            kitchen_phase = "Phase 2"
        elif pmi == "falling" and inv == "rising":
            kitchen_phase = "Phase 3"
        elif pmi == "falling" and inv == "falling":
            kitchen_phase = "Phase 4"

        cli_mom_val = None
        cli_mom = indicators.get("cli_mom")
        if cli_mom is not None and len(cli_mom) > 0:
            last = cli_mom.dropna()
            cli_mom_val = round(float(last.iloc[-1]), 2) if len(last) > 0 else None

        return {
            "business_cycle": {
                "status": self._business_cycle_status(kitchen_phase, cli_mom_val),
                "key_values": {
                    "phase": kitchen_phase,
                    "cli_mom": cli_mom_val,
                    "cli_stage": indicators.get("cli_cycle_stage", "N/A"),
                    "demand_trend": indicators.get("pmi_trend", "N/A"),
                    "strength": round((indicators.get("pmi_strength", 0) + indicators.get("inventory_strength", 0)) / 2, 2),
                },
            },
            "liquidity": {
                "status": self._liquidity_status(indicators),
                "key_values": {
                    "fed_rate": indicators.get("fed_rate"),
                    "m2_yoy": round(indicators["m2_yoy"], 2) if indicators.get("m2_yoy") is not None else None,
                },
            },
            "technical": {
                "status": self._technical_status(indicators),
                "key_values": {
                    "distance_pct": round(indicators["distance_pct"], 1) if indicators.get("distance_pct") is not None else None,
                    "rsi": round(indicators["rsi_value"], 1) if indicators.get("rsi_value") is not None else None,
                },
            },
            "sentiment": {
                "status": self._sentiment_status(indicators),
                "key_values": {
                    "vix": round(indicators["vix_value"], 1) if indicators.get("vix_value") is not None else None,
                    "hy_spread": indicators.get("hy_spread"),
                },
            },
            "valuation": {
                "status": self._valuation_status(indicators),
                "key_values": {
                    "buffett": round(indicators["buffett"], 1) if indicators.get("buffett") is not None else None,
                    "cpi_yoy": round(indicators["cpi_yoy"], 2) if indicators.get("cpi_yoy") is not None else None,
                },
            },
        }

    def _get_technical_detail(self) -> dict:
        """기술적 분석 상세 (Yahoo Finance 데이터 기반)"""
        raw = self.fetcher.fetch_all()
        nasdaq_prices = self._points_to_pd(raw.nasdaq_weekly)

        result = {}
        if nasdaq_prices is not None and len(nasdaq_prices) > 0:
            result["nasdaq_weekly"] = [{"date": str(idx), "value": round(float(v), 2)} for idx, v in nasdaq_prices.items()]

            sma200 = self.calc.sma(nasdaq_prices, 200)
            result["sma200"] = [{"date": str(idx), "value": round(float(v), 2)} for idx, v in sma200.dropna().items()]

            sma50 = self.calc.sma(nasdaq_prices, 50)
            result["sma50"] = [{"date": str(idx), "value": round(float(v), 2)} for idx, v in sma50.dropna().items()]

            macd_l, macd_s, macd_h = self.calc.macd(nasdaq_prices)
            result["macd"] = {
                "line": [{"date": str(idx), "value": round(float(v), 4)} for idx, v in macd_l.dropna().items()],
                "signal": [{"date": str(idx), "value": round(float(v), 4)} for idx, v in macd_s.dropna().items()],
                "histogram": [{"date": str(idx), "value": round(float(v), 4)} for idx, v in macd_h.dropna().items()],
            }

            rsi = self.calc.rsi(nasdaq_prices)
            result["rsi"] = [{"date": str(idx), "value": round(float(v), 2)} for idx, v in rsi.dropna().items()]

        return result

    def _evaluate_recession_warning(self, raw: MacroRawData, indicators: dict) -> dict:
        """침체 경고 시스템 평가"""
        warning_indicators = {
            "t10y2y": self._series_to_pd(raw.fred_series.get("T10Y2Y")),
            "drtscilm": self._series_to_pd(raw.fred_series.get("DRTSCILM")),
            "temphelps": self._series_to_pd(raw.fred_series.get("TEMPHELPS")),
            "drcclacbs": self._series_to_pd(raw.fred_series.get("DRCCLACBS")),
            "cli_value": indicators.get("cli_value"),
            "cli_mom_last": None,
            "hy_spread": indicators.get("hy_spread"),
            "sahm_value": None,
            # 과열 지표
            "buffett": indicators.get("buffett"),
            "distance_pct": indicators.get("distance_pct"),
            "fed_rate": indicators.get("fed_rate"),
        }

        # CLI MoM 마지막 값
        cli_mom = indicators.get("cli_mom", pd.Series([], dtype=float))
        if len(cli_mom.dropna()) > 0:
            warning_indicators["cli_mom_last"] = float(cli_mom.dropna().iloc[-1])

        # Sahm Rule 마지막 값
        sahm_data = self._series_to_pd(raw.fred_series.get("SAHMREALTIME"))
        if sahm_data is not None and not sahm_data.empty:
            warning_indicators["sahm_value"] = float(sahm_data.iloc[-1])

        return self.warning_engine.evaluate(warning_indicators)

    def _determine_cli_stage(self, cli_value: Optional[float], mom: Optional[float]) -> Optional[str]:
        """CLI 기반 경기 사이클 스테이지 (1차 큰 방향)"""
        if cli_value is None or mom is None:
            return None
        if cli_value > 100 and mom > 0:
            return "expansion"       # 확장기
        elif cli_value > 100 and mom < 0:
            return "peak_approach"   # 천장 접근
        elif cli_value < 100 and mom < 0:
            return "contraction"     # 수축기
        elif cli_value < 100 and mom > 0:
            return "trough_approach" # 바닥 접근/회복
        return None

    # ─── 상태 판정 ───

    def _business_cycle_status(self, kitchen_phase: str, cli_mom: float | None) -> str:
        """경기사이클 상태: CLI 스테이지 + 키친 Phase + CLI MoM 3중 판정

        1차: CLI 큰 방향 (확장/수축)
        2차: 키친 Phase (세분화)
        3차: CLI MoM (가속/감속)"""

        # Phase별 기본 판정
        if kitchen_phase == "Phase 1":
            return "bullish"       # 수요↑ 재고↓ → 상승 초기 (최적 매수)
        elif kitchen_phase == "Phase 2":
            if cli_mom is not None:
                if cli_mom < -0.1:
                    return "caution"   # 수요↑ 재고↑ + CLI 둔화 → 천장 접근
                if cli_mom < 0:
                    return "neutral"   # 아직 확장이나 감속 시작
            return "bullish"       # 수요↑ 재고↑ (확장 중기)
        elif kitchen_phase == "Phase 3":
            if cli_mom is not None and cli_mom > 0:
                return "caution"   # 수요↓ 재고↑ + CLI 반등 → 일시적?
            return "bearish"       # 수요↓ 재고↑ → 하락 초기 (매도)
        elif kitchen_phase == "Phase 4":
            if cli_mom is not None and cli_mom > 0:
                return "bullish"   # 수요↓ 재고↓ + CLI 반등 → 바닥 탈출!
            if cli_mom is not None and cli_mom > -0.1:
                return "neutral"   # 하락 감속 → 바닥 접근
            return "bearish"       # 하락 가속 중
        return "neutral"

    def _technical_status(self, indicators: dict) -> str:
        """기술적 분석 상태: 200주선 거리 + RSI 복합 판정"""
        dist = indicators.get("distance_pct")
        rsi = indicators.get("rsi_value")

        if dist is not None:
            if dist > 35:
                return "overheated"  # 극단적 과열 (닷컴급)
            if dist > 25:
                return "overvalued"  # 과열 (2007,2018,2021급)
            if dist > 15:
                return "caution"     # 과열 주의
            if dist < -10:
                return "bearish"     # 약세
            if dist < 0:
                return "fear"        # 200주선 하회

        if rsi is not None:
            if rsi > 75:
                return "overheated"
            if rsi < 25:
                return "fear"

        if dist is not None and dist > 0:
            return "bullish"

        return "neutral"

    def _valuation_status(self, indicators: dict) -> str:
        """밸류에이션 상태: 버핏지표 + CPI 복합 판정
        역사 평균 86%. 100%+ = 고평가, 130%+ = 과열, 160%+ = 극단"""
        buffett = indicators.get("buffett")
        cpi = indicators.get("cpi_yoy")

        if buffett is not None:
            if buffett > 160:
                return "overheated"  # 극도 과열 (닷컴·2021 수준)
            if buffett > 130:
                return "overvalued"  # 확실한 고평가 (2007 수준+)
            if buffett > 100:
                return "caution"     # 평균 이상, 주의 (역사 평균 86%)
            if buffett < 70:
                return "undervalued" # 저평가 → 매수 기회

        # 인플레 높으면 추가 부담
        if cpi is not None and cpi > 5:
            return "overheated"

        return "neutral"

    def _liquidity_status(self, indicators: dict) -> str:
        """유동성 상태 판정: Fed 금리 수준 우선 + M2 YoY% 보조
        역사: Fed 고점 유지가 침체 전 가장 위험 (2000: 6.5%, 2006: 5.25%, 2023: 5.33%)
        M2 음수 전환은 유동성 수축 확인"""
        m2_yoy = indicators.get("m2_yoy")
        fed_rate = indicators.get("fed_rate")

        # Fed 금리 수준 우선 체크
        if fed_rate is not None:
            if fed_rate > 5:
                return "overheated"    # 극단 긴축 (2000, 2006-07, 2023 수준)
            if fed_rate > 4:
                return "bearish"       # 강한 긴축
            if fed_rate > 3:
                return "caution"       # 긴축 중

        # M2 체크 (보조)
        if m2_yoy is not None:
            if m2_yoy < -2:
                return "fear"          # M2 수축 (2023: -4.6% → 역사상 최초)
            if m2_yoy < 0:
                return "bearish"       # M2 감소
            if m2_yoy > 15:
                return "overheated"    # M2 과잉 팽창 (2020-21: 27%)

        # 저금리 + M2 양수 → 유동성 확장
        if fed_rate is not None and fed_rate < 2 and m2_yoy is not None and m2_yoy > 3:
            return "bullish"

        return "neutral"

    def _sentiment_status(self, indicators: dict) -> str:
        """시장 심리 상태 판정: VIX + HY 스프레드 기반
        VIX: 13-19 정상, 20+ 스트레스, 30+ 공포, <12 과도한 낙관
        HY: <3.5 낙관, 4+ 경계, 5+ 위험"""
        vix = indicators.get("vix_value")
        hy = indicators.get("hy_spread")

        # VIX 극단값 우선 체크
        if vix is not None:
            if vix > 30:
                return "fear"           # 공포 (2018, 2020, 2022)
            if vix > 20:
                return "bearish"        # 스트레스 시작
            if vix < 12:
                return "overheated"     # 과도한 낙관 = 역으로 위험

        # HY 스프레드
        if hy is not None:
            if hy > 5:
                return "fear"           # 신용 위기 (역사적 레드라인 500bp)
            if hy > 4:
                return "bearish"        # 신용 스트레스
            if hy < 3:
                return "caution"        # 지나친 낙관 = 과열 가능

        if vix is not None and vix < 15:
            return "bullish"

        return "neutral"

    # ─── 코스톨라니 달걀모델 ───

    def _kostolany_egg(self, raw: MacroRawData, indicators: dict) -> dict:
        """코스톨라니 달걀모델 위치 판정

        축 1: 금리 방향 (FEDFUNDS 6개월 변화) → 인하=A국면, 인상=B국면
        축 2: 심리 극단 (VIX) → 공포=비관, 낮음=낙관

        ┌───────────────┬──────────┬──────────┬──────────┐
        │               │ VIX 높음 │ VIX 보통 │ VIX 낮음 │
        │ 금리 인하 중   │ A1 매집  │ A2 동행  │ A3 과열  │
        │ 금리 인상 중   │ B3 과매도│ B2 동행↓ │ B1 분배  │
        └───────────────┴──────────┴──────────┴──────────┘
        """
        # 축 1: 금리 수준 — Fed 중립금리(~2.5~3.0%) 기준
        # >3.0% = 긴축 (유동성 제한), <3.0% = 완화 (유동성 확장)
        fed_rate = indicators.get("fed_rate")
        monetary = "tight"  # "tight", "loose"
        if fed_rate is not None and fed_rate < 3.0:
            monetary = "loose"

        # 축 2: VIX 수준 — 역사적 백분위 기준 (1990~ 분포)
        # >20 = 공포 (상위 25%), 14~20 = 중립 (중앙), <14 = 탐욕 (하위 25%)
        vix = indicators.get("vix_value")
        sentiment = "neutral"  # "fear", "neutral", "greed"
        if vix is not None:
            if vix > 20:
                sentiment = "fear"
            elif vix < 14:
                sentiment = "greed"

        # 6단계 매핑
        phase_map = {
            ("tight",  "fear"):    "B2",  # 긴축 + 공포 → 하락 동행
            ("tight",  "neutral"): "B1",  # 긴축 + 중립 → 분배 (스마트머니 매도)
            ("tight",  "greed"):   "A3",  # 긴축 + 탐욕 → 과열 (금리 높은데 낙관 = 위험)
            ("loose",  "fear"):    "A1",  # 완화 + 공포 → 매집 (최적 매수)
            ("loose",  "neutral"): "A2",  # 완화 + 중립 → 동행 (상승 중)
            ("loose",  "greed"):   "A3",  # 완화 + 탐욕 → 과열 (버블)
        }
        phase = phase_map.get((monetary, sentiment), "A2")

        phase_info = {
            "A1": {"name": "매집", "desc": "바닥 근처. 확신파만 매수. 최적 매수 시점.",
                    "action": "적극 매수", "color": "#10b981"},
            "A2": {"name": "동행", "desc": "상승 중. 펀더멘탈 개선이 가격에 반영.",
                    "action": "보유/매수", "color": "#06b6d4"},
            "A3": {"name": "과열", "desc": "모두가 낙관. 부화뇌동파 대거 진입.",
                    "action": "차익실현", "color": "#f59e0b"},
            "B1": {"name": "분배", "desc": "고점. 확신파가 매도 시작.",
                    "action": "매도", "color": "#f97316"},
            "B2": {"name": "동행하락", "desc": "하락 지속. 부정적 뉴스 연속.",
                    "action": "관망", "color": "#ef4444"},
            "B3": {"name": "과매도", "desc": "극심한 비관. 투매. 바닥 근접.",
                    "action": "관망/분할매수", "color": "#a78bfa"},
        }

        info = phase_info[phase]
        return {
            "phase": phase,
            "name": info["name"],
            "desc": info["desc"],
            "action": info["action"],
            "color": info["color"],
            "inputs": {
                "monetary": monetary,
                "fed_rate": round(fed_rate, 2) if fed_rate is not None else None,
                "vix": round(vix, 1) if vix is not None else None,
                "sentiment": sentiment,
            },
        }

    # ─── 유틸 ───

    def _series_to_pd(self, series_data) -> Optional[pd.Series]:
        """SeriesData → pd.Series"""
        if series_data is None or not series_data.data:
            return None
        dates = [d.date for d in series_data.data]
        values = [d.value for d in series_data.data]
        return pd.Series(values, index=pd.to_datetime(dates), dtype=float)

    def _points_to_pd(self, points: list) -> Optional[pd.Series]:
        """SeriesDataPoint list → pd.Series"""
        if not points:
            return None
        dates = [p.date if isinstance(p, SeriesDataPoint) else p["date"] for p in points]
        values = [p.value if isinstance(p, SeriesDataPoint) else p["value"] for p in points]
        return pd.Series(values, index=pd.to_datetime(dates), dtype=float)

    def _last_value(self, series_data) -> Optional[float]:
        """SeriesData에서 마지막 값 추출"""
        if series_data is None or not series_data.data:
            return None
        return series_data.data[-1].value

    def debug_kitchin_cycle(self) -> dict:
        """키친사이클 디버그: 각 지표 트렌드 상세 출력"""
        raw = self.fetcher.fetch_all()

        # 수요 지표 개별 분석
        demand_series = {
            "DGORDER": self._series_to_pd(raw.fred_series.get("DGORDER")),
            "NEWORDER": self._series_to_pd(raw.fred_series.get("NEWORDER")),
            "ACDGNO": self._series_to_pd(raw.fred_series.get("ACDGNO")),
            "IPMAN": self._series_to_pd(raw.fred_series.get("IPMAN")),
            "PERMIT": self._series_to_pd(raw.fred_series.get("PERMIT")),
        }

        demand_details = {}
        for name, s in demand_series.items():
            if s is not None and not s.empty:
                direction, strength = self.calc.trend_direction_v2(s)
                yoy = self.calc.yoy_percent(s)
                yoy_last6 = [round(float(v), 2) for v in yoy.dropna().tail(6).values]
                # 기울기 계산
                yoy_tail = yoy.dropna().tail(6)
                slope = None
                if len(yoy_tail) >= 4:
                    x = np.arange(len(yoy_tail))
                    slope = round(float(np.polyfit(x, yoy_tail.values, 1)[0]), 3)
                demand_details[name] = {
                    "direction": direction,
                    "strength_r2": round(strength, 3),
                    "yoy_last6": yoy_last6,
                    "slope_per_month": slope,
                    "data_points": len(s),
                }
            else:
                demand_details[name] = {"direction": None, "error": "데이터 없음"}

        # 복합 수요 트렌드
        composite_inputs = [
            (demand_series["DGORDER"], 2.0),
            (demand_series["NEWORDER"], 2.0),
            (demand_series["ACDGNO"], 1.5),
            (demand_series["IPMAN"], 1.0),
            (demand_series["PERMIT"], 1.0),
        ]
        valid_inputs = [(s, w) for s, w in composite_inputs if s is not None and not s.empty]
        pmi_trend, pmi_str = self.calc.composite_trend_v2(valid_inputs)

        # 재고 지표 개별 분석
        isratio = self._series_to_pd(raw.fred_series.get("ISRATIO"))
        businv = self._series_to_pd(raw.fred_series.get("BUSINV"))

        inv_details = {}
        for name, s in [("ISRATIO", isratio), ("BUSINV", businv)]:
            if s is not None and not s.empty:
                direction, strength = self.calc.trend_direction_v2(s)
                yoy = self.calc.yoy_percent(s)
                yoy_last6 = [round(float(v), 2) for v in yoy.dropna().tail(6).values]
                yoy_tail = yoy.dropna().tail(6)
                slope = None
                if len(yoy_tail) >= 4:
                    x = np.arange(len(yoy_tail))
                    slope = round(float(np.polyfit(x, yoy_tail.values, 1)[0]), 3)
                inv_details[name] = {
                    "direction": direction,
                    "strength_r2": round(strength, 3),
                    "yoy_last6": yoy_last6,
                    "slope_per_month": slope,
                    "data_points": len(s),
                }
            else:
                inv_details[name] = {"direction": None, "error": "데이터 없음"}

        # 복합 재고 트렌드
        inv_inputs = []
        if isratio is not None and not isratio.empty:
            inv_inputs.append((isratio, 1.5))
        if businv is not None and not businv.empty:
            inv_inputs.append((businv, 1.0))
        inv_trend, inv_str = self.calc.composite_trend_v2(inv_inputs) if inv_inputs else (None, 0.0)

        # OI Ratio
        dgorder = demand_series.get("DGORDER")
        oi_ratio = None
        oi_debug = {}
        if dgorder is not None and businv is not None and not dgorder.empty and not businv.empty:
            d_yoy = self.calc.yoy_percent(dgorder)
            i_yoy = self.calc.yoy_percent(businv)
            d_last = float(d_yoy.dropna().iloc[-1]) if len(d_yoy.dropna()) > 0 else None
            i_last = float(i_yoy.dropna().iloc[-1]) if len(i_yoy.dropna()) > 0 else None
            oi_ratio = self.calc.oi_ratio_proxy(dgorder, businv)
            oi_debug = {
                "dgorder_yoy_pct": round(d_last, 2) if d_last else None,
                "businv_yoy_pct": round(i_last, 2) if i_last else None,
                "ratio": round(oi_ratio, 2) if oi_ratio else None,
            }

        # Phase 판정
        phase = "N/A"
        if pmi_trend == "rising" and inv_trend == "falling":
            phase = "Phase 1: 상승 초기"
        elif pmi_trend == "rising" and inv_trend == "rising":
            phase = "Phase 2: 상승 중기"
        elif pmi_trend == "falling" and inv_trend == "rising":
            phase = "Phase 3: 하락 초기"
        elif pmi_trend == "falling" and inv_trend == "falling":
            phase = "Phase 4: 하락 후기"

        return {
            "판정": phase,
            "수요_트렌드": {"direction": pmi_trend, "strength": round(pmi_str, 3)},
            "재고_트렌드": {"direction": inv_trend, "strength": round(inv_str, 3)},
            "수요_지표_상세": demand_details,
            "재고_지표_상세": inv_details,
            "oi_ratio": oi_debug,
        }

    def _find_peaks(self, series: pd.Series, is_max: bool = True, window: int = 5) -> list[float]:
        """시계열에서 로컬 피크/저점 추출"""
        if series is None or len(series) < window * 2:
            return []

        peaks = []
        values = series.values
        for i in range(window, len(values) - window):
            local = values[i - window:i + window + 1]
            if is_max and values[i] == max(local):
                peaks.append(float(values[i]))
            elif not is_max and values[i] == min(local):
                peaks.append(float(values[i]))

        return peaks[-3:]  # 최근 3개


# 싱글톤
macro_service = MacroService()
