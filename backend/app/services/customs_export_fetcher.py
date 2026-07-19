"""관세청 한국 반도체 수출 (data.go.kr 15100475, 품목별 국가별 수출입실적)

한국 반도체 수출은 글로벌 반도체 사이클의 정통 '선행지수'.
HS 8542(전자집적회로) 수출금액 YoY로 사이클 방향 판단.
data.go.kr 인증키 필요(KOFIA와 동일 키). 활용신청 반영 전이면 403 → available=False 폴백.
"""
import os
import re
import logging
from datetime import datetime

import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_URL = "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"
_HS_SEMI = "8542"  # 전자집적회로 = 반도체 핵심
# 총계(cntyCd 빈값) 미지원 시 합산할 주요 수출국 (한국 반도체 수출 ~85%)
_DEST = ["CN", "HK", "TW", "VN", "US"]


class CustomsExportFetcher:
    """한국 반도체 수출 YoY"""

    def __init__(self):
        self._key = os.getenv("KOFIA_API_KEY") or os.getenv("DATA_GO_KR_KEY") or ""

    @property
    def enabled(self) -> bool:
        return bool(self._key)

    def _query(self, strt: str, end: str, cnty: str) -> list[tuple]:
        """[(period, exp_usd)] — 실패/권한없음 시 []"""
        if not self._key:
            return []
        try:
            r = requests.get(f"{_URL}?serviceKey={self._key}", timeout=15, params={
                "strtYymm": strt, "endYymm": end, "hsSgn": _HS_SEMI, "cntyCd": cnty,
            })
            if r.status_code != 200:
                logger.info("customs export %s (활용신청 반영 전일 수 있음)", r.status_code)
                return []
            out = []
            for it in re.findall(r"<item>(.*?)</item>", r.text, re.S):
                y = re.search(r"<year>(.*?)</year>", it)
                e = re.search(r"<expDlr>(.*?)</expDlr>", it)
                if y and e:
                    period = re.sub(r"[^0-9]", "", y.group(1))
                    try:
                        out.append((period, float(e.group(1).replace(",", ""))))
                    except ValueError:
                        pass
            return out
        except Exception as ex:
            logger.warning("customs export fetch failed: %s", ex)
            return []

    def _monthly_total(self, strt: str, end: str) -> dict:
        """기간 월별 반도체 수출 합계 {period: usd}. 총계 우선, 없으면 주요국 합산."""
        total = self._query(strt, end, "")
        if total:
            agg: dict[str, float] = {}
            for p, v in total:
                agg[p] = agg.get(p, 0.0) + v
            return agg
        agg = {}
        for c in _DEST:
            for p, v in self._query(strt, end, c):
                agg[p] = agg.get(p, 0.0) + v
        return agg

    def get_semiconductor_export(self) -> dict:
        """한국 반도체 수출 YoY + 최근 시계열"""
        if not self._key:
            return {"available": False}
        now = datetime.now()
        y, m = now.year, now.month
        start = f"{y - 1:04d}{m:02d}"   # 약 13개월 전
        end = f"{y:04d}{m:02d}"
        agg = self._monthly_total(start, end)
        if not agg:
            return {"available": False}

        series = [{"period": p, "value": round(v / 1e8, 1)} for p, v in sorted(agg.items())]  # 억달러
        if len(series) < 13:
            return {"available": True, "series": series, "yoy": None,
                    "latest_period": series[-1]["period"] if series else None,
                    "latest_value": series[-1]["value"] if series else None}

        latest = series[-1]
        year_ago = series[-13]
        yoy = round((latest["value"] / year_ago["value"] - 1) * 100, 1) if year_ago["value"] else None
        return {
            "available": True,
            "series": series[-13:],
            "yoy": yoy,
            "latest_period": latest["period"],
            "latest_value": latest["value"],
        }

    def raw_sample(self) -> dict:
        """디버그: 최근 6개월 원시 조회 (권한/필드 확인용)"""
        now = datetime.now()
        start = f"{now.year:04d}{max(1, now.month - 5):02d}"
        end = f"{now.year:04d}{now.month:02d}"
        return {
            "total": self._query(start, end, ""),
            "us": self._query(start, end, "US"),
        }


customs_export_fetcher = CustomsExportFetcher()
