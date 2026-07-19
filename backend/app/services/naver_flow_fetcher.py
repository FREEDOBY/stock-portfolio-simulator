"""네이버 금융 투자자별 매매동향 (외국인/기관/개인 일별 순매수)

KRX 정보데이터시스템은 봇 접근을 차단(LOGOUT)하고 pykrx 투자자 파서도 깨져 있어,
네이버 금융의 일별 투자자 매매동향을 스크래핑한다.
sosok: 01=코스피, 02=코스닥. 단위: 억원(순매수).
"""
import re
import logging
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

_NAVER_URL = "https://finance.naver.com/sise/investorDealTrendDay.naver"
# 날짜 + 개인 + 외국인 + 기관계 (앞 3개 수치)
_ROW = re.compile(
    r"(\d{2}\.\d{2}\.\d{2})</td>\s*"
    r"<td[^>]*>\s*([\-\d,]+)</td>\s*"   # 개인
    r"<td[^>]*>\s*([\-\d,]+)</td>\s*"   # 외국인
    r"<td[^>]*>\s*([\-\d,]+)</td>"      # 기관계
)


class NaverFlowFetcher:
    """네이버 투자자별 매매동향 수집"""

    def get_investor_flow(self, sosok: str = "01", pages: int = 2) -> list[dict]:
        """[{date, individual, foreign, institution}] (억원). 최신순 아님(오름차순)."""
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": "https://finance.naver.com/sise/",
        })
        rows: dict[str, dict] = {}
        # bizdate를 하루씩 물려가며 여러 페이지 (각 페이지 ~20영업일)
        biz = datetime.now().strftime("%Y%m%d")
        for _ in range(max(1, pages)):
            page = self._fetch_page(session, sosok, biz)
            if not page:
                break
            for r in page:
                rows[r["date"]] = r
            # 다음 페이지: 가장 오래된 날짜 하루 전
            oldest = min(rows.keys())
            biz = oldest.replace("-", "")
        out = sorted(rows.values(), key=lambda x: x["date"])
        return out

    def _fetch_page(self, session, sosok, bizdate) -> list[dict]:
        try:
            r = session.get(_NAVER_URL, params={"bizdate": bizdate, "sosok": sosok}, timeout=12)
            html = r.content.decode("euc-kr", "ignore")
        except Exception as e:
            logger.warning("Naver flow fetch failed: %s", e)
            return []

        def num(x: str):
            try:
                return float(x.replace(",", ""))
            except ValueError:
                return 0.0

        out = []
        for d, ind, frn, ins in _ROW.findall(html):
            yy, mm, dd = d.split(".")
            out.append({
                "date": f"20{yy}-{mm}-{dd}",
                "individual": num(ind),
                "foreign": num(frn),
                "institution": num(ins),
            })
        return out


# 싱글톤
naver_flow_fetcher = NaverFlowFetcher()
