"""FRED API 서비스 - 경제 지표 데이터 수집"""
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx
import pandas as pd
from dateutil.relativedelta import relativedelta
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# 한국 표준시 (UTC+9)
KST = timezone(timedelta(hours=9))


def _get_reset_boundary() -> datetime:
    """오늘(KST) 06:00 기준 리셋 경계를 반환. 현재가 06:00 이전이면 어제 06:00."""
    now = datetime.now(KST)
    today_reset = now.replace(hour=6, minute=0, second=0, microsecond=0)
    if now < today_reset:
        today_reset -= timedelta(days=1)
    return today_reset


@dataclass
class CachedData:
    """캐시 데이터 — KST 06:00 기준 일간 캐시"""
    data: pd.DataFrame
    fetched_at: datetime = field(default_factory=lambda: datetime.now(KST))

    @property
    def is_expired(self) -> bool:
        return self.fetched_at < _get_reset_boundary()


class FREDService:
    """FRED API 클라이언트 + KST 06:00 일간 캐싱"""

    FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

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
        """단일 FRED 시리즈 수집 (KST 06:00 일간 캐싱)"""
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
