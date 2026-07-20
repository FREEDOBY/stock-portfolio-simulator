"""FRED SEP(경제전망요약) 점도표 요약 — 연준의 기준금리 계획 경로

개별 점(위원 19명)은 무료 API가 없어, FRED가 제공하는 통계 요약으로 재구성:
  FEDTARMD  중앙값 · FEDTARRH/RL 범위(최고/최저) · FEDTARCTH/CTL 중심경향
  + LR(장기중립) 시리즈. 분기(3·6·9·12월 FOMC)마다 자동 갱신.
현재 기준금리·2년물(시장기대)과 비교하기 위해 함께 반환.
"""
import logging
import os

import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_FRED = "https://api.stlouisfed.org/fred/series/observations"
# 시점별(연도) 점도표 요약
_HORIZON = {"median": "FEDTARMD", "range_high": "FEDTARRH", "range_low": "FEDTARRL",
            "ct_high": "FEDTARCTH", "ct_low": "FEDTARCTL"}
# 장기 중립금리
_LR = {"median": "FEDTARMDLR", "range_high": "FEDTARRHLR", "range_low": "FEDTARRMLR"}


class FedProjectionFetcher:
    def __init__(self):
        self._key = os.getenv("FRED_API_KEY", "").strip()

    def _obs(self, sid: str) -> list[dict]:
        if not self._key:
            return []
        try:
            r = requests.get(_FRED, params={"series_id": sid, "api_key": self._key,
                                            "file_type": "json"}, timeout=15)
            r.raise_for_status()
            return r.json().get("observations", [])
        except Exception as e:
            logger.warning("FRED %s fetch failed: %s", sid, e)
            return []

    def get_dot_plot(self) -> dict:
        """{available, dots:[{year, median, range_low, range_high, ct_low, ct_high}], longer_run}"""
        # 각 시리즈를 연도→값 맵으로 (최신 SEP 반영: 같은 연도 여러 관측치면 마지막 값)
        maps = {}
        for k, sid in _HORIZON.items():
            m = {}
            for o in self._obs(sid):
                if o.get("value") not in (None, "."):
                    m[o["date"][:4]] = float(o["value"])
            maps[k] = m
        years = sorted(maps.get("median", {}).keys())
        if not years:
            return {"available": False}
        dots = [{"year": y, **{k: maps[k].get(y) for k in _HORIZON}} for y in years]

        lr_med = self._obs(_LR["median"])
        longer_run = None
        if lr_med:
            vals = [float(o["value"]) for o in lr_med if o.get("value") not in (None, ".")]
            longer_run = vals[-1] if vals else None

        return {"available": True, "dots": dots, "longer_run": longer_run}


fed_projection_fetcher = FedProjectionFetcher()
