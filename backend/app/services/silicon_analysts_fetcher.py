"""Silicon Analysts 무료 JSON API — DRAM 스팟/컨트랙트, HBM $/GB (키 불필요)

https://siliconanalysts.com/api/v1/market-data/<slug>
데이터가 희소(분기·반기 추정)해 '레벨' 참고용. 방향(direction)은
전망치 제외 + 6개월 스테일 가드를 통과한 실측 포인트로만 판정.
스팟 '방향'의 정확한 소스는 TrendForce(trendforce_spot_fetcher) 쪽.
"""
import logging
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

_BASE = "https://siliconanalysts.com/api/v1/market-data"
_STALE_MONTHS = 6


def _period_to_ym(psk) -> tuple[int, int] | None:
    """period_sort_key(YYYYNN) → (year, month) 근사. NN: 00=연간, 01~04=분기/반기."""
    try:
        n = int(psk)
        return n // 100, min(12, max(1, n % 100) * 3)
    except (TypeError, ValueError):
        return None


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
        """HBM 세대별 $/GB + HBM3E 컨트랙트/스팟 추이(AI 수요 직결 가격 신호).

        {latest_gen, latest_value, series:[{gen,value}], hbm3e_contract, hbm3e_spot}
        """
        dp = self._fetch("hbm-pricing")
        pts = [
            {"gen": p.get("series_label"), "period": p.get("period_sort_key"),
             "value": p.get("value_mid"), "proj": p.get("data_type") == "Projection"}
            for p in dp if p.get("value_mid") is not None
        ]
        pts.sort(key=lambda x: x["period"] or 0)
        latest = pts[-1] if pts else {}
        return {"latest_gen": latest.get("gen"), "latest_value": latest.get("value"),
                "unit": "$/GB", "series": pts,
                "hbm3e_contract": self._series(dp, "hbm3e-contract"),
                "hbm3e_spot": self._series(dp, "hbm3e-spot")}

    def _series(self, dp: list, key: str) -> dict:
        pts = [
            {"period": p.get("period_sort_key"), "label": p.get("period_label"),
             "value": p.get("value_mid"),
             # data_type 외에 라벨의 "(proj.)"도 전망치 (예: DDR4 스팟 Q2 2026)
             "proj": p.get("data_type") == "Projection" or "proj" in (p.get("period_label") or "").lower()}
            for p in dp if p.get("series_key") == key and p.get("value_mid") is not None
        ]
        pts.sort(key=lambda x: x["period"] or 0)
        latest = pts[-1]["value"] if pts else None

        # 방향은 실측(비전망) 포인트 2개 이상 + 최신 실측이 6개월 이내일 때만
        actual = [p for p in pts if not p["proj"]]
        prev = actual[-2]["value"] if len(actual) >= 2 else None
        direction = None
        if len(actual) >= 2:
            ym = _period_to_ym(actual[-1]["period"])
            if ym:
                now = datetime.now()
                age_months = (now.year - ym[0]) * 12 + (now.month - ym[1])
                if age_months <= _STALE_MONTHS:
                    a, b = actual[-2]["value"], actual[-1]["value"]
                    direction = "rising" if b > a else "falling" if b < a else "flat"
        return {"latest": latest, "prev": prev, "direction": direction, "points": pts}


silicon_analysts_fetcher = SiliconAnalystsFetcher()
