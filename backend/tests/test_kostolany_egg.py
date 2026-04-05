"""코스톨라니 달걀모델 단위 테스트

축 1: 금리 수준 (FEDFUNDS 현재값 >3.0% = tight, <3.0% = loose)
축 2: VIX 백분위 (>20 = fear, 14~20 = neutral, <14 = greed)

@requirement REQ-001 ~ REQ-005, EDGE-001 ~ EDGE-003
"""
import pytest
from unittest.mock import MagicMock
from datetime import datetime

from app.services.macro_service import MacroService
from app.models.macro_schemas import MacroRawData, SeriesData, SeriesDataPoint, DataStatus


def _make_raw_and_indicators(fed_rate: float | None, vix_val: float | None):
    """테스트용 raw + indicators 생성 (금리 수준 + VIX)"""
    fred = {}
    if fed_rate is not None:
        fred["FEDFUNDS"] = SeriesData(
            series_id="FEDFUNDS", name="Fed Funds Rate",
            data=[SeriesDataPoint(date="2025-06-01", value=fed_rate)],
            status=DataStatus.LIVE,
        )

    raw = MacroRawData(
        fred_series=fred, nasdaq_weekly=[], nasdaq_daily=[],
        vix=[SeriesDataPoint(date="2025-06-01", value=vix_val)] if vix_val is not None else [],
        dxy=[], fetched_at=datetime.now().isoformat(), errors=[],
    )

    indicators = {
        "fed_rate": fed_rate,
        "vix_value": vix_val,
    }
    return raw, indicators


@pytest.fixture
def service():
    svc = MacroService()
    svc.fetcher = MagicMock()
    svc.calc = MagicMock()
    svc.engine = MagicMock()
    svc.warning_engine = MagicMock()
    return svc


# ─── REQ-001: 금리 수준 → 긴축/완화 ───

class TestMonetaryStance:
    # UT-K001: 금리 4.5% → tight
    def test_tight(self, service):
        raw, ind = _make_raw_and_indicators(4.5, 17.0)
        result = service._kostolany_egg(raw, ind)
        assert result["inputs"]["monetary"] == "tight"

    # UT-K002: 금리 2.0% → loose
    def test_loose(self, service):
        raw, ind = _make_raw_and_indicators(2.0, 17.0)
        result = service._kostolany_egg(raw, ind)
        assert result["inputs"]["monetary"] == "loose"

    # UT-K003: 금리 3.0% 경계 → tight (>= 경계)
    def test_boundary(self, service):
        raw, ind = _make_raw_and_indicators(3.0, 17.0)
        result = service._kostolany_egg(raw, ind)
        assert result["inputs"]["monetary"] == "tight"

    # UT-K004: EDGE-001 - 금리 데이터 없음 → tight 기본값
    def test_no_fed_rate(self, service):
        raw, ind = _make_raw_and_indicators(None, 17.0)
        result = service._kostolany_egg(raw, ind)
        assert result["inputs"]["monetary"] == "tight"


# ─── REQ-002: VIX → 심리 판정 (백분위 기반) ───

class TestSentiment:
    # UT-K005: VIX 25 → fear (>20)
    def test_fear(self, service):
        raw, ind = _make_raw_and_indicators(4.0, 25.0)
        result = service._kostolany_egg(raw, ind)
        assert result["inputs"]["sentiment"] == "fear"

    # UT-K006: VIX 17 → neutral (14~20)
    def test_neutral(self, service):
        raw, ind = _make_raw_and_indicators(4.0, 17.0)
        result = service._kostolany_egg(raw, ind)
        assert result["inputs"]["sentiment"] == "neutral"

    # UT-K007: VIX 12 → greed (<14)
    def test_greed(self, service):
        raw, ind = _make_raw_and_indicators(4.0, 12.0)
        result = service._kostolany_egg(raw, ind)
        assert result["inputs"]["sentiment"] == "greed"

    # UT-K008: EDGE-002 - VIX None → neutral
    def test_none_vix(self, service):
        raw, ind = _make_raw_and_indicators(4.0, None)
        result = service._kostolany_egg(raw, ind)
        assert result["inputs"]["sentiment"] == "neutral"


# ─── REQ-003: 6단계 매핑 ───

class TestPhaseMapping:
    # UT-K009: tight + fear → B2 동행하락
    def test_tight_fear(self, service):
        raw, ind = _make_raw_and_indicators(4.5, 23.9)
        result = service._kostolany_egg(raw, ind)
        assert result["phase"] == "B2"

    # UT-K010: tight + neutral → B1 분배
    def test_tight_neutral(self, service):
        raw, ind = _make_raw_and_indicators(4.5, 17.0)
        result = service._kostolany_egg(raw, ind)
        assert result["phase"] == "B1"

    # UT-K011: tight + greed → A3 과열
    def test_tight_greed(self, service):
        raw, ind = _make_raw_and_indicators(4.5, 12.0)
        result = service._kostolany_egg(raw, ind)
        assert result["phase"] == "A3"

    # UT-K012: loose + fear → A1 매집
    def test_loose_fear(self, service):
        raw, ind = _make_raw_and_indicators(2.0, 25.0)
        result = service._kostolany_egg(raw, ind)
        assert result["phase"] == "A1"

    # UT-K013: loose + neutral → A2 동행
    def test_loose_neutral(self, service):
        raw, ind = _make_raw_and_indicators(2.0, 17.0)
        result = service._kostolany_egg(raw, ind)
        assert result["phase"] == "A2"

    # UT-K014: loose + greed → A3 과열
    def test_loose_greed(self, service):
        raw, ind = _make_raw_and_indicators(2.0, 12.0)
        result = service._kostolany_egg(raw, ind)
        assert result["phase"] == "A3"


# ─── REQ-004: Phase 메타데이터 ───

class TestPhaseMetadata:
    # UT-K015: 모든 Phase에 필수 필드 존재
    @pytest.mark.parametrize("fed,vix,expected_phase", [
        (4.5, 25.0, "B2"),
        (4.5, 17.0, "B1"),
        (4.5, 12.0, "A3"),
        (2.0, 25.0, "A1"),
        (2.0, 17.0, "A2"),
        (2.0, 12.0, "A3"),
    ])
    def test_metadata_fields(self, service, fed, vix, expected_phase):
        raw, ind = _make_raw_and_indicators(fed, vix)
        result = service._kostolany_egg(raw, ind)
        assert result["phase"] == expected_phase
        assert isinstance(result["name"], str) and len(result["name"]) > 0
        assert isinstance(result["desc"], str) and len(result["desc"]) > 0
        assert isinstance(result["action"], str) and len(result["action"]) > 0
        assert isinstance(result["color"], str) and result["color"].startswith("#")


# ─── REQ-007: inputs 필드 ───

class TestInputsField:
    # UT-K016: inputs 필수 키
    def test_inputs_keys(self, service):
        raw, ind = _make_raw_and_indicators(4.5, 20.0)
        result = service._kostolany_egg(raw, ind)
        inputs = result["inputs"]
        assert "monetary" in inputs
        assert "fed_rate" in inputs
        assert "vix" in inputs
        assert "sentiment" in inputs


# ─── 현재 시장 시나리오 검증 ───

class TestCurrentMarket:
    # 금리 4.5% + VIX 23.9 → B2 동행하락
    def test_april_2026_scenario(self, service):
        raw, ind = _make_raw_and_indicators(4.5, 23.9)
        result = service._kostolany_egg(raw, ind)
        assert result["phase"] == "B2"
        assert result["inputs"]["monetary"] == "tight"
        assert result["inputs"]["sentiment"] == "fear"
