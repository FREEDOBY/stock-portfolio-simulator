"""키친사이클 핵심 단순화 단위 테스트

@requirement REQ-001 ~ REQ-008, EDGE-001 ~ EDGE-002
IPMAN(산업생산) + ISRATIO(재고/출하) 2개 지표만으로 Phase 판정
"""
import pytest
import pandas as pd
import numpy as np
from unittest.mock import MagicMock
from datetime import datetime

from app.services.macro_service import MacroService
from app.services.signal_engine import SignalEngine
from app.services.macro_calculator import MacroCalculator
from app.models.macro_schemas import (
    MacroRawData, SeriesData, SeriesDataPoint, DataStatus, FRED_SERIES_CONFIG,
)
from app.models.signal_schemas import SignalStatus


@pytest.fixture
def engine():
    return SignalEngine()


@pytest.fixture
def calc():
    return MacroCalculator()


def _make_series_data(series_id: str, values: list[float], months: int = 24) -> SeriesData:
    """FRED 시리즈 헬퍼"""
    dates = pd.date_range("2023-01-01", periods=len(values), freq="ME")
    return SeriesData(
        series_id=series_id, name=series_id,
        data=[SeriesDataPoint(date=d.strftime("%Y-%m-%d"), value=v) for d, v in zip(dates, values)],
        status=DataStatus.LIVE,
    )


# ─── REQ-001: IPMAN 단독으로 수요 트렌드 ───

class TestIPMANTrend:
    # UT-KS001: REQ-001 - IPMAN 상승 추세 감지
    def test_ipman_rising(self, calc):
        # YoY% slope 기반 → YoY%가 가속해야 rising (성장률 증가)
        # 처음 12개월: 느린 성장, 이후 12개월: 빠른 성장 → YoY% 상승
        values = [100 + i * 0.3 for i in range(12)] + [103.6 + i * 1.0 for i in range(12)]
        series = pd.Series(values, index=pd.date_range("2023-01", periods=24, freq="ME"))
        direction, strength = calc.trend_direction_v2(series)
        assert direction == "rising"

    # UT-KS002: REQ-001 - IPMAN 하락 추세 감지
    def test_ipman_falling(self, calc):
        # 처음 12개월: 빠른 성장, 이후 12개월: 느린/음수 성장 → YoY% 하락
        values = [100 + i * 1.5 for i in range(12)] + [118 + i * 0.1 for i in range(12)]
        series = pd.Series(values, index=pd.date_range("2023-01", periods=24, freq="ME"))
        direction, strength = calc.trend_direction_v2(series)
        assert direction == "falling"

    # UT-KS003: EDGE-001 - IPMAN 데이터 부족
    def test_ipman_insufficient(self, calc):
        values = [100, 101, 102]
        series = pd.Series(values, index=pd.date_range("2023-01", periods=3, freq="ME"))
        direction, strength = calc.trend_direction_v2(series)
        assert direction is None


# ─── REQ-002: ISRATIO 단독으로 재고 트렌드 ───

class TestISRATIOTrend:
    # UT-KS004: REQ-002 - ISRATIO 상승 (재고 쌓임, YoY% 가속)
    def test_isratio_rising(self, calc):
        # 처음 12개월: 느린 상승, 이후 12개월: 빠른 상승 → YoY% 증가
        values = [1.30 + i * 0.002 for i in range(12)] + [1.324 + i * 0.008 for i in range(12)]
        series = pd.Series(values, index=pd.date_range("2023-01", periods=24, freq="ME"))
        direction, strength = calc.trend_direction_v2(series)
        assert direction == "rising"

    # UT-KS005: REQ-002 - ISRATIO 하락 (재고 소진, YoY% 감소)
    def test_isratio_falling(self, calc):
        # 처음 12개월: 빠른 상승, 이후 12개월: 느린/정체 → YoY% 감소
        values = [1.30 + i * 0.015 for i in range(12)] + [1.48 + i * 0.001 for i in range(12)]
        series = pd.Series(values, index=pd.date_range("2023-01", periods=24, freq="ME"))
        direction, strength = calc.trend_direction_v2(series)
        assert direction == "falling"

    # UT-KS006: EDGE-002 - ISRATIO 데이터 부족
    def test_isratio_insufficient(self, calc):
        values = [1.3, 1.31]
        series = pd.Series(values, index=pd.date_range("2023-01", periods=2, freq="ME"))
        direction, strength = calc.trend_direction_v2(series)
        assert direction is None


# ─── REQ-003: 4단계 Phase 매핑 ───

class TestPhaseMapping:
    # UT-KS007: REQ-003 - Phase 1: IPMAN↑ + ISRATIO↓
    def test_phase1(self, engine):
        result = engine.signal_3_kitchen_cycle("rising", "falling", 0.8, 0.8)
        assert "Phase 1" in result.reason
        assert result.status == SignalStatus.BUY

    # UT-KS008: REQ-003 - Phase 2: IPMAN↑ + ISRATIO↑
    def test_phase2(self, engine):
        result = engine.signal_3_kitchen_cycle("rising", "rising", 0.8, 0.8)
        assert "Phase 2" in result.reason
        assert result.status == SignalStatus.BUY

    # UT-KS009: REQ-003 - Phase 3: IPMAN↓ + ISRATIO↑
    def test_phase3(self, engine):
        result = engine.signal_3_kitchen_cycle("falling", "rising", 0.8, 0.8)
        assert "Phase 3" in result.reason
        assert result.status == SignalStatus.SELL

    # UT-KS010: REQ-003 - Phase 4: IPMAN↓ + ISRATIO↓
    def test_phase4(self, engine):
        result = engine.signal_3_kitchen_cycle("falling", "falling", 0.8, 0.8)
        assert "Phase 4" in result.reason
        assert result.status == SignalStatus.WAIT

    # UT-KS011: EDGE-001/002 - 트렌드 None → 판별 불가
    def test_none_trend(self, engine):
        result = engine.signal_3_kitchen_cycle(None, "rising", 0.8, 0.8)
        assert result.status == SignalStatus.WAIT
        assert "데이터 없음" in result.reason


# ─── REQ-006: OI Ratio 제거 확인 ───

class TestOIRatioRemoved:
    # UT-KS012: REQ-006 - signal_3에 oi_ratio 파라미터 없음
    def test_no_oi_ratio_param(self, engine):
        """signal_3가 oi_ratio 없이 정상 동작"""
        result = engine.signal_3_kitchen_cycle("rising", "falling", 0.8, 0.8)
        assert result.signal_id == 3
        # OI Ratio 불일치 transitioning이 발생하지 않아야 함
        assert "Transitioning" not in result.reason


# ─── REQ-004/005: 복합투표 제거 → macro_service에서 검증 ───

class TestIndicatorsSimplified:
    # UT-KS013: REQ-004/005 - _compute_indicators에서 IPMAN+ISRATIO만 사용
    def test_compute_uses_ipman_isratio_only(self):
        """macro_service가 IPMAN, ISRATIO만으로 pmi_trend, inventory_trend 계산"""
        svc = MacroService()
        svc.fetcher = MagicMock()
        svc.calc = MacroCalculator()  # 실제 calculator 사용

        # 최소 raw 데이터: IPMAN + ISRATIO만 유효
        fred = {}
        for cfg in FRED_SERIES_CONFIG:
            sid = cfg["id"]
            fred[sid] = SeriesData(
                series_id=sid, name=sid, data=[], status=DataStatus.ERROR,
            )

        # IPMAN: 상승 가속 (YoY% slope > 0)
        ipman_vals = [100 + i * 0.3 for i in range(12)] + [103.6 + i * 1.0 for i in range(12)]
        dates = pd.date_range("2023-01-01", periods=24, freq="ME")
        fred["IPMAN"] = SeriesData(
            series_id="IPMAN", name="Industrial Production",
            data=[SeriesDataPoint(date=d.strftime("%Y-%m-%d"), value=v) for d, v in zip(dates, ipman_vals)],
            status=DataStatus.LIVE,
        )

        # ISRATIO: 하락 가속 (YoY% slope < 0)
        isratio_vals = [1.30 + i * 0.015 for i in range(12)] + [1.48 + i * 0.001 for i in range(12)]
        fred["ISRATIO"] = SeriesData(
            series_id="ISRATIO", name="Inventory/Sales Ratio",
            data=[SeriesDataPoint(date=d.strftime("%Y-%m-%d"), value=v) for d, v in zip(dates, isratio_vals)],
            status=DataStatus.LIVE,
        )

        raw = MacroRawData(
            fred_series=fred, nasdaq_weekly=[], nasdaq_daily=[],
            vix=[], dxy=[], fetched_at=datetime.now().isoformat(), errors=[],
        )
        indicators = svc._compute_indicators(raw)

        # IPMAN 상승 + ISRATIO 하락 → Phase 1
        assert indicators["pmi_trend"] == "rising"
        assert indicators["inventory_trend"] == "falling"
