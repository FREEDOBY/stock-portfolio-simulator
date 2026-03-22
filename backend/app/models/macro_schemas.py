"""매크로 데이터 Pydantic 스키마"""
from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class DataStatus(str, Enum):
    """데이터 상태"""
    LIVE = "live"
    CACHED = "cached"
    ERROR = "error"


class SeriesDataPoint(BaseModel):
    """시계열 데이터 포인트"""
    date: str
    value: float


class SeriesData(BaseModel):
    """단일 시리즈 데이터"""
    series_id: str
    name: str
    data: list[SeriesDataPoint] = Field(default_factory=list)
    status: DataStatus = DataStatus.LIVE
    error: Optional[str] = None
    last_updated: Optional[str] = None


class MacroRawData(BaseModel):
    """매크로 원시 데이터 (전체)"""
    # FRED 시리즈
    fred_series: dict[str, SeriesData] = Field(default_factory=dict)
    # Yahoo Finance
    nasdaq_weekly: list[SeriesDataPoint] = Field(default_factory=list)
    nasdaq_daily: list[SeriesDataPoint] = Field(default_factory=list)
    vix: list[SeriesDataPoint] = Field(default_factory=list)
    dxy: list[SeriesDataPoint] = Field(default_factory=list)
    # 메타
    fetched_at: Optional[str] = None
    errors: list[str] = Field(default_factory=list)


# FRED 시리즈 설정
FRED_SERIES_CONFIG = [
    {"id": "USALOLITOAASTSAM", "name": "OECD CLI (미국)", "months": 24},
    {"id": "IPMAN", "name": "산업생산 제조업지수", "months": 24},
    {"id": "DGORDER", "name": "내구재 신규주문", "months": 24},
    {"id": "AMTMNO", "name": "제조업 신규주문", "months": 24},
    {"id": "ISRATIO", "name": "총사업 재고/출하 비율", "months": 60},
    {"id": "T10Y2Y", "name": "10Y-2Y 금리차", "months": 60},
    {"id": "FEDFUNDS", "name": "Fed 기준금리", "months": 60},
    {"id": "DGS10", "name": "국채 10년물", "months": 24},
    {"id": "DGS2", "name": "국채 2년물", "months": 24},
    {"id": "M2SL", "name": "M2 통화량", "months": 60},
    {"id": "WALCL", "name": "연준 총자산", "months": 60},
    {"id": "RRPONTSYD", "name": "역레포 잔고", "months": 24},
    {"id": "BAMLH0A0HYM2", "name": "하이일드 스프레드", "months": 60},
    {"id": "ICSA", "name": "신규 실업수당 청구건수", "months": 24},
    {"id": "CPIAUCSL", "name": "CPI 소비자물가", "months": 60},
    {"id": "PCEPILFE", "name": "Core PCE", "months": 60},
    {"id": "NCBCEL", "name": "비금융기업 시가총액", "months": 120},
    {"id": "GDP", "name": "미국 GDP", "months": 120},
]
