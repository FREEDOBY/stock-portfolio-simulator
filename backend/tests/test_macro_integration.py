"""매크로 데이터 수집 통합 테스트 - FRED + Yahoo 연동"""
import pytest
import pandas as pd
from unittest.mock import patch, MagicMock

from app.services.fred_service import FREDService
from app.services.macro_data_fetcher import MacroDataFetcher
from app.models.macro_schemas import (
    MacroRawData, SeriesData, DataStatus, FRED_SERIES_CONFIG
)


class TestFREDMacroIntegration:
    """FRED 서비스 ↔ MacroDataFetcher 통합"""

    # IT-001: FRED 서비스가 MacroDataFetcher와 올바르게 연동
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_fred_integration_with_fetcher(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "observations": [
                {"date": "2025-01-01", "value": "50.0"},
                {"date": "2025-02-01", "value": "51.0"},
            ]
        }
        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        # FREDService 직접 생성 → MacroDataFetcher에 주입
        fred = FREDService()
        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher.fred = fred
        fetcher._cache = {}

        result = fetcher._fetch_all_fred()

        # 18개 시리즈 모두 수집 시도
        assert len(result) == len(FRED_SERIES_CONFIG)
        # 각 시리즈가 SeriesData 타입
        for series_id, series_data in result.items():
            assert isinstance(series_data, SeriesData)

    # IT-002: 전체 fetch_all이 MacroRawData 반환
    @patch("app.services.macro_data_fetcher.yf.Ticker")
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_fetch_all_returns_complete_macro_data(self, mock_client_cls, mock_ticker_cls):
        # FRED mock
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "observations": [{"date": "2025-01-01", "value": "100.0"}]
        }
        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        # Yahoo mock
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame(
            {"Close": [15000.0, 15100.0]},
            index=pd.to_datetime(["2025-01-06", "2025-01-13"]),
        )
        mock_ticker_cls.return_value = mock_ticker

        fred = FREDService()
        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher.fred = fred
        fetcher._cache = {}

        result = fetcher.fetch_all()

        assert isinstance(result, MacroRawData)
        assert len(result.fred_series) > 0
        assert len(result.nasdaq_weekly) > 0
        assert result.fetched_at is not None

    # IT-003: 카테고리별 수집이 올바른 시리즈만 반환
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_fetch_category_returns_correct_series(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "observations": [{"date": "2025-01-01", "value": "50.0"}]
        }
        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        fred = FREDService()
        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher.fred = fred
        fetcher._cache = {}

        result = fetcher.fetch_category("liquidity")

        expected_ids = {"FEDFUNDS", "DGS10", "DGS2", "M2SL", "WALCL", "RRPONTSYD"}
        assert set(result.keys()) == expected_ids

    # IT-004: FRED 실패 + Yahoo 성공 시 부분 데이터 반환
    @patch("app.services.macro_data_fetcher.yf.Ticker")
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_partial_failure_returns_partial_data(self, mock_client_cls, mock_ticker_cls):
        # FRED 전부 실패
        mock_client = MagicMock()
        mock_client.get.side_effect = Exception("FRED down")
        mock_client_cls.return_value = mock_client

        # Yahoo 성공
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame(
            {"Close": [15000.0]},
            index=pd.to_datetime(["2025-01-06"]),
        )
        mock_ticker_cls.return_value = mock_ticker

        fred = FREDService()
        fetcher = MacroDataFetcher.__new__(MacroDataFetcher)
        fetcher.fred = fred
        fetcher._cache = {}

        result = fetcher.fetch_all()

        # FRED 데이터는 비어있지만 Yahoo는 수집됨
        assert isinstance(result, MacroRawData)
        assert len(result.nasdaq_weekly) > 0
        # FRED 시리즈는 ERROR 상태
        for series in result.fred_series.values():
            assert series.status == DataStatus.ERROR
