"""백테스트 API 라우터"""
from fastapi import APIRouter, HTTPException

from ..services.backtest_engine import backtest_engine
from ..models.schemas import (
    BacktestRequest,
    BacktestResponse,
    BacktestMetrics,
    PortfolioValue
)

router = APIRouter(prefix="/api/backtest", tags=["Backtest"])


@router.post("", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest):
    """백테스트 실행"""
    try:
        result = backtest_engine.run_backtest(
            portfolio=[
                {"symbol": item.symbol, "weight": item.weight}
                for item in request.portfolio
            ],
            start_date=request.start_date,
            end_date=request.end_date,
            initial_amount=request.initial_amount,
            rebalance=request.rebalance
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
            }
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest failed: {str(e)}")
