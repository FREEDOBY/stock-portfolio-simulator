"""금융투자협회 종합통계 OpenAPI (공공데이터포털 15094809) - 신용공여 잔고 추이

서비스: GetKofiaStatisticsInfoService (base URL 확정)
오퍼레이션명/응답 필드명은 활용가이드 문서에만 있어, 환경변수로 override 가능하게 설계.
최초 호출(`raw_sample`)로 실제 필드명을 확인한 뒤 상수를 확정한다.
키 미설정 시 enabled=False → 상위 로직이 수동입력으로 폴백.
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

KOFIA_BASE = "https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService"
# 신용공여 잔고 추이 오퍼레이션명 (data.go.kr 실측 확인). 필요 시 env override.
# 형제 오퍼레이션: getTrustScaleInfo, getFundTotalNetEssetInfo, getCMAStatus,
#                getSecuritiesMarketTotalCapitalInfo, getDLSAndDLBInfo, getELSAndELBInfo
KOFIA_CREDIT_OP = os.getenv("KOFIA_CREDIT_OP", "getGrantingOfCreditBalanceInfo")
# 증시자금 오퍼레이션 (위탁매매 미수금·반대매매 포함)
KOFIA_MARKET_OP = os.getenv("KOFIA_MARKET_OP", "getSecuritiesMarketTotalCapitalInfo")
# 응답 필드 (data.go.kr 실측 확정)
#   basDt=기준일자, crdTrFingWhl=신용거래융자 잔고(전체시장, 원)
#   crdTrFingScrs=유가증권(KOSPI), crdTrFingKosdaq=코스닥, dpsgScrtMogFing=예탁증권담보융자
_DATE_FIELDS = ("basDt",)
_AMT_FIELDS = ("crdTrFingWhl", "crdtLoanRemainAmt", "totAmt", "amt")


class KofiaFetcher:
    """신용공여 잔고 시계열 수집 (data.go.kr 인증키 필요)"""

    def __init__(self):
        # data.go.kr 발급키. FRED와 동일 패턴.
        self._key = os.getenv("KOFIA_API_KEY") or os.getenv("DATA_GO_KR_KEY") or ""
        if not self._key:
            logger.info("KOFIA_API_KEY not set; 신용잔고는 수동입력으로 폴백")

    @property
    def enabled(self) -> bool:
        return bool(self._key)

    def _call(self, operation: str, params: Optional[dict] = None) -> dict:
        if not self._key:
            raise RuntimeError("KOFIA_API_KEY not set")
        p = {
            "resultType": "json",
            "numOfRows": 300,
            "pageNo": 1,
        }
        if params:
            p.update(params)
        # serviceKey는 URL에 직접 삽입 (params로 넘기면 재인코딩되어 401 → data.go.kr 고질 이슈)
        url = f"{KOFIA_BASE}/{operation}?serviceKey={self._key}"
        r = requests.get(url, params=p, timeout=15)
        r.raise_for_status()
        # 인증 오류 시 XML 에러가 오기도 함 → JSON 파싱 실패를 명확히 로깅
        try:
            return r.json()
        except ValueError:
            raise RuntimeError(f"KOFIA non-JSON response: {r.text[:200]}")

    def get_credit_balance(self, months: int = 8) -> list[dict]:
        """신용공여 잔고 시계열 [{date, value}] (실패 시 [])"""
        end = datetime.now()
        begin = end - timedelta(days=months * 31)
        try:
            raw = self._call(KOFIA_CREDIT_OP, {
                "beginBasDt": begin.strftime("%Y%m%d"),
                "endBasDt": end.strftime("%Y%m%d"),
            })
            return self._parse(raw)
        except Exception as e:
            logger.warning("KOFIA credit fetch failed: %s", e)
            return []

    def _parse(self, raw: dict) -> list[dict]:
        body = ((raw or {}).get("response") or {}).get("body") or {}
        items = body.get("items") or {}
        rows = items.get("item") if isinstance(items, dict) else items
        if isinstance(rows, dict):
            rows = [rows]
        out: list[dict] = []
        for it in (rows or []):
            date = next((it[f] for f in _DATE_FIELDS if it.get(f)), None)
            val = next((it[f] for f in _AMT_FIELDS if it.get(f) not in (None, "")), None)
            if not date or val is None:
                continue
            d = str(date)
            if len(d) == 8 and d.isdigit():
                d = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
            try:
                out.append({"date": d, "value": float(str(val).replace(",", ""))})
            except ValueError:
                continue
        out.sort(key=lambda x: x["date"])
        return out

    def get_forced_selling(self, months: int = 3) -> list[dict]:
        """반대매매 시계열 [{date, amount, ratio, ucol}] (실패 시 [])

        증시자금 오퍼레이션에서:
          brkTrdUcolMnyVsOppsTrdAmt = 위탁매매 미수금 대비 실제 반대매매 금액(원)
          ucolMnyVsOppsTrdRlImpt    = 미수금 대비 반대매매 비중(%)
          brkTrdUcolMny             = 위탁매매 미수금(원)
        """
        end = datetime.now()
        begin = end - timedelta(days=months * 31)
        try:
            raw = self._call(KOFIA_MARKET_OP, {
                "beginBasDt": begin.strftime("%Y%m%d"),
                "endBasDt": end.strftime("%Y%m%d"),
            })
        except Exception as e:
            logger.warning("KOFIA forced-selling fetch failed: %s", e)
            return []
        body = ((raw or {}).get("response") or {}).get("body") or {}
        items = body.get("items") or {}
        rows = items.get("item") if isinstance(items, dict) else items
        if isinstance(rows, dict):
            rows = [rows]
        out: list[dict] = []
        for it in (rows or []):
            date = it.get("basDt")
            if not date:
                continue
            d = str(date)
            if len(d) == 8 and d.isdigit():
                d = f"{d[:4]}-{d[4:6]}-{d[6:8]}"

            def num(v):
                try:
                    return float(str(v).replace(",", "")) if v not in (None, "") else None
                except ValueError:
                    return None

            out.append({
                "date": d,
                "amount": num(it.get("brkTrdUcolMnyVsOppsTrdAmt")),
                "ratio": num(it.get("ucolMnyVsOppsTrdRlImpt")),
                "ucol": num(it.get("brkTrdUcolMny")),
            })
        out.sort(key=lambda x: x["date"])
        return out

    def raw_sample(self) -> dict:
        """디버그: 원시 응답 그대로 반환 (오퍼레이션명·필드명 확인용)"""
        end = datetime.now()
        begin = end - timedelta(days=20)
        return self._call(KOFIA_CREDIT_OP, {
            "beginBasDt": begin.strftime("%Y%m%d"),
            "endBasDt": end.strftime("%Y%m%d"),
        })


# 싱글톤
kofia_fetcher = KofiaFetcher()
