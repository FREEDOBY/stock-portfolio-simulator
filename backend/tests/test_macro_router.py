"""매크로 API 라우터 테스트 - 직접 호출 방식"""
import pytest
from unittest.mock import patch, MagicMock

from app.routers.macro import router, ElliottInput
from app.services.macro_service import VALID_CATEGORIES


# ─── 대시보드 엔드포인트 ───

class TestDashboardEndpoint:
    # UT-001: REQ-001 - dashboard 서비스 호출
    @patch("app.routers.macro.macro_service")
    @pytest.mark.asyncio
    async def test_dashboard_returns_overall_result(self, mock_service):
        mock_service.get_dashboard.return_value = {
            "overall": {
                "score": 0.45, "verdict": "buy", "signals": [],
                "history": [], "updated_at": "2026-03-21T12:00:00",
            },
            "categories": {},
        }

        from app.routers.macro import get_dashboard
        result = await get_dashboard()
        assert "overall" in result
        assert result["overall"]["verdict"] == "buy"

    # UT-002: REQ-007 - 서비스 에러 시 HTTPException
    @patch("app.routers.macro.macro_service")
    @pytest.mark.asyncio
    async def test_dashboard_handles_service_error(self, mock_service):
        mock_service.get_dashboard.side_effect = Exception("FRED API down")

        from app.routers.macro import get_dashboard
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await get_dashboard()
        assert exc_info.value.status_code == 500


# ─── 카테고리 엔드포인트 ───

class TestCategoryEndpoint:
    # UT-003: REQ-002 - 유효한 카테고리
    @patch("app.routers.macro.macro_service")
    @pytest.mark.asyncio
    async def test_category_returns_series_data(self, mock_service):
        mock_service.get_category_detail.return_value = {
            "FEDFUNDS": {"series_id": "FEDFUNDS", "name": "Fed", "data": [], "status": "live"}
        }

        from app.routers.macro import get_category_detail
        result = await get_category_detail("liquidity")
        assert "FEDFUNDS" in result

    # UT-004: REQ-002 - 잘못된 카테고리
    @pytest.mark.asyncio
    async def test_invalid_category_returns_400(self):
        from app.routers.macro import get_category_detail
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await get_category_detail("invalid_category")
        assert exc_info.value.status_code == 400


# ─── 시그널 히스토리 ───

class TestHistoryEndpoint:
    # UT-005: REQ-003 - 히스토리 반환
    @patch("app.routers.macro.macro_service")
    @pytest.mark.asyncio
    async def test_history_returns_entries(self, mock_service):
        mock_service.get_signal_history.return_value = [
            {"date": "2026-01-15", "signal_id": 4, "prev_status": "wait", "new_status": "sell", "reason": "MACD"},
        ]

        from app.routers.macro import get_signal_history
        result = await get_signal_history()
        assert len(result) == 1
        assert result[0]["signal_id"] == 4


# ─── 엘리엇 입력 ───

class TestElliottEndpoint:
    # UT-006: REQ-004 - 정상 입력
    @patch("app.routers.macro.macro_service")
    @pytest.mark.asyncio
    async def test_elliott_input(self, mock_service):
        mock_service.set_elliott_count.return_value = {"elliott_count": 2, "status": "updated"}

        from app.routers.macro import set_elliott
        result = await set_elliott(ElliottInput(count=2))
        assert result["elliott_count"] == 2

    # UT-007: REQ-004 - 범위 초과 (Pydantic validation)
    def test_elliott_invalid_range(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ElliottInput(count=5)

    # UT-008: REQ-004 - 범위 내 경계값
    def test_elliott_boundary_values(self):
        assert ElliottInput(count=0).count == 0
        assert ElliottInput(count=3).count == 3


# ─── 라우터 등록 확인 ───

class TestRouterRegistration:
    # UT-009: REQ-005 - 라우터가 main app에 등록
    def test_macro_router_registered(self):
        from app.main import app
        routes = [r.path for r in app.routes]
        assert "/api/macro/dashboard" in routes
        assert "/api/macro/signals/history" in routes
        assert "/api/macro/elliott" in routes
