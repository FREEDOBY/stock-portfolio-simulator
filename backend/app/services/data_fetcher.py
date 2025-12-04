"""yfinance를 사용한 데이터 수집 서비스"""
import os
import yfinance as yf
import pandas as pd
import httpx
from datetime import date, timedelta
from functools import lru_cache
from typing import Optional
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# Financial Modeling Prep API 설정
FMP_API_KEY = os.getenv("FMP_API_KEY", "")
FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"


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
        self._http_client = None

    @property
    def http_client(self):
        if self._http_client is None:
            self._http_client = httpx.Client(timeout=10.0)
        return self._http_client

    def search_etf(self, query: str) -> list[dict]:
        """ETF 검색 (로컬 + FMP API 하이브리드)"""
        query = query.upper().strip()
        results = []

        # 1. 로컬 목록에서 먼저 검색 (빠름)
        for etf in self.etf_list:
            if query in etf["symbol"] or query.lower() in etf["name"].lower():
                results.append(etf)

        # 2. FMP API로 추가 검색 (API 키가 있을 때만)
        if FMP_API_KEY and len(results) < 10:
            try:
                fmp_results = self._search_etf_fmp(query)
                # 중복 제거하며 추가
                existing_symbols = {r["symbol"] for r in results}
                for etf in fmp_results:
                    if etf["symbol"] not in existing_symbols:
                        results.append(etf)
                        existing_symbols.add(etf["symbol"])
            except Exception:
                pass  # API 실패 시 로컬 결과만 반환

        # 정확한 매칭을 먼저 정렬
        results.sort(key=lambda x: (
            0 if x["symbol"] == query else 1,
            x["symbol"]
        ))

        return results[:20]  # 최대 20개

    def _search_etf_fmp(self, query: str) -> list[dict]:
        """Financial Modeling Prep API로 ETF 검색"""
        url = f"{FMP_BASE_URL}/search"
        params = {
            "query": query,
            "limit": 20,
            "exchange": "ETF",
            "apikey": FMP_API_KEY
        }

        response = self.http_client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        return [
            {"symbol": item["symbol"], "name": item["name"]}
            for item in data
            if item.get("symbol") and item.get("name")
        ]

    def get_etf_info(self, symbol: str) -> Optional[dict]:
        """ETF 정보 조회"""
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            # yfinance가 유효하지 않은 심볼도 빈 info를 반환할 수 있음
            # longName이나 shortName이 있어야 유효한 종목
            name = info.get("longName") or info.get("shortName")
            if not name:
                # 로컬 목록에서 검색
                for etf in self.etf_list:
                    if etf["symbol"] == symbol.upper():
                        return {**etf, "expense_ratio": None}
                return None

            return {
                "symbol": symbol.upper(),
                "name": name,
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
