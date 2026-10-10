"""빅테크 AI 캐펙스 (yfinance 분기 현금흐름표) — AI 수요 최상류·선행 지표

MSFT/GOOGL/META/AMZN 분기 CapEx 실측 → QoQ 증가율(2차 미분)로 수요 가속/감속 판단.
'발표된 실적'이라 가이던스보다는 후행이나, 무료·자동으로 얻는 최상류 수요 신호.
"""
import logging
import os
import time
from datetime import date as _date

import requests
import yfinance as yf

logger = logging.getLogger(__name__)

_TICKERS = [("microsoft", "MSFT"), ("alphabet", "GOOGL"), ("meta", "META"), ("amazon", "AMZN")]

# SEC EDGAR 폴백 — Yahoo가 분기 현금흐름표를 늦게 싣는 회사(예: AMZN)는 10-Q 원본에서 보충
_CIK = {"MSFT": "0000789019", "GOOGL": "0001652044", "META": "0001326801", "AMZN": "0001018724"}
_EDGAR_TAGS = [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquireProductiveAssets",  # AMZN이 2017년 이후 쓰는 태그
]
# SEC EDGAR는 User-Agent에 연락처를 요구한다. 개인 이메일이 저장소에 남지 않도록
# 환경변수(EDGAR_CONTACT)로 주입하고, 없으면 익명 기본값을 쓴다.
_EDGAR_CONTACT = os.getenv("EDGAR_CONTACT", "contact@example.com")
_EDGAR_HEADERS = {"User-Agent": f"stock-portfolio-simulator ({_EDGAR_CONTACT})"}


class BigtechCapexFetcher:
    """빅테크 분기 CapEx 합계 및 증가율"""

    def __init__(self):
        self._edgar_cache: dict[str, tuple[float, list[dict]]] = {}

    def get_capex(self) -> dict:
        raw = {tk: self._ticker_capex(tk) for _, tk in _TICKERS}
        # Yahoo에서 뒤처진 티커는 EDGAR 10-Q로 최신 분기 보충
        latest_all = max((s[0]["date"] for s in raw.values() if s), default=None)
        for _, tk in _TICKERS:
            series = raw[tk]
            if latest_all and (not series or series[0]["date"] < latest_all):
                merged = {pt["date"]: pt["value"] for pt in series}
                for pt in self._edgar_capex(tk):
                    merged.setdefault(pt["date"], pt["value"])
                raw[tk] = sorted(
                    ({"date": d, "value": v} for d, v in merged.items()),
                    key=lambda x: x["date"], reverse=True,
                )

        companies = []
        quarters: dict[str, dict[str, float]] = {}   # 분기(str) → {티커: 값}
        fetched: list[str] = []                      # 데이터가 있는 티커
        for name, tk in _TICKERS:
            series = raw[tk]
            if not series:
                continue
            fetched.append(tk)
            latest = series[0]["value"]
            prev = series[1]["value"] if len(series) > 1 else None
            companies.append({
                "name": name, "ticker": tk,
                "latest": round(latest / 1e9, 1),
                "prev": round(prev / 1e9, 1) if prev is not None else None,
            })
            for pt in series[:6]:
                quarters.setdefault(pt["date"], {})[tk] = pt["value"]

        # 분기 합계 시계열 (최신순) — 회사별 내역과 미반영 회사 포함
        q_sorted = sorted(quarters.items(), key=lambda x: x[0], reverse=True)
        total_series = [
            {
                "date": d,
                "value": round(sum(comp.values()) / 1e9, 1),
                "breakdown": {tk: round(v / 1e9, 1) for tk, v in comp.items()},
                "missing": [tk for tk in fetched if tk not in comp],
            }
            for d, comp in q_sorted
        ]

        # QoQ는 전 회사가 보고된(완결) 분기끼리만 비교 — 실적 시즌 중 미발표 회사
        # (예: AMZN)가 낀 분기는 확정 전이므로 발표 완료까지 증가율 판정에서 제외
        complete = [(d, sum(comp.values())) for d, comp in q_sorted
                    if len(comp) == len(fetched)]

        growth_qoq = None
        accelerating = None
        qoq_asof = None
        if len(complete) >= 2 and complete[1][1]:
            g_now = (complete[0][1] / complete[1][1] - 1) * 100    # 최근 확정 분기 증가율
            growth_qoq = round(g_now, 1)
            qoq_asof = complete[0][0]
            if len(complete) >= 3 and complete[2][1]:
                g_prev = (complete[1][1] / complete[2][1] - 1) * 100  # 직전 확정 분기 증가율
                accelerating = g_now >= g_prev                # 증가율 자체가 유지/가속?

        return {
            "companies": companies,
            "total_series": total_series[:6],
            "total_latest": total_series[0]["value"] if total_series else None,
            "growth_qoq": growth_qoq,
            "accelerating": accelerating,
            "qoq_asof": qoq_asof,
        }

    def _ticker_capex(self, ticker: str) -> list[dict]:
        try:
            cf = yf.Ticker(ticker).quarterly_cashflow
            if cf is None or cf.empty or "Capital Expenditure" not in [str(i) for i in cf.index]:
                return []
            row = cf.loc["Capital Expenditure"].dropna()
            out = [{"date": str(c.date())[:7], "value": abs(float(v))} for c, v in row.items()]
            out.sort(key=lambda x: x["date"], reverse=True)
            return out
        except Exception as e:
            logger.warning("capex fetch failed for %s: %s", ticker, e)
            return []

    def _edgar_capex(self, ticker: str) -> list[dict]:
        """SEC EDGAR companyconcept에서 분기 CapEx 시계열 (6시간 캐시)"""
        cik = _CIK.get(ticker)
        if not cik:
            return []
        cached = self._edgar_cache.get(ticker)
        if cached and time.time() - cached[0] < 6 * 3600:
            return cached[1]
        quarters: dict[str, float] = {}
        for tag in _EDGAR_TAGS:
            try:
                url = f"https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/us-gaap/{tag}.json"
                r = requests.get(url, headers=_EDGAR_HEADERS, timeout=10)
                if r.status_code != 200:
                    continue
                facts = r.json().get("units", {}).get("USD", [])
                quarters.update(self._facts_to_quarters(facts))
            except Exception as e:
                logger.warning("edgar capex fetch failed for %s/%s: %s", ticker, tag, e)
        out = [{"date": d, "value": v} for d, v in quarters.items()]
        out.sort(key=lambda x: x["date"], reverse=True)
        self._edgar_cache[ticker] = (time.time(), out)
        return out

    @staticmethod
    def _facts_to_quarters(facts: list[dict]) -> dict[str, float]:
        """XBRL 기간 팩트 → 분기값. 3개월 팩트는 그대로, YTD 누계는 직전 누계와 차분."""
        def d(s: str) -> _date:
            y, m, dd = map(int, s.split("-"))
            return _date(y, m, dd)

        best: dict[tuple[str, str], dict] = {}   # (start, end) → 최신 제출본
        for f in facts:
            if f.get("form") not in ("10-Q", "10-K") or not f.get("start") or not f.get("end"):
                continue
            key = (f["start"], f["end"])
            if key not in best or f.get("filed", "") > best[key].get("filed", ""):
                best[key] = f

        by_start: dict[str, list[dict]] = {}
        for f in best.values():
            by_start.setdefault(f["start"], []).append(f)

        direct: dict[str, float] = {}    # 3개월 단일 기간 팩트
        derived: dict[str, float] = {}   # YTD 차분으로 도출
        for start, fs in by_start.items():
            fs.sort(key=lambda f: f["end"])
            prev = None
            for f in fs:
                base = start if prev is None else prev["end"]
                if 80 <= (d(f["end"]) - d(base)).days <= 100:   # 한 분기 간격만 인정
                    val = abs(float(f["val"]) - (float(prev["val"]) if prev else 0.0))
                    (direct if prev is None else derived)[f["end"][:7]] = val
                prev = f
        return {**derived, **direct}                             # 단일 기간 팩트 우선


bigtech_capex_fetcher = BigtechCapexFetcher()
