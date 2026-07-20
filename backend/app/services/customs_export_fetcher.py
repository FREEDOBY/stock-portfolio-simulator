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
        """[(period, statCd, exp_usd)] — 실패/권한없음 시 []

        cntyCd="" 조회 시 국가별 행 + 국가코드 '-'인 '월 총계' 행이 함께 옴.
        """
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
                cd = re.search(r"<statCd>(.*?)</statCd>", it)
                if y and e:
                    period = re.sub(r"[^0-9]", "", y.group(1))
                    if len(period) != 6:  # 빈/기간총계 행 스킵
                        continue
                    try:
                        out.append((period, (cd.group(1).strip() if cd else ""), float(e.group(1).replace(",", ""))))
                    except ValueError:
                        pass
            return out
        except Exception as ex:
            logger.warning("customs export fetch failed: %s", ex)
            return []

    def _monthly_total(self, strt: str, end: str) -> dict:
        """기간 월별 반도체 수출 총계 {period: usd}.

        월 총계 행(statCd='-')만 사용 → 국가·HS하위코드 중복합산(이중계산) 방지.
        총계 행 없으면 주요국 합산으로 폴백.
        """
        rows = self._query(strt, end, "")
        if rows:
            total = {p: v for p, code, v in rows if code == "-"}
            if total:
                return total
            agg: dict[str, float] = {}
            for p, _code, v in rows:
                agg[p] = agg.get(p, 0.0) + v
            return agg
        agg = {}
        for c in _DEST:
            for p, _code, v in self._query(strt, end, c):
                agg[p] = agg.get(p, 0.0) + v
        return agg

    @staticmethod
    def _ym_offset(ym: str, months_back: int) -> str:
        """YYYYMM에서 months_back개월 전 YYYYMM"""
        y, m = int(ym[:4]), int(ym[4:])
        t = y * 12 + (m - 1) - months_back
        return f"{t // 12:04d}{t % 12 + 1:02d}"

    def get_semiconductor_export(self) -> dict:
        """한국 반도체 수출 YoY + 최근 시계열 (관세청 '1년 이내' 제약 → 12개월 창 2회)

        전년도 12개월 창을 통째로 받아 최근 12개월 각각의 월별 YoY를 계산.
        """
        if not self._key:
            return {"available": False}
        now = datetime.now()
        end = f"{now.year:04d}{now.month:02d}"
        start = self._ym_offset(end, 11)  # 최근 12개월 (1년 이내)
        recent = {p: v for p, v in self._monthly_total(start, end).items() if len(p) == 6}
        if not recent:
            return {"available": False}

        latest_p = max(recent)
        latest_v = recent[latest_p]

        # 전년도 12개월 창 (월별 YoY 계산용)
        ya_end = self._ym_offset(end, 12)
        ya_start = self._ym_offset(ya_end, 11)
        yearago = {p: v for p, v in self._monthly_total(ya_start, ya_end).items() if len(p) == 6}

        def _yoy(p: str, v: float):
            ya = yearago.get(self._ym_offset(p, 12))
            return round((v / ya - 1) * 100, 1) if ya else None

        yoy = _yoy(latest_p, latest_v)
        series = [
            {"period": p, "value": round(v / 1e8, 1), "yoy": _yoy(p, v)}
            for p, v in sorted(recent.items())
        ]  # 억달러
        return {
            "available": True,
            "series": series,
            "yoy": yoy,
            "latest_period": latest_p,
            "latest_value": round(latest_v / 1e8, 1),
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
