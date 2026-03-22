"""매크로 통합 서비스 - 데이터 수집 → 지표 계산 → 시그널 판정 파이프라인"""
import logging
from datetime import datetime
from typing import Optional

import pandas as pd
import numpy as np

from .macro_data_fetcher import MacroDataFetcher, macro_data_fetcher
from .macro_calculator import MacroCalculator, macro_calculator
from .signal_engine import SignalEngine, signal_engine
from ..models.macro_schemas import SeriesDataPoint, MacroRawData
from ..models.signal_schemas import SignalResult, SignalHistoryEntry, SignalStatus

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {"business_cycle", "liquidity", "sentiment", "valuation", "technical"}


class MacroService:
    """매크로 분석 통합 서비스"""

    def __init__(self):
        self.fetcher: MacroDataFetcher = macro_data_fetcher
        self.calc: MacroCalculator = macro_calculator
        self.engine: SignalEngine = signal_engine
        self._elliott_count: int = 0
        self._signal_history: list[dict] = []
        self._last_signals: dict[int, SignalStatus] = {}

    def get_dashboard(self) -> dict:
        """대시보드 데이터: 종합 판정 + 카테고리 요약 + 시그널"""
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

        return {
            "overall": {
                "score": score,
                "verdict": verdict.value,
                "signals": [s.model_dump() for s in signals],
                "history": self._signal_history[-20:],  # 최근 20건
                "updated_at": datetime.now().isoformat(),
            },
            "categories": categories,
        }

    def get_category_detail(self, category: str) -> dict:
        """카테고리별 상세 데이터 (차트용)"""
        if category == "technical":
            return self._get_technical_detail()

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

        # ISM PMI 트렌드
        pmi_data = self._series_to_pd(raw.fred_series.get("NAPM"))
        indicators["pmi_trend"] = self.calc.trend_direction(pmi_data) if pmi_data is not None and not pmi_data.empty else None

        # 재고/출하비율 트렌드
        isratio_data = self._series_to_pd(raw.fred_series.get("ISRATIO"))
        indicators["inventory_trend"] = self.calc.trend_direction(isratio_data) if isratio_data is not None and not isratio_data.empty else None

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
        wilshire = self._last_value(raw.fred_series.get("WILSHIRE"))
        gdp = self._last_value(raw.fred_series.get("GDP"))
        indicators["buffett"] = self.calc.buffett_indicator(wilshire, gdp) if wilshire and gdp else None

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
        signals.append(self.engine.signal_2_cli_mom(indicators.get("cli_mom", pd.Series([], dtype=float))))

        # 시그널 3 키친사이클 + CLI 교차검증
        s3 = self.engine.signal_3_kitchen_cycle(
            pmi_trend=indicators.get("pmi_trend"),
            inventory_trend=indicators.get("inventory_trend"),
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

        # 시그널 4: 매수(200주선) 또는 매도(MACD 다이버전스) 중 더 강한 것
        nasdaq = indicators.get("nasdaq_prices", pd.Series([], dtype=float))
        macd_line = indicators.get("macd_line", pd.Series([], dtype=float))

        s4_buy = self.engine.signal_4_buy_sma200(indicators.get("distance_pct"))
        s4_sell = self.engine.signal_4_sell_macd_divergence(
            price_peaks=self._find_peaks(nasdaq, is_max=True),
            macd_peaks=self._find_peaks(macd_line, is_max=True),
            elliott_count=self._elliott_count,
        )
        # 더 강한 시그널 선택
        signals.append(s4_buy if abs(s4_buy.score) >= abs(s4_sell.score) else s4_sell)

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
                "status": "bullish" if kitchen_phase in ("Phase 1", "Phase 2") else "bearish" if kitchen_phase in ("Phase 3", "Phase 4") else "neutral",
                "key_values": {"phase": kitchen_phase, "cli_mom": cli_mom_val},
            },
            "liquidity": {
                "status": "neutral",
                "key_values": {
                    "fed_rate": indicators.get("fed_rate"),
                    "m2_yoy": round(indicators["m2_yoy"], 2) if indicators.get("m2_yoy") is not None else None,
                },
            },
            "technical": {
                "status": "bullish" if (indicators.get("distance_pct") or 0) > 0 else "bearish",
                "key_values": {
                    "distance_pct": round(indicators["distance_pct"], 1) if indicators.get("distance_pct") is not None else None,
                    "rsi": round(indicators["rsi_value"], 1) if indicators.get("rsi_value") is not None else None,
                },
            },
            "sentiment": {
                "status": "fear" if (indicators.get("vix_value") or 0) > 30 else "neutral",
                "key_values": {
                    "vix": round(indicators["vix_value"], 1) if indicators.get("vix_value") is not None else None,
                    "hy_spread": indicators.get("hy_spread"),
                },
            },
            "valuation": {
                "status": "overvalued" if (indicators.get("buffett") or 0) > 160 else "neutral",
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
