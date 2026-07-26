"""메모리 3사(공급) 캐펙스 (yfinance 분기 현금흐름표) — 공급 사이클 역발상 지표

삼성전자·SK하이닉스·마이크론의 분기 CapEx 합계(달러 환산) YoY.
증설 급팽창(YoY 급증)은 1~2년 뒤 공급과잉·가격붕괴의 전조(고점 위험),
반대로 감산(YoY 감소 전환)은 역사적으로 메모리 바닥의 전조.

주의:
- 한국 종목은 원화 재무제표 → USDKRW 환율로 달러 환산 (실패 시 1,400 폴백)
- 마이크론은 회계분기(2·5·8·11월 마감)라 캘린더 분기로 근사 매핑
- 합계 표시는 3사 모두 보고된 분기만, YoY/QoQ는 양 시점 모두 보고한
  회사들의 합끼리 비교 (부분 합계 왜곡 방지)
"""
import logging

import yfinance as yf

logger = logging.getLogger(__name__)

_TICKERS = [("samsung", "005930.KS", "KRW"), ("sk_hynix", "000660.KS", "KRW"), ("micron", "MU", "USD")]
_FX_FALLBACK = 1400.0


class MemoryCapexFetcher:
    """메모리 3사 분기 CapEx 합계(달러) 및 YoY 증가율"""

    def get_capex(self) -> dict:
        fx = self._usdkrw()
        per: dict[str, dict[tuple[int, int], float]] = {}   # 회사 → {(년,분기): $B}
        companies = []
        for name, tk, ccy in _TICKERS:
            series = self._ticker_capex(tk)
            if not series:
                continue
            div = 1e9 * (fx if ccy == "KRW" else 1.0)
            qmap: dict[tuple[int, int], float] = {}
            for pt in series[:8]:
                y, m = int(pt["date"][:4]), int(pt["date"][5:7])
                qmap[(y, (m - 1) // 3 + 1)] = pt["value"] / div
            per[name] = qmap
            companies.append({"name": name, "ticker": tk,
                              "latest": round(series[0]["value"] / div, 1)})
        if not per:
            return {"available": False}

        # 3사 모두 보고된 분기 = 표시용 합계 시계열 (회사별 내역 포함)
        _LABELS = {"samsung": "삼성전자", "sk_hynix": "SK하이닉스", "micron": "마이크론"}
        common = sorted(set.intersection(*(set(m) for m in per.values())), reverse=True)
        total_series = [
            {"date": f"{qk[0]:04d}-{qk[1] * 3:02d}",
             "value": round(sum(m[qk] for m in per.values()), 1),
             "breakdown": {_LABELS.get(name, name): round(m[qk], 1) for name, m in per.items()}}
            for qk in common
        ]

        def _growth(target_qk) -> float | None:
            """최신 공통분기 vs target_qk — 양쪽 다 보고한 회사들의 합끼리 비교"""
            if not common:
                return None
            latest_qk = common[0]
            both = [m for m in per.values() if latest_qk in m and target_qk in m]
            if len(both) < 2:
                return None
            a = sum(m[target_qk] for m in both)
            b = sum(m[latest_qk] for m in both)
            return round((b / a - 1) * 100, 1) if a else None

        if common:
            y, q = common[0]
            growth_yoy = _growth((y - 1, q))
            growth_qoq = _growth((y, q - 1) if q > 1 else (y - 1, 4))
        else:
            growth_yoy = growth_qoq = None

        return {
            "available": bool(total_series),
            "companies": companies,
            "total_series": total_series[:8],
            "total_latest": total_series[0]["value"] if total_series else None,
            "growth_yoy": growth_yoy,
            "growth_qoq": growth_qoq,
            "fx": round(fx, 1),
        }

    @staticmethod
    def _usdkrw() -> float:
        try:
            h = yf.Ticker("USDKRW=X").history(period="5d", interval="1d")
            if h is not None and not h.empty:
                return float(h["Close"].iloc[-1])
        except Exception as e:
            logger.warning("USDKRW fetch failed: %s", e)
        return _FX_FALLBACK

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
            logger.warning("memory capex fetch failed for %s: %s", ticker, e)
            return []


memory_capex_fetcher = MemoryCapexFetcher()
