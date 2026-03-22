"""파생 지표 계산 엔진 - 순수 함수 기반"""
import pandas as pd
import numpy as np
from typing import Optional


class MacroCalculator:
    """매크로 파생 지표 계산"""

    # ─── 변화율 ───

    def mom_percent(self, series: pd.Series) -> pd.Series:
        """월간 변화율 (MoM%) 계산

        @implements REQ-001
        """
        if series.empty:
            return pd.Series([], dtype=float)
        return series.pct_change() * 100

    def acceleration(self, mom_series: pd.Series) -> pd.Series:
        """MoM% 가속도 계산 (MoM 변화의 변화)

        @implements REQ-002
        """
        if mom_series.empty:
            return pd.Series([], dtype=float)
        return mom_series.diff()

    def yoy_percent(self, series: pd.Series) -> pd.Series:
        """연간 변화율 (YoY%) 계산

        @implements REQ-003, REQ-013
        """
        if len(series) < 13:
            return pd.Series([np.nan] * len(series), index=series.index, dtype=float)
        return series.pct_change(periods=12) * 100

    # ─── 이동평균 ───

    def sma(self, prices: pd.Series, window: int = 200) -> pd.Series:
        """단순이동평균 (SMA) 계산

        @implements REQ-004, REQ-005
        """
        return prices.rolling(window=window).mean()

    def distance_from_sma(self, current_price: float, sma_value: float) -> Optional[float]:
        """현재가와 SMA 사이 거리%

        @implements REQ-008
        """
        if sma_value is None or sma_value == 0 or np.isnan(sma_value):
            return None
        return (current_price - sma_value) / sma_value * 100

    # ─── MACD ───

    def macd(
        self,
        prices: pd.Series,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
    ) -> tuple[pd.Series, pd.Series, pd.Series]:
        """MACD 계산 (선, 시그널선, 히스토그램)

        @implements REQ-006
        """
        ema_fast = prices.ewm(span=fast, adjust=False).mean()
        ema_slow = prices.ewm(span=slow, adjust=False).mean()

        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line

        return macd_line, signal_line, histogram

    # ─── RSI ───

    def rsi(self, prices: pd.Series, period: int = 14) -> pd.Series:
        """RSI (Relative Strength Index) 계산 - Wilder's smoothing

        @implements REQ-007
        """
        delta = prices.diff()

        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)

        # Wilder's smoothing (EWM with alpha=1/period)
        avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

        # avg_loss가 0이면 RSI = 100 (완전 과매수)
        rs = pd.Series(np.where(avg_loss == 0, np.inf, avg_gain / avg_loss), index=prices.index)
        rsi = 100 - (100 / (1 + rs))

        return rsi

    # ─── Drawdown ───

    def drawdown_percent(self, prices: pd.Series) -> Optional[float]:
        """52주 최고가 대비 하락률 (Drawdown%)

        @implements REQ-009
        """
        if prices.empty:
            return None

        peak = prices.max()
        current = prices.iloc[-1]

        if peak == 0:
            return None

        return (current - peak) / peak * 100

    # ─── 버핏 지표 ───

    def buffett_indicator(
        self,
        wilshire: float,
        gdp: float,
    ) -> Optional[float]:
        """버핏지표 (시가총액/GDP %) 계산

        @implements REQ-010
        """
        if gdp is None or gdp == 0:
            return None
        return wilshire / gdp * 100

    # ─── 트렌드 판별 ───

    def composite_trend(
        self,
        series_list: list[tuple[pd.Series, float]],
        window: int = 3,
    ) -> Optional[str]:
        """복합 선행지표 가중 투표로 트렌드 판별

        Args:
            series_list: [(pd.Series, weight), ...] 각 지표와 가중치
            window: 이동평균 윈도우

        Returns: "rising", "falling", or None
        """
        rising_weight = 0.0
        falling_weight = 0.0
        total_weight = 0.0

        for series, weight in series_list:
            if series is None or series.empty:
                continue
            direction = self.trend_direction(series, window=window)
            if direction == "rising":
                rising_weight += weight
            elif direction == "falling":
                falling_weight += weight
            total_weight += weight

        if total_weight == 0:
            return None

        if rising_weight > falling_weight:
            return "rising"
        elif falling_weight > rising_weight:
            return "falling"
        return None

    def trend_direction(
        self,
        series: pd.Series,
        window: int = 3,
    ) -> Optional[str]:
        """3개월 이동평균의 중기 방향 판별 (3개월 전 대비)

        @implements REQ-011, REQ-012
        직전 1개월이 아닌 3개월 전 MA 대비 방향을 봄 → 미세 반등에 흔들리지 않음
        Returns: "rising", "falling", or None (데이터 부족)
        """
        if len(series) < window + 4:
            return None

        ma = series.rolling(window=window).mean()
        valid = ma.dropna()

        if len(valid) < 4:
            return None

        # 3개월 전 MA 대비 현재 MA 방향 (단기 노이즈 필터링)
        current = float(valid.iloc[-1])
        past = float(valid.iloc[-3])  # 3개월 전

        if current > past:
            return "rising"
        elif current < past:
            return "falling"
        return None


# 싱글톤
macro_calculator = MacroCalculator()
