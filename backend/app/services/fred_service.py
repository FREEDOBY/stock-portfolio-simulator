"""FRED API 서비스 - 경제 지표 데이터 수집"""
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx
import pandas as pd
from dateutil.relativedelta import relativedelta
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


@dataclass
class CachedData:
    """캐시 데이터"""
    data: pd.DataFrame
    fetched_at: float
    ttl: int = 3600  # 기본 1시간

    @property
    def is_expired(self) -> bool:
        return time.time() - self.fetched_at > self.ttl


class FREDService:
    """FRED API 클라이언트 + TTL 캐싱"""

    FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

    # 갱신 주기별 TTL (초)
    TTL_DAILY = 3600       # 1시간
    TTL_WEEKLY = 3600 * 3  # 3시간
    TTL_MONTHLY = 3600 * 6 # 6시간
    TTL_QUARTERLY = 3600 * 12  # 12시간

    def __init__(self):
        self._api_key = os.getenv("FRED_API_KEY", "")
        self._cache: dict[str, CachedData] = {}
        self._http_client: Optional[httpx.Client] = None

        if not self._api_key:
            logger.warning("FRED_API_KEY not set; FRED data will be unavailable")

    @property
    def http_client(self) -> httpx.Client:
        if self._http_client is None:
            self._http_client = httpx.Client(timeout=15.0)
        return self._http_client

    def get_series(
        self,
        series_id: str,
        months_back: int = 24,
        ttl: Optional[int] = None,
    ) -> pd.DataFrame:
        """단일 FRED 시리즈 수집 (캐싱 포함)"""
        if ttl is None:
            ttl = self.TTL_MONTHLY

        # API 키 없으면 즉시 빈 DataFrame
        if not self._api_key:
            return pd.DataFrame(columns=["value"])

        cache_key = f"{series_id}:{months_back}"

        # 캐시 확인
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            if not cached.is_expired:
                return cached.data.copy()

        # API 호출
        try:
            df = self._fetch_from_api(series_id, months_back)

            # 캐시 저장
            self._cache[cache_key] = CachedData(
                data=df.copy(),
                fetched_at=time.time(),
                ttl=ttl,
            )
            return df

        except Exception as e:
            logger.warning("FRED API fetch failed for %s: %s", series_id, e)

            # 실패 시 만료 캐시라도 반환 (stale cache)
            if cache_key in self._cache:
                logger.info("Returning stale cache for %s", series_id)
                return self._cache[cache_key].data.copy()

            # 캐시도 없으면 빈 DataFrame
            return pd.DataFrame(columns=["value"])

    def _fetch_from_api(self, series_id: str, months_back: int) -> pd.DataFrame:
        """FRED REST API 호출"""
        end_date = datetime.now()
        start_date = end_date - relativedelta(months=months_back)

        params = {
            "series_id": series_id,
            "api_key": self._api_key,
            "file_type": "json",
            "observation_start": start_date.strftime("%Y-%m-%d"),
            "observation_end": end_date.strftime("%Y-%m-%d"),
        }

        response = self.http_client.get(self.FRED_BASE_URL, params=params)
        response.raise_for_status()

        data = response.json()
        observations = data.get("observations", [])

        # JSON → DataFrame
        records = []
        for obs in observations:
            value_str = obs.get("value", ".")
            if value_str == "." or value_str is None:
                continue  # FRED uses "." for missing values
            try:
                records.append({
                    "date": obs["date"],
                    "value": float(value_str),
                })
            except (ValueError, KeyError):
                continue

        if not records:
            return pd.DataFrame(columns=["value"])

        df = pd.DataFrame(records)
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date").sort_index()

        return df

    def get_multiple_series(
        self,
        series_configs: list[dict],
    ) -> dict[str, pd.DataFrame]:
        """여러 FRED 시리즈를 한 번에 수집"""
        result = {}
        for config in series_configs:
            series_id = config["id"]
            months = config.get("months", 24)
            result[series_id] = self.get_series(series_id, months_back=months)

        return result


# 싱글톤
fred_service = FREDService()
