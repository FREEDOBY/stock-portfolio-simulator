"""ETF 관련 API 라우터"""
from fastapi import APIRouter, Query, HTTPException

from ..services.data_fetcher import data_fetcher
from ..models.schemas import ETFInfo, ETFSearchResponse

router = APIRouter(prefix="/api/etf", tags=["ETF"])


@router.get("/search", response_model=ETFSearchResponse)
async def search_etf(q: str = Query(..., min_length=1, description="검색어")):
    """ETF 검색"""
    results = data_fetcher.search_etf(q)

    return ETFSearchResponse(
        results=[
            ETFInfo(
                symbol=etf["symbol"],
                name=etf["name"],
                expense_ratio=etf.get("expense_ratio")
            )
            for etf in results
        ]
    )


@router.get("/{symbol}", response_model=ETFInfo)
async def get_etf_info(symbol: str):
    """ETF 정보 조회"""
    info = data_fetcher.get_etf_info(symbol)

    if info is None:
        raise HTTPException(status_code=404, detail=f"ETF not found: {symbol}")

    return ETFInfo(**info)
