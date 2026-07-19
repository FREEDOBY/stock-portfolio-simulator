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
from .kofia_fetcher import kofia_fetcher
from .naver_flow_fetcher import naver_flow_fetcher
from .silicon_analysts_fetcher import silicon_analysts_fetcher
from .bigtech_capex_fetcher import bigtech_capex_fetcher
from .customs_export_fetcher import customs_export_fetcher
from .ecos_fetcher import ecos_fetcher
from .tsmc_revenue_fetcher import tsmc_revenue_fetcher

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {"business_cycle", "liquidity", "sentiment", "valuation", "technical", "labor_household"}

# 빅테크 캐펙스 가이던스 대상 (리포트 핵심 판별자) — (id, 라벨, 실적/근거)
CAPEX_COMPANIES = [
    ("alphabet", "Alphabet", "7/23"),
    ("microsoft", "Microsoft", ""),
    ("meta", "Meta", ""),
    ("amazon", "Amazon", ""),
    ("tsmc", "TSMC", "보고"),
    ("broadcom", "Broadcom", "보고"),
]

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
        # 반도체 레짐 수동입력 — 리포트의 펀더멘탈 요소가 본체 (주가는 선행 보조 프록시)
        # 캐펙스 가이던스(핵심 판별자) + D램 가격 상승률(엔진 기울기). 기본값 = 2026.7 리포트 상태.
        self._capex_companies: dict[str, str] = {
            "alphabet": "flat", "microsoft": "flat", "meta": "up",
            "amazon": "flat", "tsmc": "up", "broadcom": "down",
        }
        self._dram_yoy: float = 15.0        # D램 가격 상승률 % (리포트: +70% → +15%)
        self._dram_momentum: str = "decel"  # "accel"(가속) | "decel"(감속)
        # 코스피 저점 판정기 수동입력 (신용잔고 추이 + 반대매매) — KRX 실연동 전 수동
        self._credit_trend: str = "falling"   # "rising"(증가) | "falling"(청산중) | "stalling"(멈춤)
        self._forced_selling: str = "normal"  # "spike"(급증) | "normal" | "easing"(진정)
        self._signal_history: list[dict] = []
        self._last_signals: dict[int, SignalStatus] = {}
        self.warning_engine: RecessionWarningEngine = recession_warning_engine
        # KST 06:00 일간 캐시
        self._dashboard_cache: Optional[dict] = None
        self._dashboard_cached_at: Optional[datetime] = None
        self._category_cache: dict[str, dict] = {}
        self._category_cached_at: dict[str, datetime] = {}
        self._kospi_cache: Optional[dict] = None
        self._kospi_cached_at: Optional[datetime] = None
        self._nasdaq_cache: Optional[dict] = None
        self._nasdaq_cached_at: Optional[datetime] = None

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

        # 반도체 레짐 판정기
        semiconductor = self._semiconductor_regime(raw, indicators)

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
            "semiconductor": semiconductor,
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
            # 나스닥 월봉 (M2 유동성 국면 오버레이용)
            nq = self._points_to_pd(raw.nasdaq_weekly)
            if nq is not None and len(nq) > 0:
                nqm = nq.resample("MS").last().dropna()
                result["NASDAQ"] = {"series_id": "NASDAQ", "name": "NASDAQ", "data": [
                    {"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 1)} for idx, v in nqm.items()
                ], "status": "live"}

        # 캐시 저장
        self._category_cache[category] = result
        self._category_cached_at[category] = datetime.now(KST)
        logger.info("Category '%s' cached (valid until next KST 06:00)", category)

        return result

    def get_signal_history(self) -> list[dict]:
        """시그널 상태 변경 이력"""
        return self._signal_history

    def get_kospi_bottom(self, force: bool = False) -> dict:
        """코스피 저점 판정 (파라볼릭 되돌림 + 낙폭 밴드 + 신용/반대매매, KST 06:00 캐시)

        force=True 시 캐시를 무시하고 즉시 재취득 (새로고침 버튼용).
        """
        if not force and self._kospi_cache is not None and _is_cache_valid(self._kospi_cached_at):
            logger.info("KOSPI bottom cache hit")
            return self._kospi_cache

        raw = self.fetcher.fetch_all()
        result = self._compute_kospi_bottom(raw)
        self._kospi_cache = result
        self._kospi_cached_at = datetime.now(KST)
        return result

    def get_nasdaq_bottom(self, force: bool = False) -> dict:
        """나스닥 저점 판정 (파라볼릭 되돌림 + 낙폭 밴드 + 역대 약세장, KST 06:00 캐시)"""
        if not force and self._nasdaq_cache is not None and _is_cache_valid(self._nasdaq_cached_at):
            return self._nasdaq_cache
        raw = self.fetcher.fetch_all()
        result = self._compute_nasdaq_bottom(raw)
        self._nasdaq_cache = result
        self._nasdaq_cached_at = datetime.now(KST)
        return result

    def set_kospi_manual(self, credit: str, forced: str) -> dict:
        """코스피 저점 수동입력: 신용잔고 추이 + 반대매매 (KRX 실연동 전)"""
        if credit not in ("rising", "falling", "stalling"):
            raise ValueError(f"invalid credit: {credit}")
        if forced not in ("spike", "normal", "easing"):
            raise ValueError(f"invalid forced: {forced}")
        self._credit_trend = credit
        self._forced_selling = forced
        self._kospi_cache = None
        self._kospi_cached_at = None
        return {"credit": credit, "forced": forced, "ok": True}

    def set_elliott_count(self, count: int) -> dict:
        """엘리엇 파동 수동 입력"""
        self._elliott_count = count
        return {"elliott_count": count, "status": "updated"}

    def set_capex_company(self, company: str, status: str) -> dict:
        """빅테크 캐펙스 가이던스 수동 입력 (리포트 핵심 판별자)

        - status: "up"(상향/유지) | "flat"(중립) | "down"(둔화/하향)
        빅테크별 상태를 종합해 수요축(expand/slow)을 도출. 변경 시 캐시 즉시 무효화.
        """
        if company not in self._capex_companies:
            raise ValueError(f"unknown company: {company}")
        if status not in ("up", "flat", "down"):
            raise ValueError(f"invalid status: {status}")
        self._capex_companies[company] = status
        self._dashboard_cache = None
        self._dashboard_cached_at = None
        return {"company": company, "status": status, "ok": True}

    def set_dram(self, yoy: float, momentum: str) -> dict:
        """D램 가격 상승률 수동 입력 (엔진 기울기)

        - yoy: 상승률 % (예: 15.0)
        - momentum: "accel"(가속) | "decel"(감속)
        """
        if momentum not in ("accel", "decel"):
            raise ValueError(f"invalid momentum: {momentum}")
        self._dram_yoy = yoy
        self._dram_momentum = momentum
        self._dashboard_cache = None
        self._dashboard_cached_at = None
        return {"yoy": yoy, "momentum": momentum, "ok": True}

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

    # ─── 반도체 레짐 판정기 ───

    def _recent_return(self, points: list, days: int = 63) -> Optional[float]:
        """최근 N거래일 수익률 % (기본 63일 ≈ 3개월)"""
        s = self._points_to_pd(points)
        if s is None or len(s) < days + 1:
            return None
        past = float(s.iloc[-days - 1])
        if past == 0:
            return None
        return round((float(s.iloc[-1]) / past - 1) * 100, 2)

    def _basket_index(self, points_lists: list) -> Optional[pd.Series]:
        """여러 종목 → 공통 날짜 정렬 후 시작=100 정규화 평균 지수"""
        cols = [self._points_to_pd(p) for p in points_lists]
        cols = [c for c in cols if c is not None and len(c) > 0]
        if not cols:
            return None
        df = pd.concat(cols, axis=1).dropna()
        if df.empty or len(df) < 2:
            return None
        df = df / df.iloc[0] * 100.0
        return df.mean(axis=1)

    def _semiconductor_regime(self, raw: MacroRawData, indicators: dict) -> dict:
        """반도체 레짐 = AI 반도체 사이클 고점 '선행' 판독

        선행(펀더멘탈·주축, 최대 85): 빅테크 캐펙스 30 + 메모리 가격 합성 25
          + TSMC 월매출 15 + 한국 수출 15 — 사이클을 선행
        확인(주가·동행, 최대 40): 메모리/로직 과열·상대강도·모멘텀·RSI
        고점위험 스코어 = min(100, 선행 + 확인)
        """
        # ══ 선행 신호 (펀더멘탈) ══
        leading: list[dict] = []
        lead_score = 0

        def _arrow(d: Optional[str]) -> str:
            return {"rising": "↑", "falling": "↓", "flat": "→"}.get(d or "", "?")

        # 1) 빅테크 캐펙스 증가율 (AI 수요 최상류·선행)
        capex = bigtech_capex_fetcher.get_capex()
        cap_g, cap_accel = capex.get("growth_qoq"), capex.get("accelerating")
        if cap_g is not None:
            if cap_g < 0:
                st, pts = "감소", 30
            elif cap_accel is False:
                st, pts = "증가율 둔화", 20
            else:
                st, pts = "가속", 0
            lead_score += pts
            leading.append({
                "key": "capex", "label": "빅테크 캐펙스", "status": st,
                "value": f"QoQ {cap_g:+.0f}%",
                "detail": f"합계 ${capex.get('total_latest')}B",
            })

        # 2) 메모리 가격 합성 (선행 가격): ECOS 집적회로 수출물가(주지표)
        #    + HBM3E 방향(AI 프리미엄) + DDR4 스팟 방향(레거시) · PPI는 폴백
        ddr = silicon_analysts_fetcher.get_dram_ddr4()
        spot = ddr.get("spot", {})
        spot_dir, spot_val = spot.get("direction"), spot.get("latest")
        hbm = silicon_analysts_fetcher.get_hbm_price()
        hbm3e_spot, hbm3e_contract = hbm.get("hbm3e_spot", {}), hbm.get("hbm3e_contract", {})
        hbm_dir = hbm3e_spot.get("direction") or hbm3e_contract.get("direction")
        ecos = ecos_fetcher.get_ic_export_price()
        ppi = self._series_to_pd(raw.fred_series.get("PCU334413334413"))
        ppi_yoy = None
        if ppi is not None and len(ppi) >= 13:
            yoy = self.calc.yoy_percent(ppi).dropna()
            if len(yoy):
                ppi_yoy = round(float(yoy.iloc[-1]), 1)
        # 주지표: ECOS YoY(실키) → ECOS 3M(샘플키, 10개월 제한) → 반도체 PPI YoY
        if ecos.get("available") and ecos.get("yoy") is not None:
            main_val, main_label = ecos["yoy"], "IC수출물가 YoY"
        elif ecos.get("available") and ecos.get("chg_3m") is not None:
            main_val, main_label = ecos["chg_3m"], "IC수출물가 3M"
        elif ppi_yoy is not None:
            main_val, main_label = ppi_yoy, "반도체 PPI YoY"
        else:
            main_val, main_label = None, None
        if main_val is not None or spot_dir is not None or hbm_dir is not None:
            pts = 0
            if main_val is not None and main_val < 0:
                pts += 15
            if hbm_dir == "falling":
                pts += 5
            if spot_dir == "falling":
                pts += 5
            if pts >= 15:
                st = "꺾임"
            elif pts >= 5:
                st = "경계"
            elif main_val is not None and main_val > 10:
                st = "상승"
            else:
                st = "보합"
            lead_score += pts
            leading.append({
                "key": "dram", "label": "메모리 가격", "status": st,
                "value": f"{main_label} {main_val:+.0f}%" if main_val is not None else "N/A",
                "detail": f"HBM3E {_arrow(hbm_dir)} · DDR4 스팟 {_arrow(spot_dir)}",
            })

        # 3) TSMC 월매출 YoY (AI 반도체 생산 최상류, 월간 — 캐펙스보다 빠른 경고)
        tsmc = tsmc_revenue_fetcher.get_monthly_revenue()
        if tsmc.get("available"):
            t_yoy = tsmc["yoy"]
            if t_yoy < 0:
                st, pts = "감소", 15
            elif tsmc.get("slowing"):
                st, pts = "증가율 둔화", 8
            else:
                st, pts = "가속", 0
            lead_score += pts
            leading.append({
                "key": "tsmc", "label": "TSMC 월매출", "status": st,
                "value": f"YoY {t_yoy:+.0f}%",
                "detail": f"{tsmc.get('latest_period')} NT${tsmc.get('revenue_bn'):.0f}B · 직전 {tsmc.get('yoy_prev'):+.0f}%",
            })

        # 4) 한국 반도체 수출 YoY (글로벌 반도체 사이클 선행지수)
        kr_exp = customs_export_fetcher.get_semiconductor_export()
        exp_yoy = kr_exp.get("yoy") if kr_exp.get("available") else None
        if exp_yoy is not None:
            if exp_yoy < 0:
                st, pts = "감소", 15
            elif exp_yoy < 10:
                st, pts = "둔화", 8
            else:
                st, pts = "견조", 0
            lead_score += pts
            leading.append({
                "key": "kr_export", "label": "한국 반도체 수출", "status": st,
                "value": f"YoY {exp_yoy:+.0f}%",
                "detail": f"{kr_exp.get('latest_period')} {kr_exp.get('latest_value')}억$",
            })

        # ══ 확인 신호 (주가·동행) ══
        mem = self._basket_index([raw.micron, raw.sk_hynix, raw.samsung])
        logic = self._basket_index([raw.nvda, raw.avgo])

        def ret(s, days: int, offset: int = 0):
            if s is None or len(s) < days + offset + 1:
                return None
            a = float(s.iloc[-1 - offset - days])
            b = float(s.iloc[-1 - offset])
            return round((b / a - 1) * 100, 1) if a else None

        mem_6m, mem_3m = ret(mem, 126), ret(mem, 63)
        mem_1m, mem_prev1m = ret(mem, 21), ret(mem, 21, offset=21)
        logic_3m = ret(logic, 63)
        sox_mom = ret(self._points_to_pd(raw.sox), 63)
        dist200 = None
        if mem is not None and len(mem) >= 200:
            sma = self.calc.sma(mem, 200).iloc[-1]
            if pd.notna(sma) and sma:
                dist200 = round((float(mem.iloc[-1]) / float(sma) - 1) * 100, 1)
        rsi = None
        if mem is not None and len(mem) > 20:
            rs = self.calc.rsi(mem)
            if len(rs) and pd.notna(rs.iloc[-1]):
                rsi = round(float(rs.iloc[-1]), 1)
        spread_now = round(mem_3m - logic_3m, 1) if (mem_3m is not None and logic_3m is not None) else None
        m3p, l3p = ret(mem, 63, offset=21), ret(logic, 63, offset=21)
        spread_prev = round(m3p - l3p, 1) if (m3p is not None and l3p is not None) else None

        confirm: list[dict] = []
        conf_score = 0
        # 과열도 (파라볼릭)
        if mem_6m is not None or dist200 is not None:
            if (mem_6m is not None and mem_6m > 80) or (dist200 is not None and dist200 > 40):
                st, pts = "극단", 15
            elif (mem_6m is not None and mem_6m > 50) or (dist200 is not None and dist200 > 25):
                st, pts = "과열", 8
            else:
                st, pts = "정상", 0
            conf_score += pts
            confirm.append({"key": "overheat", "label": "과열도", "status": st,
                            "value": f"6M {mem_6m:+.0f}%" if mem_6m is not None else "N/A",
                            "detail": f"200일 이격 {dist200:+.0f}%" if dist200 is not None else ""})
        # 상대강도 롤오버
        if spread_now is not None and spread_prev is not None:
            if spread_now < spread_prev - 3:
                st, pts = "롤오버", 12
            elif spread_now > spread_prev:
                st, pts = "가속", 0
            else:
                st, pts = "정점", 6
            conf_score += pts
            confirm.append({"key": "rs", "label": "상대강도", "status": st,
                            "value": f"{spread_now:+.0f}%p", "detail": f"21일전 {spread_prev:+.0f}%p"})
        # 모멘텀 감속
        if mem_1m is not None and mem_prev1m is not None:
            st, pts = ("감속", 8) if mem_1m < mem_prev1m - 2 else ("가속", 0)
            conf_score += pts
            confirm.append({"key": "accel", "label": "모멘텀", "status": st,
                            "value": f"1M {mem_1m:+.0f}%", "detail": f"직전 {mem_prev1m:+.0f}%"})
        # RSI
        if rsi is not None:
            st, pts = ("과매수", 5) if rsi > 75 else ("경계", 3) if rsi > 70 else ("중립", 0)
            conf_score += pts
            confirm.append({"key": "rsi", "label": "RSI(14)", "status": st,
                            "value": f"{rsi:.0f}", "detail": "메모리 바스켓"})

        score = min(100, lead_score + conf_score)

        # ── 국면 판정 ──
        if mem_3m is not None and mem_3m < -8:
            phase = "DOWNTURN"
        elif score >= 60:
            phase = "TOP_WARNING"
        elif score >= 40:
            phase = "OVERHEAT"
        elif score >= 20:
            phase = "LATE_EXPANSION"
        else:
            phase = "EXPANSION"

        phase_info = {
            "EXPANSION":      {"name": "확장", "desc": "선행·확인 신호 양호. 사이클 상승 초·중기.",
                               "action": "보유/매수", "color": "#10b981"},
            "LATE_EXPANSION": {"name": "확장 후기", "desc": "일부 둔화/과열 신호 점등. 경계 시작.",
                               "action": "보유·경계", "color": "#f59e0b"},
            "OVERHEAT":       {"name": "과열 주의", "desc": "펀더멘탈 둔화 또는 주가 과열 다수. 고점 구간 진입 가능.",
                               "action": "비중축소 검토", "color": "#f97316"},
            "TOP_WARNING":    {"name": "고점 경고", "desc": "캐펙스 증가율 둔화 + D램 꺾임 + 주가 롤오버 동조. 선행 고점 신호.",
                               "action": "차익실현/헤지", "color": "#ef4444"},
            "DOWNTURN":       {"name": "하강", "desc": "메모리 이미 3개월 하락. 사이클 꺾임 확인.",
                               "action": "현금/관망", "color": "#a78bfa"},
        }
        info = phase_info[phase]

        # ── 차트용 시계열 ──
        def _with_qoq(pts: list[dict]) -> list[dict]:
            """시간순 포인트에 직전 대비 변화율(qoq %) 추가. 첫 포인트는 None."""
            out, prev = [], None
            for p in pts:
                qoq = round((p["value"] / prev - 1) * 100, 1) if prev else None
                out.append({**p, "qoq": qoq})
                prev = p["value"]
            return out

        # 빅테크 캐펙스 분기 추이 (시간순)
        capex_series = _with_qoq(list(reversed(capex.get("total_series", []))))
        # 메모리 vs 로직 주가 (공통 시작=100 재정규화, 주봉 근사)
        mem_logic_series = []
        if mem is not None and logic is not None:
            mldf = pd.concat([mem, logic], axis=1).dropna()
            if not mldf.empty:
                mldf.columns = ["memory", "logic"]
                mldf = mldf / mldf.iloc[0] * 100
                mldf = mldf.iloc[::5]
                mem_logic_series = [
                    {"date": idx.strftime("%Y-%m-%d"),
                     "memory": round(float(r["memory"]), 1), "logic": round(float(r["logic"]), 1)}
                    for idx, r in mldf.iterrows()
                ]
        # 반도체 PPI YoY 추이 (월별, 최근 5년)
        ppi_series = []
        if ppi is not None and len(ppi) >= 13:
            yoy_s = self.calc.yoy_percent(ppi).dropna()
            ppi_series = [
                {"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 1)}
                for idx, v in yoy_s.items()
            ][-60:]
        # 한국 반도체 수출 추이 (월별, 억달러)
        export_series = [
            {"date": f"{str(p['period'])[:4]}-{str(p['period'])[4:6]}", "value": p.get("value")}
            for p in kr_exp.get("series", []) if len(str(p.get("period", ""))) == 6
        ]

        # DDR4 가격 추이 (컨트랙트+스팟 병합, $/8Gb) — period_sort_key(YYYY0Q) → YYYY-MM
        def _q2d(psk) -> Optional[str]:
            try:
                n = int(psk)
                return f"{n // 100:04d}-{min(12, max(1, n % 100) * 3):02d}"
            except (TypeError, ValueError):
                return None
        # 변화율은 같은 소스(컨트랙트끼리·스팟끼리) 내에서만 계산 — 접합 지점은 None(라인 끊김)
        def _src_pts(src: dict) -> list[dict]:
            pts = [{"date": _q2d(p.get("period")), "value": p.get("value")}
                   for p in src.get("points", [])
                   if _q2d(p.get("period")) and p.get("value") is not None]
            pts.sort(key=lambda x: x["date"])
            return _with_qoq(pts)

        ddr4_series = sorted(
            _src_pts(ddr.get("contract", {})) + _src_pts(spot),
            key=lambda x: x["date"],
        )

        # HBM3E 컨트랙트/스팟 가격 추이 ($/GB, 분기)
        hbm_map: dict[str, dict] = {}
        for kind, src in (("contract", hbm3e_contract), ("spot", hbm3e_spot)):
            for p in src.get("points", []):
                d = _q2d(p.get("period"))
                if d and p.get("value") is not None:
                    hbm_map.setdefault(d, {"date": d})[kind] = p["value"]
        hbm3e_series = sorted(hbm_map.values(), key=lambda x: x["date"])

        # ECOS 집적회로 수출물가지수 (달러기준 월간) / TSMC 월매출 YoY
        ecos_series = ecos.get("series", []) if ecos.get("available") else []
        tsmc_series = tsmc.get("series", []) if tsmc.get("available") else []

        return {
            "phase": phase,
            "name": info["name"],
            "desc": info["desc"],
            "action": info["action"],
            "color": info["color"],
            "top_risk_score": score,
            "lead_score": lead_score,
            "conf_score": conf_score,
            "capex_series": capex_series,
            "mem_logic_series": mem_logic_series,
            "ppi_series": ppi_series,
            "export_series": export_series,
            "ddr4_series": ddr4_series,
            "hbm3e_series": hbm3e_series,
            "ecos_series": ecos_series,
            "tsmc_series": tsmc_series,
            # 선행(펀더멘탈) / 확인(주가)
            "leading_signals": leading,
            "confirm_signals": confirm,
            # 참고: 캐펙스·D램·HBM 실데이터
            "capex": {
                "total_latest": capex.get("total_latest"),
                "growth_qoq": cap_g, "accelerating": cap_accel,
                "companies": capex.get("companies", []),
            },
            "dram_ref": {
                "ddr4_spot": spot_val, "ddr4_spot_dir": spot_dir,
                "ddr4_contract": ddr.get("contract", {}).get("latest"),
                "ppi_yoy": ppi_yoy,
                "hbm_gen": hbm.get("latest_gen"),
                "hbm_value": hbm.get("latest_value"),
                "ic_export_latest": ecos.get("latest"),
                "ic_export_yoy": ecos.get("yoy"),
                "ic_export_chg_3m": ecos.get("chg_3m"),
                "ecos_source": ecos.get("source"),
            },
            "proxy": {
                "mem_avg": mem_3m, "logic_avg": logic_3m,
                "mem_vs_logic": spread_now, "sox_mom": sox_mom,
            },
        }

    # ─── 코스피 저점 판정기 ───

    def _derive_credit_trend(self, series: list[dict]) -> Optional[str]:
        """신용잔고 시계열 → 추세 (rising/falling/stalling). 데이터 부족 시 None."""
        vals = [p["value"] for p in series if p.get("value") is not None]
        if len(vals) < 4:
            return None
        base = vals[-4]
        pct = (vals[-1] - base) / base * 100 if base else 0.0
        last_step = vals[-1] - vals[-2]
        if abs(pct) < 0.3:
            return "stalling"          # 4구간 변화 미미 → 정체
        if pct < 0:
            return "stalling" if last_step >= 0 else "falling"  # 감소하나 마지막 반등 → 멈춤
        return "rising"

    def _derive_forced_selling(self, series: list[dict]) -> Optional[str]:
        """반대매매 금액 시계열 → 상태 (spike/normal/easing). 데이터 부족 시 None."""
        import statistics
        amts = [p["amount"] for p in series if p.get("amount") is not None]
        if len(amts) < 8:
            return None
        window = amts[-20:] if len(amts) >= 20 else amts
        baseline = statistics.median(window[:-1]) if len(window) > 1 else window[0]
        if not baseline or baseline <= 0:
            baseline = max(1.0, statistics.mean(window))
        latest = amts[-1]
        recent_max = max(amts[-5:])
        if latest >= baseline * 2:
            return "spike"          # 평소 2배 이상 → 급증
        if recent_max >= baseline * 2 and latest <= recent_max * 0.6:
            return "easing"         # 급증했다 60% 이하로 진정
        return "normal"

    def _compute_kospi_bottom(self, raw: MacroRawData) -> dict:
        """파라볼릭 되돌림 + 낙폭 밴드 + 신용/반대매매 → 저점 판정

        반도체 레짐(피크·CASE1 vs 하강·CASE2)이 되돌림 밴드를 분기:
          - 피크·CASE1 → 비리세션 밴드 (-19~-37%)
          - 하강·CASE2 → 리세션 밴드 (-37~-55%+)
        """
        kospi = self._points_to_pd(raw.kospi)
        if kospi is None or len(kospi) < 60:
            return {"available": False}

        peak_val = float(kospi.max())
        peak_date = kospi.idxmax()
        current_val = float(kospi.iloc[-1])
        drawdown = round((current_val / peak_val - 1) * 100, 1)

        # 파라볼릭 base = peak 이전 최저점 (상승 가속 시작점)
        before = kospi.loc[:peak_date]
        base_val = float(before.min())
        base_date = before.idxmin()
        rise = peak_val - base_val

        def lvl(frac: float) -> float:
            return round(peak_val - frac * rise, 1)

        retracement = {
            "peak": round(peak_val, 1),
            "fib382": lvl(0.382),
            "fib50": lvl(0.5),
            "fib618": lvl(0.618),
            "base": round(base_val, 1),
        }
        retr_pct = round((peak_val - current_val) / rise * 100, 1) if rise > 0 else None

        # 반도체 레짐 → 밴드 분기
        regime = self._semiconductor_regime(raw, {})
        phase = regime["phase"]
        applied = "recession" if phase in ("DOWNTURN", "UNSTABLE") else "non_recession"
        if applied == "non_recession":
            band_high_price = round(peak_val * (1 - 0.19), 1)  # 얕은 쪽
            band_low_price = round(peak_val * (1 - 0.37), 1)   # 깊은 쪽
        else:
            band_high_price = round(peak_val * (1 - 0.37), 1)
            band_low_price = round(peak_val * (1 - 0.55), 1)

        # 신용잔고: KOFIA 자동 시계열이 있으면 추세 자동 도출, 없으면 수동 폴백
        credit_series = kofia_fetcher.get_credit_balance() if kofia_fetcher.enabled else []
        auto_credit = self._derive_credit_trend(credit_series)
        if auto_credit:
            credit = auto_credit
            credit_source = "auto"
        else:
            credit = self._credit_trend
            credit_source = "manual"
        credit_latest = credit_series[-1]["value"] if credit_series else None

        # 반대매매: KOFIA 증시자금(미수금 반대매매) 자동, 없으면 수동 폴백
        forced_series = kofia_fetcher.get_forced_selling() if kofia_fetcher.enabled else []
        auto_forced = self._derive_forced_selling(forced_series)
        if auto_forced:
            forced = auto_forced
            forced_source = "auto"
        else:
            forced = self._forced_selling
            forced_source = "manual"
        forced_latest = forced_series[-1] if forced_series else None
        band_reached = drawdown <= (-19 if applied == "non_recession" else -37)
        confirm = int(credit == "stalling") + int(forced == "easing")

        if applied == "recession" and drawdown > -37:
            verdict, vcolor = "저점 미도래 (현금 유지)", "#ef4444"
        elif band_reached and confirm >= 2:
            verdict, vcolor = "저점 근접 (분할 준비)", "#10b981"
        elif band_reached and confirm == 1:
            verdict, vcolor = "저점 구간 진입 (관찰)", "#f59e0b"
        else:
            verdict, vcolor = "되돌림 진행 중 (관망)", "#f97316"

        # 투자자 수급 (외국인/기관/개인 일별 순매수, 네이버)
        investor_flow = naver_flow_fetcher.get_investor_flow()

        # 차트용 다운샘플 (주봉 근사)
        weekly = kospi.iloc[::5]
        price = [
            {"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 1)}
            for idx, v in weekly.items()
        ]
        # 전체이력 월봉 (역대 약세장 오버레이용)
        monthly = self._points_to_pd(raw.kospi_monthly)
        price_full = (
            [{"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 1)} for idx, v in monthly.items()]
            if monthly is not None else []
        )

        return {
            "available": True,
            "price": price,
            "price_full": price_full,
            "peak": {"date": peak_date.strftime("%Y-%m-%d"), "value": round(peak_val, 1)},
            "base": {"date": base_date.strftime("%Y-%m-%d"), "value": round(base_val, 1)},
            "current": round(current_val, 1),
            "drawdown_pct": drawdown,
            "retracement": retracement,
            "retracement_pct": retr_pct,
            "bands": {
                "non_recession": {"low": -19.0, "high": -37.0},
                "recession": {"low": -37.0, "high": -55.0},
                "applied": applied,
            },
            "band_target": {"high": band_high_price, "low": band_low_price},
            "regime": {"phase": phase, "name": regime["name"], "color": regime["color"]},
            "credit_trend": credit,
            "credit_source": credit_source,
            "credit_latest": credit_latest,
            "credit_series": credit_series[-40:],
            "forced_selling": forced,
            "forced_source": forced_source,
            "forced_amount": (forced_latest or {}).get("amount") if forced_latest else None,
            "forced_ratio": (forced_latest or {}).get("ratio") if forced_latest else None,
            "forced_series": forced_series[-40:],
            "investor_flow": investor_flow,
            "verdict": verdict,
            "verdict_color": vcolor,
        }

    def _compute_nasdaq_bottom(self, raw: MacroRawData) -> dict:
        """나스닥 파라볼릭 되돌림 + 낙폭 밴드 (반도체 레짐이 밴드 분기)

        나스닥 밴드(리포트): 비리세션 -19~-37%, 리세션 -31~-78%.
        '-20% 돌파 = CASE 2(감익 사이클) 확률 급등' 트리거 포함.
        한국 전용(수급/신용/반대매매)은 없음.
        """
        ixic = self._points_to_pd(raw.nasdaq_weekly)  # 주봉, max
        if ixic is None or len(ixic) < 30:
            return {"available": False}

        # 파라볼릭: 최근 5년 창
        cutoff = ixic.index[-1] - pd.DateOffset(years=5)
        recent = ixic[ixic.index >= cutoff]
        if len(recent) < 10:
            recent = ixic

        peak_val = float(recent.max())
        peak_date = recent.idxmax()
        current_val = float(ixic.iloc[-1])
        drawdown = round((current_val / peak_val - 1) * 100, 1)

        before = recent.loc[:peak_date]
        base_val = float(before.min())
        base_date = before.idxmin()
        rise = peak_val - base_val

        def lvl(frac: float) -> float:
            return round(peak_val - frac * rise, 1)

        retracement = {"peak": round(peak_val, 1), "fib382": lvl(0.382),
                       "fib50": lvl(0.5), "fib618": lvl(0.618), "base": round(base_val, 1)}
        retr_pct = round((peak_val - current_val) / rise * 100, 1) if rise > 0 else None

        # 반도체 레짐 → 밴드
        regime = self._semiconductor_regime(raw, {})
        phase = regime["phase"]
        applied = "recession" if phase in ("DOWNTURN", "UNSTABLE") else "non_recession"
        if applied == "non_recession":
            band_high_price = round(peak_val * (1 - 0.19), 1)
            band_low_price = round(peak_val * (1 - 0.37), 1)
        else:
            band_high_price = round(peak_val * (1 - 0.31), 1)
            band_low_price = round(peak_val * (1 - 0.78), 1)

        # -20% 돌파 = CASE 2 트리거
        breach20 = drawdown <= -20
        if breach20:
            verdict, vcolor = "리세션 경보 (-20% 돌파)", "#ef4444"
        elif drawdown > -10:
            verdict, vcolor = "조정 문턱 (관망)", "#f59e0b"
        elif drawdown <= (-19 if applied == "non_recession" else -31):
            verdict, vcolor = "저점 밴드 진입", "#10b981"
        else:
            verdict, vcolor = "되돌림 진행 중", "#f97316"

        # 차트: 최근 주봉 + 전체이력 월봉
        price = [{"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 1)} for idx, v in recent.items()]
        monthly = ixic.resample("MS").last().dropna()
        price_full = [{"date": idx.strftime("%Y-%m-%d"), "value": round(float(v), 1)} for idx, v in monthly.items()]

        return {
            "available": True,
            "price": price,
            "price_full": price_full,
            "peak": {"date": peak_date.strftime("%Y-%m-%d"), "value": round(peak_val, 1)},
            "base": {"date": base_date.strftime("%Y-%m-%d"), "value": round(base_val, 1)},
            "current": round(current_val, 1),
            "drawdown_pct": drawdown,
            "retracement": retracement,
            "retracement_pct": retr_pct,
            "bands": {
                "non_recession": {"low": -19.0, "high": -37.0},
                "recession": {"low": -31.0, "high": -78.0},
                "applied": applied,
            },
            "band_target": {"high": band_high_price, "low": band_low_price},
            "regime": {"phase": phase, "name": regime["name"], "color": regime["color"]},
            "breach20": breach20,
            "verdict": verdict,
            "verdict_color": vcolor,
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
