"""매크로 데이터 통합 수집 서비스"""
import logging
from datetime import datetime

import pandas as pd
import yfinance as yf

from .fred_service import FREDService, fred_service
from ..models.macro_schemas import (
    MacroRawData,
    SeriesData,
    SeriesDataPoint,
    DataStatus,
    FRED_SERIES_CONFIG,
)

logger = logging.getLogger(__name__)


class MacroDataFetcher:
    """FRED + Yahoo Finance 매크로 데이터 통합 수집"""

    def __init__(self):
        self.fred: FREDService = fred_service

    def fetch_all(self) -> MacroRawData:
        """전체 매크로 데이터 수집"""
        errors: list[str] = []

        # 1. FRED 시리즈 수집
        fred_data = self._fetch_all_fred()

        # FRED 에러 수집
        for sid, sd in fred_data.items():
            if sd.status == DataStatus.ERROR and sd.error:
                errors.append(sd.error)

        # 2. Yahoo Finance 수집
        yahoo_data = self._fetch_all_yahoo(errors)

        return MacroRawData(
            fred_series=fred_data,
            nasdaq_weekly=yahoo_data.get("nasdaq_weekly", []),
            nasdaq_daily=yahoo_data.get("nasdaq_daily", []),
            vix=yahoo_data.get("vix", []),
            dxy=yahoo_data.get("dxy", []),
            micron=yahoo_data.get("micron", []),
            sk_hynix=yahoo_data.get("sk_hynix", []),
            samsung=yahoo_data.get("samsung", []),
            sox=yahoo_data.get("sox", []),
            nvda=yahoo_data.get("nvda", []),
            avgo=yahoo_data.get("avgo", []),
            kospi=yahoo_data.get("kospi", []),
            kospi_monthly=yahoo_data.get("kospi_monthly", []),
            usdkrw=yahoo_data.get("usdkrw", []),
            wti=yahoo_data.get("wti", []),
            fetched_at=datetime.now().isoformat(),
            errors=errors,
        )

    def _df_to_series_data(
        self, series_id: str, df: pd.DataFrame, name: str
    ) -> SeriesData:
        """DataFrame → SeriesData 변환 (공통 헬퍼)"""
        if df.empty:
            return SeriesData(
                series_id=series_id,
                name=name,
                data=[],
                status=DataStatus.ERROR,
                error=f"No data for {series_id}",
            )

        data_points = [
            SeriesDataPoint(
                date=idx.strftime("%Y-%m-%d"),
                value=round(float(row["value"]), 4),
            )
            for idx, row in df.iterrows()
        ]
        return SeriesData(
            series_id=series_id,
            name=name,
            data=data_points,
            status=DataStatus.LIVE,
            last_updated=datetime.now().isoformat(),
        )

    def _fetch_all_fred(self) -> dict[str, SeriesData]:
        """모든 FRED 시리즈 수집"""
        result: dict[str, SeriesData] = {}
        raw = self.fred.get_multiple_series(FRED_SERIES_CONFIG)
        config_map = {c["id"]: c for c in FRED_SERIES_CONFIG}

        for series_id, df in raw.items():
            name = config_map.get(series_id, {}).get("name", series_id)
            result[series_id] = self._df_to_series_data(series_id, df, name)

        return result

    def _fetch_all_yahoo(
        self, errors: list[str]
    ) -> dict[str, list[SeriesDataPoint]]:
        """모든 Yahoo Finance 매크로 데이터 수집"""
        result: dict[str, list[SeriesDataPoint]] = {}

        yahoo_configs = [
            ("nasdaq_weekly", "^IXIC", "1wk", "max"),
            ("nasdaq_daily", "^IXIC", "1d", "1y"),
            ("vix", "^VIX", "1d", "max"),
            ("dxy", "DX-Y.NYB", "1d", "max"),
            # 반도체 레짐용 (일간 2년)
            ("micron", "MU", "1d", "2y"),
            ("sk_hynix", "000660.KS", "1d", "2y"),
            ("samsung", "005930.KS", "1d", "2y"),
            ("sox", "^SOX", "1d", "2y"),
            ("nvda", "NVDA", "1d", "2y"),
            ("avgo", "AVGO", "1d", "2y"),
            # 코스피 저점 판정기 (일간 5년 = 파라볼릭 base 포착)
            ("kospi", "^KS11", "1d", "5y"),
            # 전체이력 월봉 (역대 약세장 오버레이용, 1996~)
            ("kospi_monthly", "^KS11", "1mo", "max"),
            # 원/달러 환율 + WTI 유가 (코스피 매크로 압력)
            ("usdkrw", "KRW=X", "1d", "5y"),
            ("wti", "CL=F", "1d", "5y"),
        ]

        for key, ticker, interval, period in yahoo_configs:
            df = self._fetch_yahoo_series(ticker, interval=interval, period=period)
            if df.empty:
                errors.append(f"Yahoo Finance: no data for {ticker} ({key})")
            result[key] = self._df_to_points(df)

        return result

    def _fetch_yahoo_series(
        self,
        ticker: str,
        interval: str = "1d",
        period: str = "2y",
    ) -> pd.DataFrame:
        """Yahoo Finance 시계열 수집"""
        try:
            t = yf.Ticker(ticker)
            df = t.history(interval=interval, period=period)

            if df.empty:
                return pd.DataFrame(columns=["Close"])

            return df[["Close"]].copy()

        except Exception as e:
            logger.warning("Yahoo Finance fetch failed for %s: %s", ticker, e)
            return pd.DataFrame(columns=["Close"])

    def _df_to_points(self, df: pd.DataFrame) -> list[SeriesDataPoint]:
        """DataFrame → SeriesDataPoint 리스트 변환"""
        if df.empty:
            return []

        points = []
        for idx, row in df.iterrows():
            date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
            value = row.get("Close", row.get("value", 0))
            if pd.notna(value):
                points.append(SeriesDataPoint(
                    date=date_str,
                    value=round(float(value), 4),
                ))
        return points

    def fetch_category(self, category: str) -> dict[str, SeriesData]:
        """카테고리별 FRED 시리즈 수집"""
        category_map = {
            "business_cycle": ["USALOLITOAASTSAM", "IPMAN", "DGORDER", "AMTMNO", "NEWORDER", "PERMIT", "ACDGNO", "ISRATIO", "T10Y2Y", "OPHNFB"],
            "liquidity": ["FEDFUNDS", "DGS10", "DGS2", "M2SL", "WALCL", "RRPONTSYD", "BCNSDODNS", "DRTSCILM"],
            "sentiment": ["BAMLH0A0HYM2", "ICSA", "UMCSENT"],
            "valuation": ["CPIAUCSL", "PCEPILFE", "NCBCEL", "GDP"],
            "labor_household": ["UNRATE", "JTSJOL", "TEMPHELPS", "CIVPART", "HDTGPDUSQ163N", "DRCCLACBS", "PSAVERT", "SAHMREALTIME"],
        }

        series_ids = category_map.get(category, [])
        configs = [c for c in FRED_SERIES_CONFIG if c["id"] in series_ids]

        result: dict[str, SeriesData] = {}
        raw = self.fred.get_multiple_series(configs)
        config_map = {c["id"]: c for c in configs}

        for series_id, df in raw.items():
            name = config_map.get(series_id, {}).get("name", series_id)
            result[series_id] = self._df_to_series_data(series_id, df, name)

        return result


# 싱글톤
macro_data_fetcher = MacroDataFetcher()
