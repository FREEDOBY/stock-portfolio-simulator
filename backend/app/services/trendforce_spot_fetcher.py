"""TrendForce DRAM 스팟 가격 (일간 실측) — 메모리 스팟 방향의 정확한 소스

https://www.trendforce.com/price/dram/dram_spot 정적 HTML 테이블 파싱.
주력 3개 칩(DDR4 8Gb/16Gb, DDR5 16Gb)의 세션 평균가 + 일간 변동률 → 합성 방향.
키 불필요 · 6시간 캐시 · 실패 시 available=False (호출부는 SiliconAnalysts 폴백).
"""
import logging
import re
import time

import requests

logger = logging.getLogger(__name__)

_URL = "https://www.trendforce.com/price/dram/dram_spot"
_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
_CACHE_TTL = 6 * 3600

# 주력(mainstream) 칩만 — eTT/모듈/GDDR 제외
_MAINSTREAM = ["DDR4 8Gb (1Gx8) 3200", "DDR4 16Gb (2Gx8) 3200", "DDR5 16Gb (2Gx8) 4800/5600"]

_ROW_RE = re.compile(
    r"<tr>\s*<td[^>]*>\s*<span[^>]*>([^<]+)</span>\s*</td>"
    r"((?:\s*<td class=\"lcd-num-l\">[\d.,]+</td>)+)"
    r"\s*<td class=\"percent-cell\"><span class=\"[^\"]*\"><span>[^<]*</span>\s*([-\d.]+)\s*%")

# 일간 변동 합성 방향의 데드밴드 (±0.2% 이내는 보합)
_DEADBAND = 0.2


class TrendforceSpotFetcher:
    """DRAM 스팟 일간 평균가·변동률 (주력 칩 합성)"""

    def __init__(self):
        self._cache: dict | None = None
        self._cache_at = 0.0

    def get_dram_spot(self) -> dict:
        if self._cache and time.time() - self._cache_at < _CACHE_TTL:
            return self._cache
        result = self._fetch()
        if result.get("available"):
            self._cache, self._cache_at = result, time.time()
        return result

    def _fetch(self) -> dict:
        try:
            r = requests.get(_URL, headers=_UA, timeout=20)
            r.raise_for_status()
            rows = _ROW_RE.findall(r.text)
        except Exception as e:
            logger.warning("TrendForce spot fetch failed: %s", e)
            return {"available": False}

        items = []
        for name, tds, chg in rows:
            name = name.strip()
            if name not in _MAINSTREAM:
                continue
            vals = re.findall(r">([\d.,]+)<", tds)
            if not vals:
                continue
            # 마지막 숫자 컬럼 = 세션 평균가
            avg = float(vals[-1].replace(",", ""))
            items.append({"name": name, "price": avg, "chg_pct": float(chg)})

        if not items:
            logger.warning("TrendForce spot: no mainstream rows parsed (page layout changed?)")
            return {"available": False}

        avg_chg = round(sum(i["chg_pct"] for i in items) / len(items), 2)
        if avg_chg > _DEADBAND:
            direction = "rising"
        elif avg_chg < -_DEADBAND:
            direction = "falling"
        else:
            direction = "flat"

        def _price(name_prefix: str):
            for i in items:
                if i["name"].startswith(name_prefix):
                    return i["price"]
            return None

        return {
            "available": True,
            "items": items,
            "avg_chg_pct": avg_chg,
            "direction": direction,
            "ddr4_8gb": _price("DDR4 8Gb"),
            "ddr5_16gb": _price("DDR5 16Gb"),
        }


trendforce_spot_fetcher = TrendforceSpotFetcher()
