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
    # 반도체 레짐용 (메모리 3사 + 로직/섹터)
    micron: list[SeriesDataPoint] = Field(default_factory=list)
    sk_hynix: list[SeriesDataPoint] = Field(default_factory=list)
    samsung: list[SeriesDataPoint] = Field(default_factory=list)
    sox: list[SeriesDataPoint] = Field(default_factory=list)
    nvda: list[SeriesDataPoint] = Field(default_factory=list)
    avgo: list[SeriesDataPoint] = Field(default_factory=list)
    # 코스피 저점 판정기용
    kospi: list[SeriesDataPoint] = Field(default_factory=list)
    kospi_monthly: list[SeriesDataPoint] = Field(default_factory=list)  # 전체이력 월봉
    # 메타
    fetched_at: Optional[str] = None
    errors: list[str] = Field(default_factory=list)


# FRED 시리즈 설정
FRED_SERIES_CONFIG = [
    {"id": "USALOLITOAASTSAM", "name": "OECD CLI (미국)", "months": 360},
    {"id": "IPMAN", "name": "산업생산 제조업지수", "months": 360},
    {"id": "DGORDER", "name": "내구재 신규주문", "months": 360},
    {"id": "AMTMNO", "name": "제조업 신규주문", "months": 360},
    {"id": "NEWORDER", "name": "제조업 신규주문 (Census)", "months": 360},
    {"id": "PERMIT", "name": "건축허가건수", "months": 360},
    {"id": "ACDGNO", "name": "자본재 신규주문 (방산제외)", "months": 360},
    {"id": "ISRATIO", "name": "총사업 재고/출하 비율", "months": 360},
    {"id": "BUSINV", "name": "총사업 재고", "months": 360},
    {"id": "T10Y2Y", "name": "10Y-2Y 금리차", "months": 360},
    {"id": "FEDFUNDS", "name": "Fed 기준금리", "months": 360},
    {"id": "DGS10", "name": "국채 10년물", "months": 360},
    {"id": "DGS2", "name": "국채 2년물", "months": 360},
    {"id": "M2SL", "name": "M2 통화량", "months": 360},
    {"id": "WALCL", "name": "연준 총자산", "months": 360},
    {"id": "RRPONTSYD", "name": "역레포 잔고", "months": 360},
    {"id": "BAMLH0A0HYM2", "name": "하이일드 스프레드", "months": 360},
    {"id": "ICSA", "name": "신규 실업수당 청구건수", "months": 360},
    {"id": "CPIAUCSL", "name": "CPI 소비자물가", "months": 360},
    {"id": "PCEPILFE", "name": "Core PCE", "months": 360},
    {"id": "NCBCEL", "name": "비금융기업 시가총액", "months": 360},
    {"id": "GDP", "name": "미국 GDP", "months": 360},
    # 추가 지표
    {"id": "OPHNFB", "name": "노동생산성 (비농업)", "months": 360},
    {"id": "BCNSDODNS", "name": "비금융기업 부채", "months": 360},
    {"id": "UMCSENT", "name": "소비자심리지수 (미시간대)", "months": 360},
    {"id": "UNRATE", "name": "실업률", "months": 360},
    {"id": "JTSJOL", "name": "JOLTS 구인건수", "months": 360},
    {"id": "TEMPHELPS", "name": "임시직 고용", "months": 360},
    {"id": "CIVPART", "name": "경제활동참가율", "months": 360},
    {"id": "HDTGPDUSQ163N", "name": "가계부채/GDP", "months": 360},
    {"id": "DRCCLACBS", "name": "신용카드 연체율", "months": 360},
    {"id": "PSAVERT", "name": "개인저축률", "months": 360},
    {"id": "SAHMREALTIME", "name": "Sahm Rule 지표", "months": 360},
    {"id": "DRTSCILM", "name": "은행 대출기준 강화 (대기업)", "months": 360},
    {"id": "PCU334413334413", "name": "반도체 PPI (물가)", "months": 360},
]
