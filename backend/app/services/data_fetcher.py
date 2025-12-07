"""yfinance를 사용한 데이터 수집 서비스"""
import os
import yfinance as yf
import pandas as pd
import httpx
from datetime import date, timedelta
from functools import lru_cache
from typing import Optional
from dotenv import load_dotenv

from .korean_stock_service import korean_stock_service
from .exchange_rate import exchange_rate_service

# .env 파일 로드
load_dotenv()

# Financial Modeling Prep API 설정
FMP_API_KEY = os.getenv("FMP_API_KEY", "")
FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"


# 인기 ETF 목록 (검색용)
POPULAR_ETFS = [
    # 주요 지수 ETF
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust"},
    {"symbol": "VTI", "name": "Vanguard Total Stock Market ETF"},
    {"symbol": "VOO", "name": "Vanguard S&P 500 ETF"},
    {"symbol": "IVV", "name": "iShares Core S&P 500 ETF"},
    {"symbol": "DIA", "name": "SPDR Dow Jones Industrial Average ETF"},
    # 레버리지 ETF
    {"symbol": "TQQQ", "name": "ProShares UltraPro QQQ"},
    {"symbol": "QLD", "name": "ProShares Ultra QQQ"},
    {"symbol": "SQQQ", "name": "ProShares UltraPro Short QQQ"},
    {"symbol": "SOXL", "name": "Direxion Daily Semiconductor Bull 3X"},
    {"symbol": "SOXS", "name": "Direxion Daily Semiconductor Bear 3X"},
    {"symbol": "UPRO", "name": "ProShares UltraPro S&P500"},
    {"symbol": "SPXL", "name": "Direxion Daily S&P 500 Bull 3X"},
    {"symbol": "SSO", "name": "ProShares Ultra S&P500"},
    {"symbol": "TECL", "name": "Direxion Daily Technology Bull 3X"},
    {"symbol": "FNGU", "name": "MicroSectors FANG+ Index 3X Leveraged ETN"},
    {"symbol": "LABU", "name": "Direxion Daily S&P Biotech Bull 3X"},
    {"symbol": "TNA", "name": "Direxion Daily Small Cap Bull 3X"},
    {"symbol": "UDOW", "name": "ProShares UltraPro Dow30"},
    {"symbol": "TMF", "name": "Direxion Daily 20+ Year Treasury Bull 3X"},
    # 국제 ETF
    {"symbol": "VEA", "name": "Vanguard FTSE Developed Markets ETF"},
    {"symbol": "VWO", "name": "Vanguard FTSE Emerging Markets ETF"},
    {"symbol": "EFA", "name": "iShares MSCI EAFE ETF"},
    {"symbol": "EEM", "name": "iShares MSCI Emerging Markets ETF"},
    {"symbol": "IEMG", "name": "iShares Core MSCI Emerging Markets ETF"},
    {"symbol": "VXUS", "name": "Vanguard Total International Stock ETF"},
    # 채권 ETF
    {"symbol": "BND", "name": "Vanguard Total Bond Market ETF"},
    {"symbol": "AGG", "name": "iShares Core U.S. Aggregate Bond ETF"},
    {"symbol": "TLT", "name": "iShares 20+ Year Treasury Bond ETF"},
    {"symbol": "LQD", "name": "iShares iBoxx $ Investment Grade Corporate Bond ETF"},
    {"symbol": "HYG", "name": "iShares iBoxx $ High Yield Corporate Bond ETF"},
    {"symbol": "SHY", "name": "iShares 1-3 Year Treasury Bond ETF"},
    {"symbol": "IEF", "name": "iShares 7-10 Year Treasury Bond ETF"},
    # 원자재 ETF
    {"symbol": "GLD", "name": "SPDR Gold Shares"},
    {"symbol": "SLV", "name": "iShares Silver Trust"},
    {"symbol": "USO", "name": "United States Oil Fund"},
    {"symbol": "UNG", "name": "United States Natural Gas Fund"},
    # 섹터 ETF
    {"symbol": "XLK", "name": "Technology Select Sector SPDR Fund"},
    {"symbol": "XLF", "name": "Financial Select Sector SPDR Fund"},
    {"symbol": "XLE", "name": "Energy Select Sector SPDR Fund"},
    {"symbol": "XLV", "name": "Health Care Select Sector SPDR Fund"},
    {"symbol": "XLI", "name": "Industrial Select Sector SPDR Fund"},
    {"symbol": "XLP", "name": "Consumer Staples Select Sector SPDR Fund"},
    {"symbol": "XLY", "name": "Consumer Discretionary Select Sector SPDR Fund"},
    {"symbol": "XLU", "name": "Utilities Select Sector SPDR Fund"},
    {"symbol": "XLB", "name": "Materials Select Sector SPDR Fund"},
    {"symbol": "XLRE", "name": "Real Estate Select Sector SPDR Fund"},
    # 스타일/사이즈 ETF
    {"symbol": "IWM", "name": "iShares Russell 2000 ETF"},
    {"symbol": "IJH", "name": "iShares Core S&P Mid-Cap ETF"},
    {"symbol": "IJR", "name": "iShares Core S&P Small-Cap ETF"},
    {"symbol": "VB", "name": "Vanguard Small-Cap ETF"},
    {"symbol": "VTV", "name": "Vanguard Value ETF"},
    {"symbol": "VUG", "name": "Vanguard Growth ETF"},
    {"symbol": "VNQ", "name": "Vanguard Real Estate ETF"},
    # 배당 ETF
    {"symbol": "SCHD", "name": "Schwab U.S. Dividend Equity ETF"},
    {"symbol": "VIG", "name": "Vanguard Dividend Appreciation ETF"},
    {"symbol": "VYM", "name": "Vanguard High Dividend Yield ETF"},
    {"symbol": "DVY", "name": "iShares Select Dividend ETF"},
    # 테마 ETF
    {"symbol": "ARKK", "name": "ARK Innovation ETF"},
    {"symbol": "ARKG", "name": "ARK Genomic Revolution ETF"},
    {"symbol": "ARKW", "name": "ARK Next Generation Internet ETF"},
    {"symbol": "SMH", "name": "VanEck Semiconductor ETF"},
    {"symbol": "SOXX", "name": "iShares Semiconductor ETF"},
    {"symbol": "KWEB", "name": "KraneShares CSI China Internet ETF"},
]


def is_korean_symbol(symbol: str) -> bool:
    """한국 종목 심볼인지 확인"""
    return symbol.endswith(".KS") or symbol.endswith(".KQ")


def contains_korean(text: str) -> bool:
    """한글이 포함되어 있는지 확인"""
    for char in text:
        if '\uac00' <= char <= '\ud7af':  # 한글 음절
            return True
        if '\u3130' <= char <= '\u318f':  # 한글 자모
            return True
    return False


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
        """ETF/주식 검색 (한국 + 해외 통합)"""
        query_stripped = query.strip()
        results = []
        existing_symbols = set()

        # 한글 검색 또는 6자리 숫자(한국 종목코드) 감지
        is_korean_query = contains_korean(query_stripped)
        is_korean_code = query_stripped.isdigit() and len(query_stripped) == 6

        if is_korean_query or is_korean_code:
            # 한국 종목 검색
            korean_results = korean_stock_service.search(query_stripped)
            for item in korean_results:
                if item["symbol"] not in existing_symbols:
                    results.append(item)
                    existing_symbols.add(item["symbol"])
            return results[:20]

        # 해외 ETF/주식 검색
        query_upper = query_stripped.upper()

        # 1. 로컬 목록에서 먼저 검색 (빠름)
        for etf in self.etf_list:
            if query_upper in etf["symbol"] or query_upper.lower() in etf["name"].lower():
                results.append(etf)
                existing_symbols.add(etf["symbol"])

        # 2. 정확한 심볼 매칭 시 yfinance로 직접 조회
        if query_upper not in existing_symbols and len(query_upper) >= 2:
            try:
                ticker = yf.Ticker(query_upper)
                info = ticker.info
                name = info.get("longName") or info.get("shortName")
                if name:
                    results.insert(0, {"symbol": query_upper, "name": name})
                    existing_symbols.add(query_upper)
            except Exception:
                pass

        # 3. FMP API로 추가 검색 (API 키가 있을 때만)
        if FMP_API_KEY and len(results) < 10:
            try:
                fmp_results = self._search_etf_fmp(query_upper)
                for etf in fmp_results:
                    if etf["symbol"] not in existing_symbols:
                        results.append(etf)
                        existing_symbols.add(etf["symbol"])
            except Exception:
                pass

        # 정확한 매칭을 먼저 정렬
        results.sort(key=lambda x: (
            0 if x["symbol"] == query_upper else 1,
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
        """주가 히스토리 조회 (한국 종목은 USD로 변환)"""
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

        # 한국 종목이면 원화 → 달러 변환
        if is_korean_symbol(symbol):
            rates = exchange_rate_service.get_historical_rates(start_date, end_date)
            df = exchange_rate_service.convert_price_series(df, rates)

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

    def get_dividends(
        self,
        symbol: str,
        start_date: date,
        end_date: date
    ) -> pd.DataFrame:
        """배당 데이터 조회 (한국 종목은 USD로 변환)"""
        try:
            ticker = yf.Ticker(symbol)
            dividends = ticker.dividends

            if dividends.empty:
                return pd.DataFrame(columns=['dividend'])

            # timezone 제거 (yfinance는 timezone-aware 날짜를 반환함)
            if dividends.index.tz is not None:
                dividends = dividends.copy()
                dividends.index = dividends.index.tz_localize(None)

            # 날짜를 date 객체로 변환
            dividends.index = pd.to_datetime(dividends.index).date

            # 날짜 범위 필터링
            mask = (dividends.index >= start_date) & (dividends.index <= end_date)
            filtered = dividends[mask]

            if filtered.empty:
                return pd.DataFrame(columns=['dividend'])

            df = filtered.to_frame(name='dividend')

            # 한국 종목이면 원화 → 달러 변환
            if is_korean_symbol(symbol):
                rates = exchange_rate_service.get_historical_rates(start_date, end_date)
                for idx in df.index:
                    rate = exchange_rate_service.get_rate_for_date(idx)
                    df.loc[idx, 'dividend'] = df.loc[idx, 'dividend'] / rate

            return df
        except Exception:
            return pd.DataFrame(columns=['dividend'])

    def get_multiple_dividends(
        self,
        symbols: list[str],
        start_date: date,
        end_date: date
    ) -> dict[str, pd.DataFrame]:
        """여러 종목 배당 데이터 조회"""
        result = {}
        for symbol in symbols:
            result[symbol] = self.get_dividends(symbol, start_date, end_date)
        return result


# 싱글톤 인스턴스
data_fetcher = DataFetcher()
