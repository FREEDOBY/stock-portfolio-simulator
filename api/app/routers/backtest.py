"""백테스트 API 라우터"""
from fastapi import APIRouter, HTTPException

from ..services.backtest_engine import backtest_engine
from ..models.schemas import (
    BacktestRequest,
    BacktestResponse,
    BacktestMetrics,
    PortfolioValue,
    InvestmentType,
    DividendStats,
    MonthlyDividend
)

router = APIRouter(prefix="/api/backtest", tags=["Backtest"])


@router.post("", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest):
    """백테스트 실행"""
    # DCA 설정 유효성 검증
    if request.investment_type == InvestmentType.DCA:
        if not request.dca_settings:
            raise HTTPException(
                status_code=400,
                detail="DCA settings required for DCA investment type"
            )

    try:
        result = backtest_engine.run_backtest(
            portfolio=[
                {"symbol": item.symbol, "weight": item.weight}
                for item in request.portfolio
            ],
            start_date=request.start_date,
            end_date=request.end_date,
            initial_amount=request.initial_amount,
            rebalance=request.rebalance,
            investment_type=request.investment_type.value,
            dca_settings=(
                request.dca_settings.model_dump()
                if request.dca_settings else None
            )
        )

        # 배당 통계 변환
        dividend_stats = None
        if result.get("dividend_stats"):
            ds = result["dividend_stats"]
            dividend_stats = DividendStats(
                total_dividends=ds["total_dividends"],
                dividend_yield=ds["dividend_yield"],
                monthly_average=ds["monthly_average"],
                monthly_data=[
                    MonthlyDividend(**md) for md in ds["monthly_data"]
                ],
                by_etf=ds["by_etf"]
            )

        return BacktestResponse(
            portfolio_values=[
                PortfolioValue(**pv) for pv in result["portfolio_values"]
            ],
            benchmarks={
                symbol: [PortfolioValue(**pv) for pv in values]
                for symbol, values in result["benchmarks"].items()
            },
            metrics=BacktestMetrics(**result["metrics"]),
            benchmark_metrics={
                symbol: BacktestMetrics(**metrics)
                for symbol, metrics in result["benchmark_metrics"].items()
            },
            total_invested=result["total_invested"],
            dividend_stats=dividend_stats
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")
