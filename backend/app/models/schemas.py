"""Pydantic 스키마 정의"""
from pydantic import BaseModel, Field
from datetime import date
from typing import Optional
from enum import Enum


class InvestmentType(str, Enum):
    """투자 방식"""
    LUMP_SUM = "lump_sum"  # 거치식
    DCA = "dca"            # 적립식
    MA_DCA = "ma_dca"      # 이동평균 기반 적립식


class DCAFrequency(str, Enum):
    """적립식 투자 주기"""
    DAILY = "daily"        # 매일
    WEEKLY = "weekly"      # 매주
    BIWEEKLY = "biweekly"  # 격주
    MONTHLY = "monthly"    # 매월


class DCASettings(BaseModel):
    """적립식 투자 설정"""
    frequency: DCAFrequency = Field(
        default=DCAFrequency.MONTHLY,
        description="투자 주기"
    )
    amount: float = Field(
        ...,
        gt=0,
        description="주기별 투자 금액"
    )


class MADCASettings(BaseModel):
    """이동평균 기반 적립식 투자 설정"""
    frequency: DCAFrequency = Field(
        default=DCAFrequency.MONTHLY,
        description="투자 주기"
    )
    amount: float = Field(
        ...,
        gt=0,
        description="주기별 기본 투자 금액"
    )
    ma_period: int = Field(
        default=120,
        ge=5,
        le=365,
        description="이동평균 기간 (일)"
    )
    multiplier: float = Field(
        default=2.0,
        ge=1.0,
        le=5.0,
        description="저가 매수 배수 (현재가 < MA일 때)"
    )


class PortfolioItem(BaseModel):
    """포트폴리오 내 개별 ETF"""
    symbol: str = Field(..., description="ETF 심볼 (예: SPY, QQQ)")
    weight: float = Field(..., ge=0, le=1, description="비중 (0.0 ~ 1.0)")


class BacktestRequest(BaseModel):
    """백테스트 요청"""
    portfolio: list[PortfolioItem] = Field(..., min_length=1)
    start_date: date
    end_date: date
    initial_amount: float = Field(default=10000, ge=0)  # 적립식에서 0 허용
    rebalance: str = Field(
        default="quarterly",
        pattern="^(monthly|quarterly|yearly|none)$"
    )
    investment_type: InvestmentType = Field(
        default=InvestmentType.LUMP_SUM,
        description="투자 방식 (거치식/적립식)"
    )
    dca_settings: Optional[DCASettings] = Field(
        default=None,
        description="적립식 설정 (investment_type이 dca일 때 사용)"
    )
    ma_dca_settings: Optional[MADCASettings] = Field(
        default=None,
        description="이동평균 기반 적립식 설정 (investment_type이 ma_dca일 때 사용)"
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
    invested: Optional[float] = Field(
        default=None,
        description="해당 날짜까지의 누적 투자원금 (적립식일 때만 포함)"
    )


class BenchmarkData(BaseModel):
    """벤치마크 데이터"""
    QQQ: list[PortfolioValue]
    SPY: list[PortfolioValue]


class MonthlyDividend(BaseModel):
    """월별 배당 데이터"""
    month: str = Field(..., description="월 (YYYY-MM)")
    amount: float = Field(..., description="총 배당금")
    by_etf: dict[str, float] = Field(default_factory=dict, description="ETF별 배당금")


class DividendStats(BaseModel):
    """배당 통계"""
    total_dividends: float = Field(..., description="총 배당금")
    dividend_yield: float = Field(..., description="배당 수익률 (%)")
    monthly_average: float = Field(..., description="월평균 배당금")
    monthly_data: list[MonthlyDividend] = Field(default_factory=list, description="월별 배당 데이터")
    by_etf: dict[str, float] = Field(default_factory=dict, description="ETF별 총 배당금")


class BacktestResponse(BaseModel):
    """백테스트 응답"""
    portfolio_values: list[PortfolioValue]
    benchmarks: dict[str, list[PortfolioValue]]
    metrics: BacktestMetrics
    benchmark_metrics: dict[str, BacktestMetrics]
    total_invested: float = Field(..., description="총 투자 원금")
    dividend_stats: Optional[DividendStats] = Field(default=None, description="배당 통계")


class ETFInfo(BaseModel):
    """ETF 정보"""
    symbol: str
    name: str
    expense_ratio: Optional[float] = None


class ETFSearchResponse(BaseModel):
    """ETF 검색 응답"""
    results: list[ETFInfo]
