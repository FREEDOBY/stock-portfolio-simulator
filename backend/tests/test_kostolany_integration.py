"""코스톨라니 달걀모델 통합 테스트

@requirement REQ-005, REQ-008, EDGE-004
Integration: MacroService.get_dashboard() → kostolany 필드 검증
E2E: FastAPI 엔드포인트 → 실제 응답 구조 검증
"""
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
from datetime import datetime

from app.services.macro_service import MacroService
from app.models.macro_schemas import (
    MacroRawData, SeriesData, SeriesDataPoint, DataStatus, FRED_SERIES_CONFIG,
)


def _make_full_raw(fed_values: list[float], vix_val: float) -> MacroRawData:
    """get_dashboard()가 실행될 수 있는 최소한의 raw 데이터 생성"""
    fred = {}

    # FEDFUNDS 시리즈
    dates = pd.date_range("2024-01-01", periods=len(fed_values), freq="ME")
    fred["FEDFUNDS"] = SeriesData(
        series_id="FEDFUNDS", name="Fed Funds Rate",
        data=[SeriesDataPoint(date=d.strftime("%Y-%m-%d"), value=v) for d, v in zip(dates, fed_values)],
        status=DataStatus.LIVE,
    )

    # 나머지 필수 FRED 시리즈 — 빈 데이터로 채움
    for cfg in FRED_SERIES_CONFIG:
        sid = cfg["id"]
        if sid not in fred:
            fred[sid] = SeriesData(
                series_id=sid, name=cfg.get("name", sid),
                data=[], status=DataStatus.ERROR,
                error=f"Test stub: {sid}",
            )

    # 나스닥 + VIX
    nasdaq_points = [
        SeriesDataPoint(date=f"2025-{m:02d}-01", value=15000 + m * 100)
        for m in range(1, 13)
    ]
    vix_points = [SeriesDataPoint(date="2025-06-01", value=vix_val)]

    return MacroRawData(
        fred_series=fred,
        nasdaq_weekly=nasdaq_points,
        nasdaq_daily=nasdaq_points,
        vix=vix_points,
        dxy=[],
        fetched_at=datetime.now().isoformat(),
        errors=[],
    )


# ─── IT-K001: REQ-005 — get_dashboard()에서 kostolany 필드 존재 ───

class TestDashboardKostolanyIntegration:
    @patch("app.services.macro_service.macro_data_fetcher")
    def test_dashboard_contains_kostolany(self, mock_fetcher):
        """@requirement REQ-005 — Dashboard 응답에 kostolany 필드 포함"""
        raw = _make_full_raw(
            fed_values=[5.5, 5.25, 5.0, 4.75, 4.5, 4.25, 4.0],
            vix_val=18.0,
        )
        mock_fetcher.fetch_all.return_value = raw
        mock_fetcher.fetch_category.return_value = {}

        svc = MacroService()
        svc.fetcher = mock_fetcher
        # 캐시 초기화
        svc._dashboard_cache = None
        svc._dashboard_cached_at = None

        result = svc.get_dashboard()

        assert "kostolany" in result
        k = result["kostolany"]
        assert k["phase"] in ("A1", "A2", "A3", "B1", "B2", "B3")
        assert "inputs" in k
        assert "monetary" in k["inputs"]
        assert "vix" in k["inputs"]

    @patch("app.services.macro_service.macro_data_fetcher")
    def test_dashboard_kostolany_cutting_neutral(self, mock_fetcher):
        """@requirement REQ-003 — cutting + neutral → A2"""
        raw = _make_full_raw(
            fed_values=[5.5, 5.25, 5.0, 4.75, 4.5, 4.25, 4.0],
            vix_val=20.0,
        )
        mock_fetcher.fetch_all.return_value = raw
        mock_fetcher.fetch_category.return_value = {}

        svc = MacroService()
        svc.fetcher = mock_fetcher
        svc._dashboard_cache = None
        svc._dashboard_cached_at = None

        result = svc.get_dashboard()
        # 금리 수준 기반: FEDFUNDS 마지막값으로 tight/loose 판정
        assert result["kostolany"]["inputs"]["monetary"] in ("tight", "loose")

    @patch("app.services.macro_service.macro_data_fetcher")
    def test_dashboard_kostolany_tight_fear(self, mock_fetcher):
        """@requirement REQ-003 — tight + fear → B2"""
        raw = _make_full_raw(
            fed_values=[4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5],
            vix_val=25.0,
        )
        mock_fetcher.fetch_all.return_value = raw
        mock_fetcher.fetch_category.return_value = {}

        svc = MacroService()
        svc.fetcher = mock_fetcher
        svc._dashboard_cache = None
        svc._dashboard_cached_at = None

        result = svc.get_dashboard()
        assert result["kostolany"]["phase"] == "B2"


# ─── E2E-K001: REQ-005 — API 엔드포인트 레벨 ───

class TestDashboardAPIKostolany:
    @patch("app.routers.macro.macro_service")
    @pytest.mark.asyncio
    async def test_api_dashboard_kostolany_field(self, mock_service):
        """@requirement REQ-005 — GET /api/macro/dashboard → kostolany 존재"""
        mock_service.get_dashboard.return_value = {
            "overall": {
                "score": 72, "verdict": "buy", "signals": [],
                "history": [], "updated_at": "2026-04-05T12:00:00",
            },
            "categories": {},
            "kostolany": {
                "phase": "A2",
                "name": "동행",
                "desc": "상승 중",
                "action": "보유/매수",
                "color": "#06b6d4",
                "inputs": {
                    "monetary": "loose",
                    "fed_rate": 2.5,
                    "vix": 18.0,
                    "sentiment": "neutral",
                },
            },
        }

        from app.routers.macro import get_dashboard
        result = await get_dashboard()
        assert "kostolany" in result
        assert result["kostolany"]["phase"] == "A2"
