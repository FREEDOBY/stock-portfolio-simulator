"""Silicon Analysts 무료 JSON API — DRAM 스팟/컨트랙트, HBM $/GB (키 불필요)

https://siliconanalysts.com/api/v1/market-data/<slug>
데이터가 희소(분기·추정)해 '레벨/방향' 참고용. 모멘텀은 FRED 반도체 PPI로 보강.
"""
import logging
import requests

logger = logging.getLogger(__name__)

_BASE = "https://siliconanalysts.com/api/v1/market-data"


class SiliconAnalystsFetcher:
    """DRAM/HBM 가격 참고 데이터 (무료)"""

    def _fetch(self, slug: str) -> list[dict]:
        try:
            r = requests.get(f"{_BASE}/{slug}", headers={"User-Agent": "Mozilla/5.0"}, timeout=12)
            r.raise_for_status()
            return (r.json().get("data") or {}).get("dataPoints") or []
        except Exception as e:
            logger.warning("SiliconAnalysts %s fetch failed: %s", slug, e)
            return []

    def get_dram_ddr4(self) -> dict:
        """DDR4 8Gb 컨트랙트/스팟 ($/unit). {spot:{latest,prev,dir}, contract:{...}}"""
        dp = self._fetch("dram-ddr4-price")
        return {
            "spot": self._series(dp, "ddr4-8gb-spot"),
            "contract": self._series(dp, "ddr4-8gb"),
            "unit": "$/8Gb",
        }

    def get_hbm_price(self) -> dict:
        """HBM 세대별 $/GB. {latest_gen, latest_value, series:[{gen,value}]}"""
        dp = self._fetch("hbm-pricing")
        pts = [
            {"gen": p.get("series_label"), "period": p.get("period_sort_key"),
             "value": p.get("value_mid"), "proj": p.get("data_type") == "Projection"}
            for p in dp if p.get("value_mid") is not None
        ]
        pts.sort(key=lambda x: x["period"] or 0)
        latest = pts[-1] if pts else {}
        return {"latest_gen": latest.get("gen"), "latest_value": latest.get("value"),
                "unit": "$/GB", "series": pts}

    def _series(self, dp: list, key: str) -> dict:
        pts = [
            {"period": p.get("period_sort_key"), "label": p.get("period_label"),
             "value": p.get("value_mid"), "proj": p.get("data_type") == "Projection"}
            for p in dp if p.get("series_key") == key and p.get("value_mid") is not None
        ]
        pts.sort(key=lambda x: x["period"] or 0)
        latest = pts[-1]["value"] if pts else None
        prev = pts[-2]["value"] if len(pts) >= 2 else None
        direction = None
        if latest is not None and prev is not None:
            direction = "rising" if latest > prev else "falling" if latest < prev else "flat"
        return {"latest": latest, "prev": prev, "direction": direction, "points": pts}


silicon_analysts_fetcher = SiliconAnalystsFetcher()
