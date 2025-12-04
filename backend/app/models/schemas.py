"""Pydantic 스키마 정의"""
from pydantic import BaseModel, Field
from datetime import date
from typing import Optional


class PortfolioItem(BaseModel):
    """포트폴리오 내 개별 ETF"""
    symbol: str = Field(..., description="ETF 심볼 (예: SPY, QQQ)")
    weight: float = Field(..., ge=0, le=1, description="비중 (0.0 ~ 1.0)")


class BacktestRequest(BaseModel):
    """백테스트 요청"""
    portfolio: list[PortfolioItem] = Field(..., min_length=1)
    start_date: date
    end_date: date
    initial_amount: float = Field(default=10000, gt=0)
    rebalance: str = Field(
        default="quarterly",
        pattern="^(monthly|quarterly|yearly|none)$"
    )


class BacktestMetrics(BaseModel):
    """백테스트 성과 지표"""
    cagr: float = Field(..., description="연평균 복합 성장률")
    mdd: float = Field(..., description="최대 낙폭")
    sharpe_ratio: float = Field(..., description="샤프 비율")
    volatility: float = Field(..., description="연간 변동성")


class PortfolioValue(BaseModel):
    """일별 포트폴리오 가치"""
    date: str
    value: float


class BenchmarkData(BaseModel):
    """벤치마크 데이터"""
    QQQ: list[PortfolioValue]
    SPY: list[PortfolioValue]


class BacktestResponse(BaseModel):
    """백테스트 응답"""
    portfolio_values: list[PortfolioValue]
    benchmarks: dict[str, list[PortfolioValue]]
    metrics: BacktestMetrics
    benchmark_metrics: dict[str, BacktestMetrics]


class ETFInfo(BaseModel):
    """ETF 정보"""
    symbol: str
    name: str
    expense_ratio: Optional[float] = None


class ETFSearchResponse(BaseModel):
    """ETF 검색 응답"""
    results: list[ETFInfo]
