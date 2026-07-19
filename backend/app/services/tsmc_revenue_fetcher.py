"""TSMC 월매출 (SEC EDGAR 6-K) — AI 반도체 생산 최상류의 월간 실측

매월 10일경 6-K(tsm-revenueYYYYMMDD.htm)로 전월 매출·MoM·YoY 공시.
YoY 증가율의 '둔화 시작'이 빅테크 캐펙스(분기)보다 빠른 선행 경고.
키 불필요 · EDGAR는 User-Agent 필수 · 6시간 캐시.
"""
import logging
import re
import time

import requests

logger = logging.getLogger(__name__)

_UA = {"User-Agent": "stock-portfolio-simulator jesuk17.yeon@gmail.com"}
_SUBMISSIONS = "https://data.sec.gov/submissions/CIK0001046179.json"
_ARCHIVE = "https://www.sec.gov/Archives/edgar/data/1046179"
_CACHE_TTL = 6 * 3600
_MONTHS = {m: i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"])}

# "revenue for June 2026 was approximately NT$442.68 billion, an increase of 6.2 percent
#  from May 2026 and an increase of 67.9 percent from June 2025."
_REV_RE = re.compile(
    r"revenue for (\w+) (\d{4}) was approximately NT\$([\d,.]+) billion, "
    r"(an increase|a decrease) of ([\d.]+) percent from \w+ \d{4} and "
    r"(an increase|a decrease) of ([\d.]+) percent from \w+ \d{4}", re.I)


class TsmcRevenueFetcher:
    """TSMC 월매출 YoY 시계열 (최근 ~12개월)"""

    def __init__(self):
        self._cache: dict | None = None
        self._cache_at = 0.0

    def get_monthly_revenue(self, months: int = 12) -> dict:
        if self._cache and time.time() - self._cache_at < _CACHE_TTL:
            return self._cache
        result = self._fetch(months)
        if result.get("available"):
            self._cache, self._cache_at = result, time.time()
        return result

    def _fetch(self, months: int) -> dict:
        try:
            r = requests.get(_SUBMISSIONS, headers=_UA, timeout=20)
            r.raise_for_status()
            rec = r.json()["filings"]["recent"]
        except Exception as e:
            logger.warning("TSMC EDGAR submissions fetch failed: %s", e)
            return {"available": False}

        docs = [
            (acc, doc) for form, acc, doc in
            zip(rec["form"], rec["accessionNumber"], rec["primaryDocument"])
            if form == "6-K" and "revenue" in (doc or "").lower()
        ][:months]

        series = []
        for acc, doc in docs:
            try:
                url = f"{_ARCHIVE}/{acc.replace('-', '')}/{doc}"
                r = requests.get(url, headers=_UA, timeout=20)
                r.raise_for_status()
                text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", r.text))
                m = _REV_RE.search(text)
                if not m:
                    continue
                month, year = _MONTHS.get(m.group(1)), int(m.group(2))
                if not month:
                    continue
                yoy = float(m.group(7)) * (1 if m.group(6).lower() == "an increase" else -1)
                series.append({
                    "date": f"{year:04d}-{month:02d}",
                    "revenue_bn": float(m.group(3).replace(",", "")),  # NT$ 십억
                    "yoy": round(yoy, 1),
                })
            except Exception as e:
                logger.warning("TSMC 6-K parse failed (%s): %s", doc, e)

        if len(series) < 2:
            return {"available": False}
        series.sort(key=lambda x: x["date"])
        latest, prev = series[-1], series[-2]
        return {
            "available": True,
            "series": series,
            "latest_period": latest["date"],
            "yoy": latest["yoy"],
            "yoy_prev": prev["yoy"],
            "slowing": latest["yoy"] < prev["yoy"] - 5,  # 증가율 5%p 이상 둔화
            "revenue_bn": latest["revenue_bn"],
        }


tsmc_revenue_fetcher = TsmcRevenueFetcher()
