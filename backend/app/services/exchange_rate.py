"""환율 변환 서비스 - USD/KRW"""
import time
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf


class ExchangeRateService:
    """환율 변환 서비스"""

    # 캐시 만료 시간 (초)
    CACHE_TTL = 3600  # 1시간
    # 기본 환율 (조회 실패 시)
    DEFAULT_RATE = 1350.0

    def __init__(self):
        self._current_rate: Optional[float] = None
        self._current_rate_time: float = 0
        self._historical_cache: Optional[pd.DataFrame] = None
        self._historical_cache_time: float = 0

    def get_current_rate(self) -> float:
        """현재 USD/KRW 환율 조회"""
        now = time.time()

        # 캐시 확인
        if (self._current_rate is not None and
                now - self._current_rate_time < self.CACHE_TTL):
            return self._current_rate

        try:
            ticker = yf.Ticker("USDKRW=X")
            info = ticker.info
            rate = info.get("regularMarketPrice") or info.get("previousClose")

            if rate and rate > 0:
                self._current_rate = float(rate)
                self._current_rate_time = now
                return self._current_rate
        except Exception as e:
            print(f"Failed to get current exchange rate: {e}")

        return self.DEFAULT_RATE

    def get_historical_rates(
        self,
        start_date: date,
        end_date: date
    ) -> pd.DataFrame:
        """
        기간별 환율 데이터 조회

        Args:
            start_date: 시작일
            end_date: 종료일

        Returns:
            환율 DataFrame (인덱스: 날짜, 컬럼: rate)
        """
        now = time.time()

        # 캐시 확인
        if (self._historical_cache is not None and
                now - self._historical_cache_time < self.CACHE_TTL):
            try:
                cached_start = min(self._historical_cache.index)
                cached_end = max(self._historical_cache.index)
                if cached_start <= start_date and cached_end >= end_date:
                    mask = ((self._historical_cache.index >= start_date) &
                            (self._historical_cache.index <= end_date))
                    return self._historical_cache[mask].copy()
            except Exception:
                pass

        # 새로 조회
        try:
            ticker = yf.Ticker("USDKRW=X")
            df = ticker.history(
                start=(start_date - timedelta(days=7)).isoformat(),
                end=(end_date + timedelta(days=1)).isoformat()
            )

            if not df.empty:
                df = df[['Close']].copy()
                df.columns = ['rate']
                # timezone 제거 (yfinance는 timezone-aware 반환)
                if df.index.tz is not None:
                    df.index = df.index.tz_localize(None)
                df.index = pd.to_datetime(df.index).date

                self._historical_cache = df
                self._historical_cache_time = now

                mask = (df.index >= start_date) & (df.index <= end_date)
                return df[mask].copy()
        except Exception as e:
            print(f"Failed to get historical exchange rates: {e}")

        # 실패 시 기본값으로 DataFrame 생성
        return self._generate_default_rates(start_date, end_date)

    def _generate_default_rates(
        self,
        start_date: date,
        end_date: date
    ) -> pd.DataFrame:
        """기본 환율로 DataFrame 생성"""
        dates = pd.date_range(start=start_date, end=end_date, freq='B')
        return pd.DataFrame(
            {'rate': [self.DEFAULT_RATE] * len(dates)},
            index=[d.date() for d in dates]
        )

    def convert_krw_to_usd(
        self,
        amount: float,
        rate: Optional[float] = None
    ) -> float:
        """
        원화를 달러로 변환

        Args:
            amount: 원화 금액
            rate: 환율 (None이면 현재 환율 사용)

        Returns:
            달러 금액
        """
        if rate is None:
            rate = self.get_current_rate()
        return amount / rate

    def convert_price_series(
        self,
        prices: pd.DataFrame,
        rates: pd.DataFrame
    ) -> pd.DataFrame:
        """
        가격 시리즈를 환율 적용하여 USD로 변환

        Args:
            prices: 가격 DataFrame (인덱스: 날짜, 컬럼: close)
            rates: 환율 DataFrame (인덱스: 날짜, 컬럼: rate)

        Returns:
            USD로 변환된 가격 DataFrame
        """
        # 인덱스 정렬
        merged = prices.copy()
        merged['rate'] = None

        # 날짜별 환율 매핑
        for idx in merged.index:
            if idx in rates.index:
                merged.loc[idx, 'rate'] = rates.loc[idx, 'rate']

        # NaN 환율은 forward fill 후 backward fill
        merged['rate'] = merged['rate'].ffill().bfill()

        # 여전히 NaN이면 기본값
        merged['rate'] = merged['rate'].fillna(self.DEFAULT_RATE)

        # 원화 가격을 달러로 변환
        merged['close'] = merged['close'] / merged['rate']

        return merged[['close']]

    def get_rate_for_date(self, target_date: date) -> float:
        """
        특정 날짜의 환율 조회

        Args:
            target_date: 대상 날짜

        Returns:
            해당 날짜의 환율
        """
        rates = self.get_historical_rates(
            target_date - timedelta(days=7),
            target_date + timedelta(days=1)
        )

        if target_date in rates.index:
            return float(rates.loc[target_date, 'rate'])

        # 가장 가까운 날짜의 환율
        if not rates.empty:
            closest_date = min(rates.index, key=lambda x: abs((x - target_date).days))
            return float(rates.loc[closest_date, 'rate'])

        return self.DEFAULT_RATE


# 싱글톤 인스턴스
exchange_rate_service = ExchangeRateService()
