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

    # ─── 트렌드 판별 v2 (MA 교차 + 강도) ───

    def trend_direction_v2(
        self,
        series: pd.Series,
        lookback: int = 6,
    ) -> tuple[Optional[str], float]:
        """YoY% 변화율의 선형회귀 기울기로 트렌드 판별

        @implements REQ-001, REQ-002
        1. 원시 데이터 → YoY% 변환 (스케일 정규화 + 인플레이션 제거)
        2. YoY%의 최근 lookback개월에 선형회귀
        3. slope 부호 → rising/falling
        4. R² → 추세 일관성 (strength)

        Returns: ("rising"/"falling"/None, strength 0~1)
        """
        # YoY% 변환에 13개월 + lookback 필요
        if len(series) < 13 + lookback:
            return None, 0.0

        yoy = self.yoy_percent(series)
        yoy_valid = yoy.dropna().tail(lookback)

        if len(yoy_valid) < 4:
            return None, 0.0

        # 선형회귀
        x = np.arange(len(yoy_valid))
        y = yoy_valid.values

        slope, intercept = np.polyfit(x, y, 1)

        # R² 계산 (추세 일관성)
        predicted = slope * x + intercept
        ss_res = np.sum((y - predicted) ** 2)
        mean_y = np.mean(y)
        ss_tot = np.sum((y - mean_y) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
        r_squared = max(0.0, r_squared)  # 음수 방지

        # slope 크기로 방향 판별 (YoY%p 단위)
        # slope > 0: 증가율이 올라가는 중 (가속)
        # slope < 0: 증가율이 꺾이는 중 (감속)
        # |slope| < 0.1%p/월: 횡보로 간주
        if abs(slope) < 0.1:
            return None, r_squared

        # strength = R² (추세가 일관적일수록 높음)
        strength = r_squared

        if slope > 0:
            return "rising", strength
        else:
            return "falling", strength

    def composite_trend_v2(
        self,
        series_list: list[tuple[pd.Series, float]],
        lookback: int = 6,
    ) -> tuple[Optional[str], float]:
        """가중 강도 합산으로 복합 트렌드 판별

        @implements REQ-003
        각 지표의 (방향 × 강도 × 가중치)를 합산하여 최종 방향과 strength 반환

        Returns: ("rising"/"falling"/None, strength 0~1)
        """
        score = 0.0
        total_weight = 0.0

        for series, weight in series_list:
            if series is None or series.empty:
                continue
            direction, strength = self.trend_direction_v2(series, lookback=lookback)
            if direction is None:
                continue

            sign = 1.0 if direction == "rising" else -1.0
            score += sign * strength * weight
            total_weight += weight

        if total_weight == 0:
            return None, 0.0

        normalized = score / total_weight  # -1 ~ +1
        final_strength = abs(normalized)

        if final_strength < 0.15:
            return None, final_strength

        direction = "rising" if normalized > 0 else "falling"
        return direction, final_strength

    def oi_ratio_proxy(
        self,
        demand_series: pd.Series,
        inventory_series: pd.Series,
    ) -> Optional[float]:
        """OI Ratio proxy = demand YoY% / inventory YoY%

        @implements REQ-004
        ISM OI Ratio 대체. DGORDER YoY / BUSINV YoY 비율.
        > 1.0 = 수요 우위 (재고 보충 필요)
        < 1.0 = 재고 과잉 (재고 축소 필요)

        Returns: ratio or None (데이터 부족)
        """
        if len(demand_series) < 13 or len(inventory_series) < 13:
            return None

        demand_yoy = self.yoy_percent(demand_series)
        inv_yoy = self.yoy_percent(inventory_series)

        # 최근 유효값
        d_valid = demand_yoy.dropna()
        i_valid = inv_yoy.dropna()

        if len(d_valid) == 0 or len(i_valid) == 0:
            return None

        d_last = float(d_valid.iloc[-1])
        i_last = float(i_valid.iloc[-1])

        if i_last == 0:
            return None

        # 부호 정규화: 양수 YoY끼리 비교해야 ratio 시맨틱 유지
        # 둘 다 음수이면 부호가 상쇄되어 양수 ratio가 나오지만
        # "더 빠르게 감소" = 수요 우위가 아님 → abs 비율 + 방향 보정
        if d_last > 0 and i_last > 0:
            return d_last / i_last
        elif d_last < 0 and i_last < 0:
            # 둘 다 감소 중: 수요 감소가 더 크면 재고 과잉
            return abs(i_last) / abs(d_last)
        elif d_last > 0 and i_last < 0:
            # 수요 증가 + 재고 감소 → 강한 수요 우위
            return abs(d_last / i_last) + 1.0
        else:
            # 수요 감소 + 재고 증가 → 강한 재고 과잉
            return 1.0 / (abs(i_last / d_last) + 1.0)


# 싱글톤
macro_calculator = MacroCalculator()
