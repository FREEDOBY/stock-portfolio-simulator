"""한국은행 ECOS — 집적회로 수출물가지수 (달러기준, 월간) = 한국 메모리 가격 프록시

402Y014(수출물가지수 기본분류) / 309112AA(집적회로) / D(달러기준), 2020=100.
한국 집적회로 수출은 D램·낸드가 지배 → D램 컨트랙트 가격의 안정적 공식 프록시.

실키(ECOS_API_KEY)면 10년치 → YoY 계산 + 직전 사이클 고점(2017~18·2021)
비교 가능. 키 없으면 sample 키(10건 제한)로 최근 10개월만 → YoY 불가,
3개월 변화율로 대체.
"""
import logging
import os
import time
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

_BASE = "https://ecos.bok.or.kr/api/StatisticSearch"
_STAT, _ITEM, _CCY = "402Y014", "309112AA", "D"
_CACHE_TTL = 6 * 3600


class EcosFetcher:
    """집적회로 수출물가지수 (월간)"""

    def __init__(self):
        self._cache: dict | None = None
        self._cache_at = 0.0

    def get_ic_export_price(self) -> dict:
        if self._cache and time.time() - self._cache_at < _CACHE_TTL:
            return self._cache
        result = self._fetch()
        if result.get("available"):
            self._cache, self._cache_at = result, time.time()
        return result

    def _fetch(self) -> dict:
        key = os.getenv("ECOS_API_KEY", "").strip() or "sample"
        now = datetime.now()
        end = f"{now.year}{now.month:02d}"
        if key == "sample":
            # sample 키는 호출당 10건 제한 → 최근 10개월
            y, m = now.year, now.month - 9
            if m <= 0:
                y, m = y - 1, m + 12
            start, limit = f"{y}{m:02d}", 10
        else:
            start, limit = f"{now.year - 10}{now.month:02d}", 200

        url = f"{_BASE}/{key}/json/kr/1/{limit}/{_STAT}/M/{start}/{end}/{_ITEM}/{_CCY}"
        try:
            r = requests.get(url, timeout=15)
            r.raise_for_status()
            rows = (r.json().get("StatisticSearch") or {}).get("row") or []
        except Exception as e:
            logger.warning("ECOS IC export price fetch failed: %s", e)
            return {"available": False}
        series = [
            {"date": f"{t[:4]}-{t[4:6]}", "value": float(v)}
            for t, v in ((row.get("TIME", ""), row.get("DATA_VALUE")) for row in rows)
            if len(t) == 6 and v is not None
        ]
        if len(series) < 4:
            return {"available": False}
        series.sort(key=lambda x: x["date"])

        latest = series[-1]["value"]
        yoy = None
        if len(series) >= 13:
            past = series[-13]["value"]
            if past:
                yoy = round((latest / past - 1) * 100, 1)
        chg_3m = None
        if len(series) >= 4 and series[-4]["value"]:
            chg_3m = round((latest / series[-4]["value"] - 1) * 100, 1)

        return {
            "available": True,
            "series": series,
            "latest": latest,
            "latest_period": series[-1]["date"],
            "yoy": yoy,
            "chg_3m": chg_3m,
            "source": "real" if key != "sample" else "sample",
        }


ecos_fetcher = EcosFetcher()
