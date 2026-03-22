"""파생 지표 계산 엔진 단위 테스트"""
import pytest
import pandas as pd
import numpy as np

from app.services.macro_calculator import MacroCalculator


@pytest.fixture
def calc():
    return MacroCalculator()


class TestMoM:
    """월간 변화율 계산"""

    # UT-001: REQ-001 - CLI MoM% 정상 계산
    def test_mom_percent(self, calc):
        s = pd.Series([100.0, 101.0, 100.5], index=pd.date_range("2025-01", periods=3, freq="ME"))
        result = calc.mom_percent(s)
        assert len(result) == 3
        assert np.isnan(result.iloc[0])  # 첫 값은 NaN
        assert abs(result.iloc[1] - 1.0) < 0.01  # (101-100)/100*100 = 1.0%
        assert result.iloc[2] < 0  # 100.5 < 101 → 음수

    # UT-002: REQ-002 - CLI 가속도 계산
    def test_acceleration(self, calc):
        mom = pd.Series([np.nan, 1.0, 0.5, -0.3], index=pd.date_range("2025-01", periods=4, freq="ME"))
        result = calc.acceleration(mom)
        assert len(result) == 4
        # 가속도 = MoM[t] - MoM[t-1]
        assert abs(result.iloc[2] - (-0.5)) < 0.01  # 0.5 - 1.0 = -0.5

    # UT-003: REQ-014 - 빈 시리즈 안전 처리
    def test_mom_empty_series(self, calc):
        s = pd.Series([], dtype=float)
        result = calc.mom_percent(s)
        assert len(result) == 0


class TestYoY:
    """연간 변화율 계산"""

    # UT-004: REQ-003 - M2 YoY% 정상 계산
    def test_yoy_percent(self, calc):
        # 13개월 데이터 (12개월 전 대비 필요)
        values = list(range(100, 113))  # 100~112
        s = pd.Series(values, index=pd.date_range("2024-01", periods=13, freq="ME"), dtype=float)
        result = calc.yoy_percent(s)
        # 마지막 값: (112 - 100) / 100 * 100 = 12.0%
        assert abs(result.iloc[-1] - 12.0) < 0.01

    # UT-005: REQ-014 - 12개월 미만 데이터
    def test_yoy_insufficient_data(self, calc):
        s = pd.Series([100, 101, 102], index=pd.date_range("2025-01", periods=3, freq="ME"), dtype=float)
        result = calc.yoy_percent(s)
        assert result.notna().sum() == 0  # 모두 NaN


class TestSMA:
    """이동평균 계산"""

    # UT-006: REQ-004 - 200주 SMA
    def test_sma_200(self, calc):
        prices = pd.Series(np.random.uniform(100, 200, 250), index=pd.date_range("2020-01-06", periods=250, freq="W"))
        result = calc.sma(prices, window=200)
        assert len(result) == 250
        assert result.notna().sum() == 51  # 250 - 200 + 1

    # UT-007: REQ-005 - 50주 SMA
    def test_sma_50(self, calc):
        prices = pd.Series(np.ones(60) * 100, index=pd.date_range("2024-01-01", periods=60, freq="W"))
        result = calc.sma(prices, window=50)
        # 모든 값이 100이면 SMA도 100
        assert abs(result.iloc[-1] - 100.0) < 0.01

    # UT-008: REQ-008 - 200주선 대비 거리%
    def test_distance_from_sma(self, calc):
        # 현재가 110, SMA200 = 100 → 거리 +10%
        result = calc.distance_from_sma(current_price=110, sma_value=100)
        assert abs(result - 10.0) < 0.01

    def test_distance_from_sma_below(self, calc):
        # 현재가 90, SMA200 = 100 → 거리 -10%
        result = calc.distance_from_sma(current_price=90, sma_value=100)
        assert abs(result - (-10.0)) < 0.01


class TestMACD:
    """MACD 계산"""

    # UT-009: REQ-006 - MACD 전체 계산
    def test_macd_calculation(self, calc):
        # 50주 데이터로 MACD 계산
        prices = pd.Series(
            np.linspace(100, 150, 50),
            index=pd.date_range("2024-01-01", periods=50, freq="W"),
        )
        macd_line, signal_line, histogram = calc.macd(prices)

        assert len(macd_line) == 50
        assert len(signal_line) == 50
        assert len(histogram) == 50
        # 상승 추세 → MACD > 0
        assert macd_line.iloc[-1] > 0

    # UT-010: REQ-014 - MACD 데이터 부족
    def test_macd_insufficient_data(self, calc):
        prices = pd.Series([100, 101, 102], index=pd.date_range("2025-01", periods=3, freq="W"))
        macd_line, signal_line, histogram = calc.macd(prices)
        # 데이터 부족해도 크래시 없이 반환
        assert len(macd_line) == 3


class TestRSI:
    """RSI 계산"""

    # UT-011: REQ-007 - RSI 정상 계산
    def test_rsi_calculation(self, calc):
        # 꾸준히 상승하는 데이터 → RSI 높아야 함
        prices = pd.Series(
            np.linspace(100, 200, 20),
            index=pd.date_range("2024-01-01", periods=20, freq="W"),
        )
        result = calc.rsi(prices, period=14)
        assert result.iloc[-1] > 70  # 과매수 영역

    # UT-012: REQ-007 - RSI 범위 확인
    def test_rsi_bounds(self, calc):
        prices = pd.Series(
            np.random.uniform(100, 200, 30),
            index=pd.date_range("2024-01-01", periods=30, freq="W"),
        )
        result = calc.rsi(prices, period=14)
        valid = result.dropna()
        assert (valid >= 0).all()
        assert (valid <= 100).all()


class TestDrawdown:
    """Drawdown 계산"""

    # UT-013: REQ-009 - Drawdown% 계산
    def test_drawdown_percent(self, calc):
        # 52주 데이터, 최고점 200, 현재 150
        prices = pd.Series([200] + [150] * 51, index=pd.date_range("2024-01-01", periods=52, freq="W"))
        result = calc.drawdown_percent(prices)
        assert abs(result - (-25.0)) < 0.01  # (150-200)/200*100 = -25%

    # UT-014: REQ-009 - 신고가 시 0%
    def test_drawdown_at_high(self, calc):
        prices = pd.Series(np.linspace(100, 200, 52), index=pd.date_range("2024-01-01", periods=52, freq="W"))
        result = calc.drawdown_percent(prices)
        assert abs(result - 0.0) < 0.01


class TestBuffettIndicator:
    """버핏 지표"""

    # UT-015: REQ-010 - 버핏지표% 계산
    def test_buffett_indicator(self, calc):
        result = calc.buffett_indicator(wilshire=50000, gdp=25000)
        assert abs(result - 200.0) < 0.01  # 50000/25000*100 = 200%

    # UT-016: REQ-014 - GDP 0이면 None
    def test_buffett_zero_gdp(self, calc):
        result = calc.buffett_indicator(wilshire=50000, gdp=0)
        assert result is None


class TestTrend:
    """트렌드 판별"""

    # UT-017: REQ-011 - PMI 트렌드 상승
    def test_trend_rising(self, calc):
        # 8개월 상승 추세 (3개월 전 MA 대비 현재 MA 상승)
        s = pd.Series([46, 47, 48, 49, 50, 51, 52, 53], index=pd.date_range("2025-01", periods=8, freq="ME"))
        result = calc.trend_direction(s, window=3)
        assert result == "rising"

    # UT-018: REQ-012 - 재고/출하 트렌드 하락
    def test_trend_falling(self, calc):
        s = pd.Series([1.42, 1.40, 1.38, 1.36, 1.34, 1.32, 1.30, 1.28], index=pd.date_range("2025-01", periods=8, freq="ME"))
        result = calc.trend_direction(s, window=3)
        assert result == "falling"

    # UT-019: REQ-014 - 데이터 부족
    def test_trend_insufficient(self, calc):
        s = pd.Series([50], index=pd.date_range("2025-01", periods=1, freq="ME"))
        result = calc.trend_direction(s, window=3)
        assert result is None

    # UT-020b: 미세 반등에 흔들리지 않음
    def test_trend_noise_resistant(self, calc):
        # 전반적 하락인데 마지막 1개월 미세 반등
        s = pd.Series([105, 104, 103, 102, 101, 100, 99, 99.5], index=pd.date_range("2025-01", periods=8, freq="ME"))
        result = calc.trend_direction(s, window=3)
        assert result == "falling"  # 미세 반등에도 하락 유지


class TestCPIPCE:
    """CPI/PCE YoY%"""

    # UT-020: REQ-013 - CPI YoY%
    def test_cpi_yoy(self, calc):
        # 13개월, 첫 달 300 마지막 달 309 → (309-300)/300*100 = 3.0%
        values = [300 + i * 0.75 for i in range(13)]
        s = pd.Series(values, index=pd.date_range("2024-01", periods=13, freq="ME"), dtype=float)
        result = calc.yoy_percent(s)
        assert abs(result.iloc[-1] - 3.0) < 0.1
