"""yfinance를 사용한 데이터 수집 서비스"""
import yfinance as yf
import pandas as pd
from datetime import date, timedelta
from functools import lru_cache
from typing import Optional


# 인기 ETF 목록 (검색용)
POPULAR_ETFS = [
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust"},
    {"symbol": "VTI", "name": "Vanguard Total Stock Market ETF"},
    {"symbol": "VOO", "name": "Vanguard S&P 500 ETF"},
    {"symbol": "VEA", "name": "Vanguard FTSE Developed Markets ETF"},
    {"symbol": "VWO", "name": "Vanguard FTSE Emerging Markets ETF"},
    {"symbol": "BND", "name": "Vanguard Total Bond Market ETF"},
    {"symbol": "AGG", "name": "iShares Core U.S. Aggregate Bond ETF"},
    {"symbol": "GLD", "name": "SPDR Gold Shares"},
    {"symbol": "IWM", "name": "iShares Russell 2000 ETF"},
    {"symbol": "EFA", "name": "iShares MSCI EAFE ETF"},
    {"symbol": "EEM", "name": "iShares MSCI Emerging Markets ETF"},
    {"symbol": "TLT", "name": "iShares 20+ Year Treasury Bond ETF"},
    {"symbol": "LQD", "name": "iShares iBoxx $ Investment Grade Corporate Bond ETF"},
    {"symbol": "VNQ", "name": "Vanguard Real Estate ETF"},
    {"symbol": "SCHD", "name": "Schwab U.S. Dividend Equity ETF"},
    {"symbol": "VIG", "name": "Vanguard Dividend Appreciation ETF"},
    {"symbol": "ARKK", "name": "ARK Innovation ETF"},
    {"symbol": "XLK", "name": "Technology Select Sector SPDR Fund"},
    {"symbol": "XLF", "name": "Financial Select Sector SPDR Fund"},
    {"symbol": "XLE", "name": "Energy Select Sector SPDR Fund"},
    {"symbol": "XLV", "name": "Health Care Select Sector SPDR Fund"},
    {"symbol": "XLI", "name": "Industrial Select Sector SPDR Fund"},
    {"symbol": "XLP", "name": "Consumer Staples Select Sector SPDR Fund"},
    {"symbol": "XLY", "name": "Consumer Discretionary Select Sector SPDR Fund"},
    {"symbol": "IEMG", "name": "iShares Core MSCI Emerging Markets ETF"},
    {"symbol": "IJH", "name": "iShares Core S&P Mid-Cap ETF"},
    {"symbol": "IJR", "name": "iShares Core S&P Small-Cap ETF"},
    {"symbol": "VB", "name": "Vanguard Small-Cap ETF"},
    {"symbol": "VTV", "name": "Vanguard Value ETF"},
    {"symbol": "VUG", "name": "Vanguard Growth ETF"},
    {"symbol": "VXUS", "name": "Vanguard Total International Stock ETF"},
]


class DataFetcher:
    """주가 데이터 수집 클래스"""

    def __init__(self):
        self.etf_list = POPULAR_ETFS

    def search_etf(self, query: str) -> list[dict]:
        """ETF 검색"""
        query = query.upper().strip()
        results = []

        for etf in self.etf_list:
            if query in etf["symbol"] or query.lower() in etf["name"].lower():
                results.append(etf)

        # 정확한 매칭을 먼저 정렬
        results.sort(key=lambda x: (
            0 if x["symbol"] == query else 1,
            x["symbol"]
        ))

        return results[:20]  # 최대 20개

    def get_etf_info(self, symbol: str) -> Optional[dict]:
        """ETF 정보 조회"""
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            return {
                "symbol": symbol.upper(),
                "name": info.get("longName") or info.get("shortName") or symbol,
                "expense_ratio": info.get("annualReportExpenseRatio")
            }
        except Exception:
            # 로컬 목록에서 검색
            for etf in self.etf_list:
                if etf["symbol"] == symbol.upper():
                    return {**etf, "expense_ratio": None}
            return None

    def get_price_history(
        self,
        symbol: str,
        start_date: date,
        end_date: date
    ) -> pd.DataFrame:
        """주가 히스토리 조회"""
        # 시작일 약간 앞으로 조정 (첫 거래일 확보)
        adjusted_start = start_date - timedelta(days=7)

        ticker = yf.Ticker(symbol)
        df = ticker.history(
            start=adjusted_start.isoformat(),
            end=(end_date + timedelta(days=1)).isoformat(),
            auto_adjust=True  # 수정 주가 사용
        )

        if df.empty:
            raise ValueError(f"No data found for symbol: {symbol}")

        # 필요한 컬럼만 선택
        df = df[["Close"]].copy()
        df.columns = ["close"]
        df.index = pd.to_datetime(df.index).date

        # 요청 기간으로 필터링
        df = df[(df.index >= start_date) & (df.index <= end_date)]

        return df

    def get_multiple_prices(
        self,
        symbols: list[str],
        start_date: date,
        end_date: date
    ) -> dict[str, pd.DataFrame]:
        """여러 종목 주가 히스토리 조회"""
        result = {}

        for symbol in symbols:
            try:
                result[symbol] = self.get_price_history(symbol, start_date, end_date)
            except ValueError as e:
                raise ValueError(f"Failed to fetch data for {symbol}: {e}")

        return result


# 싱글톤 인스턴스
data_fetcher = DataFetcher()
