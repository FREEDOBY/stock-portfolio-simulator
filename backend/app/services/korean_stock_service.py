"""한국 주식/ETF 검색 서비스 - pykrx 기반"""
import time
from typing import Optional
from pykrx import stock as pykrx


class KoreanStockService:
    """한국 종목 검색 서비스"""

    # 캐시 만료 시간 (초)
    CACHE_TTL = 3600  # 1시간

    def __init__(self):
        self._ticker_cache: dict[str, dict] = {}  # ticker -> {name, market}
        self._name_cache: dict[str, str] = {}     # name -> ticker
        self._cache_time: float = 0
        self._is_loading: bool = False

    def _refresh_cache_if_needed(self):
        """캐시가 만료되었으면 새로고침"""
        now = time.time()
        if now - self._cache_time > self.CACHE_TTL or not self._ticker_cache:
            self._load_all_tickers()

    def _load_all_tickers(self):
        """전체 종목 목록 로드 (시장 정보 포함)"""
        if self._is_loading:
            return
        self._is_loading = True

        try:
            # KOSPI + KOSDAQ 전체 종목 (시장 정보 함께 저장)
            for market in ["KOSPI", "KOSDAQ"]:
                tickers = pykrx.get_market_ticker_list(market=market)
                for ticker in tickers:
                    try:
                        name = pykrx.get_market_ticker_name(ticker)
                        if name:
                            self._ticker_cache[ticker] = {
                                "name": name,
                                "market": market
                            }
                            self._name_cache[name] = ticker
                    except Exception:
                        continue

            self._cache_time = time.time()
        except Exception as e:
            print(f"Failed to load Korean stock tickers: {e}")
        finally:
            self._is_loading = False

    def search(self, query: str, limit: int = 20) -> list[dict]:
        """
        한국 종목 검색

        Args:
            query: 검색어 (한글 종목명 또는 종목코드)
            limit: 최대 결과 수

        Returns:
            검색 결과 리스트
        """
        self._refresh_cache_if_needed()

        query = query.strip()
        results = []

        # 숫자 6자리면 종목코드로 검색
        if query.isdigit() and len(query) == 6:
            if query in self._ticker_cache:
                info = self._ticker_cache[query]
                results.append({
                    "symbol": f"{query}.KS",
                    "name": info["name"],
                    "market": info["market"],
                    "is_korean": True
                })
            return results[:limit]

        # 한글/영문 검색 (캐시에서 시장 정보 직접 조회)
        query_lower = query.lower()
        for ticker, info in self._ticker_cache.items():
            name = info["name"]
            if query in name or query_lower in name.lower():
                results.append({
                    "symbol": f"{ticker}.KS",
                    "name": name,
                    "market": info["market"],
                    "is_korean": True
                })

                if len(results) >= limit:
                    break

        # 정확한 매칭 우선 정렬
        results.sort(key=lambda x: (
            0 if query == x["name"] else 1,
            0 if x["name"].startswith(query) else 1,
            x["name"]
        ))

        return results[:limit]

    def get_ticker_by_name(self, name: str) -> Optional[str]:
        """종목명으로 티커 조회"""
        self._refresh_cache_if_needed()
        return self._name_cache.get(name)

    def get_name_by_ticker(self, ticker: str) -> Optional[str]:
        """티커로 종목명 조회"""
        self._refresh_cache_if_needed()
        # .KS, .KQ 접미사 제거
        clean_ticker = ticker.replace(".KS", "").replace(".KQ", "")
        info = self._ticker_cache.get(clean_ticker)
        return info["name"] if info else None

    def is_valid_korean_ticker(self, ticker: str) -> bool:
        """유효한 한국 종목인지 확인"""
        self._refresh_cache_if_needed()
        clean_ticker = ticker.replace(".KS", "").replace(".KQ", "")
        return clean_ticker in self._ticker_cache


# 싱글톤 인스턴스
korean_stock_service = KoreanStockService()
