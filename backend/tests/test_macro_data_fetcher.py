"""매크로 데이터 수집 통합 테스트"""
import pytest
import pandas as pd
from unittest.mock import patch, MagicMock, PropertyMock

from app.services.macro_data_fetcher import MacroDataFetcher
from app.models.macro_schemas import MacroRawData, SeriesData, DataStatus


class TestMacroDataFetcher:
    """매크로 데이터 통합 수집 테스트"""

    # UT-009: REQ-003 - Yahoo Finance 나스닥 주봉 수집
    @patch("app.services.macro_data_fetcher.yf.Ticker")
    def test_should_fetch_nasdaq_weekly(self, mock_ticker_cls):
        mock_ticker = MagicMock()
        mock_df = pd.DataFrame(
            {"Close": [15000.0, 15100.0, 15200.0]},
            index=pd.to_datetime(["2025-01-06", "2025-01-13", "2025-01-20"]),
        )
        mock_ticker.history.return_value = mock_df
        mock_ticker_cls.return_value = mock_ticker

        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher._cache = {}
        result = fetcher._fetch_yahoo_series("^IXIC", interval="1wk", period="max")

        assert isinstance(result, pd.DataFrame)
        assert len(result) == 3

    # UT-010: REQ-003 - Yahoo Finance VIX 수집
    @patch("app.services.macro_data_fetcher.yf.Ticker")
    def test_should_fetch_vix(self, mock_ticker_cls):
        mock_ticker = MagicMock()
        mock_df = pd.DataFrame(
            {"Close": [18.5, 22.3]},
            index=pd.to_datetime(["2025-01-01", "2025-01-02"]),
        )
        mock_ticker.history.return_value = mock_df
        mock_ticker_cls.return_value = mock_ticker

        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher._cache = {}
        result = fetcher._fetch_yahoo_series("^VIX", interval="1d", period="2y")

        assert isinstance(result, pd.DataFrame)
        assert len(result) == 2

    # UT-011: REQ-004 - 나스닥 주봉 1300주 이상 요청
    @patch("app.services.macro_data_fetcher.yf.Ticker")
    def test_nasdaq_weekly_should_request_max_period(self, mock_ticker_cls):
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame(
            {"Close": [15000.0]},
            index=pd.to_datetime(["2025-01-06"]),
        )
        mock_ticker_cls.return_value = mock_ticker

        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher._cache = {}
        fetcher._fetch_yahoo_series("^IXIC", interval="1wk", period="max")

        mock_ticker.history.assert_called_once_with(interval="1wk", period="max")

    # UT-012: REQ-006 - 통합 수집 함수
    @patch.object(MacroDataFetcher, "_fetch_all_fred")
    @patch.object(MacroDataFetcher, "_fetch_all_yahoo")
    def test_fetch_all_should_combine_data(self, mock_yahoo, mock_fred):
        mock_fred.return_value = {
            "NAPM": SeriesData(
                series_id="NAPM",
                name="ISM PMI",
                data=[{"date": "2025-01-01", "value": 50.0}],
            )
        }
        mock_yahoo.return_value = {
            "nasdaq_weekly": [],
            "nasdaq_daily": [],
            "vix": [],
            "dxy": [],
        }

        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher.fred = MagicMock()
        fetcher._cache = {}
        result = fetcher.fetch_all()

        assert isinstance(result, MacroRawData)
        assert "NAPM" in result.fred_series

    # UT-013: REQ-007 - Pydantic 스키마 검증
    def test_macro_raw_data_schema(self):
        data = MacroRawData(
            fred_series={
                "NAPM": SeriesData(
                    series_id="NAPM",
                    name="ISM PMI",
                    data=[{"date": "2025-01-01", "value": 50.0}],
                    status=DataStatus.LIVE,
                )
            },
            nasdaq_weekly=[{"date": "2025-01-06", "value": 15000.0}],
            fetched_at="2026-03-21T12:00:00",
        )
        assert data.fred_series["NAPM"].series_id == "NAPM"
        assert data.fred_series["NAPM"].status == DataStatus.LIVE
        assert len(data.nasdaq_weekly) == 1

    # UT-014: REQ-005 - Yahoo Finance 실패 시 빈 데이터
    @patch("app.services.macro_data_fetcher.yf.Ticker")
    def test_yahoo_failure_should_return_empty(self, mock_ticker_cls):
        mock_ticker = MagicMock()
        mock_ticker.history.side_effect = Exception("Network error")
        mock_ticker_cls.return_value = mock_ticker

        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher._cache = {}
        result = fetcher._fetch_yahoo_series("^VIX", interval="1d", period="2y")

        assert isinstance(result, pd.DataFrame)
        assert len(result) == 0
