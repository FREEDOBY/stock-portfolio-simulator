"""매크로 분석 API 라우터"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.macro_service import macro_service, VALID_CATEGORIES

router = APIRouter(prefix="/api/macro", tags=["Macro"])


class ElliottInput(BaseModel):
    """엘리엇 파동 수동 입력"""
    count: int = Field(..., ge=0, le=3, description="엘리엇 5파동 연속 출현 횟수 (0~3)")


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


@router.get("/debug/kitchin")
async def debug_kitchin():
    """키친사이클 디버그 - 각 지표 트렌드 상세"""
    try:
        return macro_service.debug_kitchin_cycle()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Debug failed: {str(e)}")
