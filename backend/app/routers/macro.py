"""매크로 분석 API 라우터"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.macro_service import macro_service, VALID_CATEGORIES

router = APIRouter(prefix="/api/macro", tags=["Macro"])


class ElliottInput(BaseModel):
    """엘리엇 파동 수동 입력"""
    count: int = Field(..., ge=0, le=3, description="엘리엇 5파동 연속 출현 횟수 (0~3)")


class CapexCompanyInput(BaseModel):
    """빅테크 캐펙스 가이던스 수동 입력 (핵심 판별자)"""
    company: str = Field(..., description="alphabet | microsoft | meta | amazon | tsmc | broadcom")
    status: str = Field(..., pattern="^(up|flat|down)$", description="up(상향/유지) | flat(중립) | down(둔화/하향)")


class DramInput(BaseModel):
    """D램 가격 상승률 수동 입력 (엔진 기울기)"""
    yoy: float = Field(..., description="D램 가격 상승률 % (예: 15.0)")
    momentum: str = Field(..., pattern="^(accel|decel)$", description="accel(가속) | decel(감속)")


class KospiManualInput(BaseModel):
    """코스피 저점 수동 입력 (신용잔고 추이 + 반대매매)"""
    credit: str = Field(..., pattern="^(rising|falling|stalling)$", description="신용잔고: rising(증가) | falling(청산중) | stalling(멈춤)")
    forced: str = Field(..., pattern="^(spike|normal|easing)$", description="반대매매: spike(급증) | normal | easing(진정)")


@router.get("/dashboard")
async def get_dashboard():
    """매크로 대시보드 - 종합 판정 + 카테고리 요약 + 시그널"""
    try:
        return macro_service.get_dashboard()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard failed: {str(e)}")


@router.get("/category/{name}")
async def get_category_detail(name: str):
    """카테고리별 상세 데이터"""
    if name not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {name}. Valid: {VALID_CATEGORIES}")

    try:
        return macro_service.get_category_detail(name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Category fetch failed: {str(e)}")


@router.get("/signals/history")
async def get_signal_history():
    """시그널 상태 변경 이력"""
    return macro_service.get_signal_history()


@router.post("/elliott")
async def set_elliott(input: ElliottInput):
    """엘리엇 파동 수동 입력 (0~3)"""
    return macro_service.set_elliott_count(input.count)


@router.post("/capex/company")
async def set_capex_company(input: CapexCompanyInput):
    """빅테크 캐펙스 가이던스 수동 입력"""
    try:
        return macro_service.set_capex_company(input.company, input.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/capex/dram")
async def set_dram(input: DramInput):
    """D램 가격 상승률 수동 입력"""
    return macro_service.set_dram(input.yoy, input.momentum)


@router.get("/kospi-bottom")
async def get_kospi_bottom(refresh: bool = False):
    """코스피 저점 판정 - 파라볼릭 되돌림 + 낙폭 밴드 + 신용/반대매매 (refresh=true 시 즉시 재취득)"""
    try:
        return macro_service.get_kospi_bottom(force=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"KOSPI bottom failed: {str(e)}")


@router.get("/nasdaq-bottom")
async def get_nasdaq_bottom(refresh: bool = False):
    """나스닥 저점 판정 - 파라볼릭 되돌림 + 낙폭 밴드 + 역대 약세장"""
    try:
        return macro_service.get_nasdaq_bottom(force=refresh)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"NASDAQ bottom failed: {str(e)}")


@router.post("/kospi/manual")
async def set_kospi_manual(input: KospiManualInput):
    """코스피 저점 수동 입력 (신용잔고 + 반대매매)"""
    try:
        return macro_service.set_kospi_manual(input.credit, input.forced)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/kofia/test")
async def kofia_test():
    """KOFIA 신용공여잔고 OpenAPI 연결 테스트 (키 발급 후 필드명 확인용)"""
    from ..services.kofia_fetcher import kofia_fetcher
    if not kofia_fetcher.enabled:
        return {"enabled": False, "hint": "KOFIA_API_KEY(.env) 미설정"}
    try:
        return {"enabled": True, "raw": kofia_fetcher.raw_sample(), "parsed": kofia_fetcher.get_credit_balance()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"KOFIA call failed: {str(e)}")


@router.get("/customs/test")
async def customs_test():
    """관세청 반도체 수출 API 연결 테스트 (활용신청 반영 확인용)"""
    from ..services.customs_export_fetcher import customs_export_fetcher
    if not customs_export_fetcher.enabled:
        return {"enabled": False, "hint": "KOFIA_API_KEY(.env) 미설정"}
    return {"enabled": True, "raw": customs_export_fetcher.raw_sample(),
            "parsed": customs_export_fetcher.get_semiconductor_export()}


@router.get("/debug/kitchin")
async def debug_kitchin():
    """키친사이클 디버그 - 각 지표 트렌드 상세"""
    try:
        return macro_service.debug_kitchin_cycle()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")
