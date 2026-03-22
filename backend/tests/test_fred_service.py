"""FRED API 서비스 단위 테스트"""
import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
from datetime import datetime

from app.services.fred_service import FREDService


class TestFREDServiceInit:
    """FRED 서비스 초기화 테스트"""

    # UT-001: REQ-002 - API 키 환경변수에서 읽기
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key_123"})
    def test_should_load_api_key_from_env(self):
        service = FREDService()
        assert service._api_key == "test_key_123"

    # UT-002: REQ-002 - API 키 없으면 빈 문자열
    @patch.dict("os.environ", {}, clear=True)
    def test_should_handle_missing_api_key(self):
        service = FREDService()
        assert service._api_key == ""


class TestGetSeries:
    """FRED 시리즈 수집 테스트"""

    # UT-003: REQ-001 - 정상 데이터 수집
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_should_fetch_series_data(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "observations": [
                {"date": "2025-01-01", "value": "50.5"},
                {"date": "2025-02-01", "value": "51.2"},
                {"date": "2025-03-01", "value": "."},  # FRED uses "." for missing
            ]
        }
        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        service = FREDService()
        df = service.get_series("NAPM", months_back=3)

        assert isinstance(df, pd.DataFrame)
        assert len(df) == 2  # "." 값은 제외
        assert "value" in df.columns

    # UT-004: REQ-001 - 잘못된 시리즈 ID
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_should_raise_on_invalid_series(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.raise_for_status.side_effect = Exception("Bad Request")
        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        service = FREDService()
        # API 에러 시 빈 DataFrame 반환 (부분 실패 허용)
        df = service.get_series("INVALID_ID", months_back=3)
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 0


class TestCaching:
    """캐싱 테스트"""

    # UT-005: REQ-005 - 첫 호출 성공 후 캐시 저장
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_should_cache_successful_response(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "observations": [
                {"date": "2025-01-01", "value": "50.0"},
            ]
        }
        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        service = FREDService()
        service.get_series("NAPM", months_back=3)

        assert "NAPM:3" in service._cache

    # UT-006: REQ-005 - API 실패 시 캐시 반환
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_should_return_cache_on_failure(self, mock_client_cls):
        # 첫 호출: 성공
        mock_response_ok = MagicMock()
        mock_response_ok.status_code = 200
        mock_response_ok.json.return_value = {
            "observations": [
                {"date": "2025-01-01", "value": "50.0"},
            ]
        }

        # 두 번째 호출: 실패
        mock_response_fail = MagicMock()
        mock_response_fail.status_code = 500
        mock_response_fail.raise_for_status.side_effect = Exception("Server Error")

        mock_client = MagicMock()
        mock_client.get.side_effect = [mock_response_ok, mock_response_fail]
        mock_client_cls.return_value = mock_client

        service = FREDService()
        # 첫 호출: 성공 → 캐시 저장
        df1 = service.get_series("NAPM", months_back=3)
        assert len(df1) == 1

        # 캐시 TTL을 0으로 설정하여 강제 재요청
        service._cache["NAPM:3"].ttl = 0

        # 두 번째 호출: 실패 → 캐시 반환
        df2 = service.get_series("NAPM", months_back=3)
        assert len(df2) == 1  # 캐시된 데이터 반환


class TestGetMultipleSeries:
    """다중 시리즈 수집 테스트"""

    # UT-007: REQ-006 - 여러 시리즈 한 번에 수집
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_should_fetch_multiple_series(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "observations": [
                {"date": "2025-01-01", "value": "100.0"},
            ]
        }
        mock_client = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        service = FREDService()
        configs = [
            {"id": "NAPM", "name": "ISM PMI", "months": 24},
            {"id": "FEDFUNDS", "name": "Fed Rate", "months": 60},
        ]
        result = service.get_multiple_series(configs)

        assert "NAPM" in result
        assert "FEDFUNDS" in result

    # UT-008: REQ-005 (NFR-002) - 개별 실패가 전체 실패로 이어지지 않음
    @patch("app.services.fred_service.httpx.Client")
    @patch.dict("os.environ", {"FRED_API_KEY": "test_key"})
    def test_partial_failure_should_not_block_others(self, mock_client_cls):
        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.json.return_value = {
            "observations": [{"date": "2025-01-01", "value": "50.0"}]
        }

        fail_response = MagicMock()
        fail_response.status_code = 500
        fail_response.raise_for_status.side_effect = Exception("Error")

        mock_client = MagicMock()
        mock_client.get.side_effect = [ok_response, fail_response]
        mock_client_cls.return_value = mock_client

        service = FREDService()
        configs = [
            {"id": "NAPM", "name": "ISM PMI", "months": 24},
            {"id": "BAD_ID", "name": "Bad Series", "months": 24},
        ]
        result = service.get_multiple_series(configs)

        assert "NAPM" in result
        assert len(result["NAPM"]) == 1
        assert "BAD_ID" in result
        assert len(result["BAD_ID"]) == 0  # 빈 DataFrame
