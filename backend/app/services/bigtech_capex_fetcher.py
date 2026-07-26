"""빅테크 AI 캐펙스 (yfinance 분기 현금흐름표) — AI 수요 최상류·선행 지표

MSFT/GOOGL/META/AMZN 분기 CapEx 실측 → QoQ 증가율(2차 미분)로 수요 가속/감속 판단.
'발표된 실적'이라 가이던스보다는 후행이나, 무료·자동으로 얻는 최상류 수요 신호.
"""
import logging

import yfinance as yf

logger = logging.getLogger(__name__)

_TICKERS = [("microsoft", "MSFT"), ("alphabet", "GOOGL"), ("meta", "META"), ("amazon", "AMZN")]


class BigtechCapexFetcher:
    """빅테크 분기 CapEx 합계 및 증가율"""

    def get_capex(self) -> dict:
        companies = []
        quarters: dict[str, dict[str, float]] = {}   # 분기(str) → {티커: 값}
        fetched: list[str] = []                      # 데이터가 있는 티커
        for name, tk in _TICKERS:
            series = self._ticker_capex(tk)
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

        growth_qoq = None
        accelerating = None
        if len(total_series) >= 3:
            t0, t1, t2 = total_series[0]["value"], total_series[1]["value"], total_series[2]["value"]
            g_now = (t0 / t1 - 1) * 100 if t1 else None       # 최근 분기 증가율
            g_prev = (t1 / t2 - 1) * 100 if t2 else None      # 직전 분기 증가율
            if g_now is not None:
                growth_qoq = round(g_now, 1)
            if g_now is not None and g_prev is not None:
                accelerating = g_now >= g_prev                # 증가율 자체가 유지/가속?

        return {
            "companies": companies,
            "total_series": total_series[:6],
            "total_latest": total_series[0]["value"] if total_series else None,
            "growth_qoq": growth_qoq,
            "accelerating": accelerating,
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


bigtech_capex_fetcher = BigtechCapexFetcher()
