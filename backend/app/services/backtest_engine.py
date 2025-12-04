"""백테스트 엔진 - 포트폴리오 시뮬레이션"""
import pandas as pd
import numpy as np
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional

from .data_fetcher import data_fetcher


class BacktestEngine:
    """백테스트 실행 엔진"""

    BENCHMARKS = ["QQQ", "SPY"]
    TRADING_DAYS_PER_YEAR = 252
    RISK_FREE_RATE = 0.02  # 2% 기본 무위험 수익률

    def __init__(self):
        self.data_fetcher = data_fetcher

    def calculate_cagr(
        self,
        initial_value: float,
        final_value: float,
        years: float
    ) -> float:
        """CAGR(연평균 복합 성장률) 계산"""
        if initial_value <= 0 or years <= 0:
            return 0.0

        return (final_value / initial_value) ** (1 / years) - 1

    def calculate_mdd(self, values: pd.Series) -> float:
        """MDD(최대 낙폭) 계산"""
        if len(values) == 0:
            return 0.0

        # 누적 최고점
        cummax = values.cummax()

        # 각 시점의 낙폭
        drawdown = (cummax - values) / cummax

        # 최대 낙폭
        return float(drawdown.max())

    def calculate_sharpe_ratio(
        self,
        daily_returns: pd.Series,
        risk_free_rate: float = None
    ) -> float:
        """Sharpe Ratio 계산"""
        if risk_free_rate is None:
            risk_free_rate = self.RISK_FREE_RATE

        if len(daily_returns) == 0:
            return 0.0

        # 일간 무위험 수익률
        daily_rf = risk_free_rate / self.TRADING_DAYS_PER_YEAR

        # 초과 수익률
        excess_returns = daily_returns - daily_rf

        # 표준편차
        std = excess_returns.std()

        if std == 0 or np.isnan(std):
            return 0.0

        # 연간화된 Sharpe Ratio
        sharpe = (excess_returns.mean() / std) * np.sqrt(self.TRADING_DAYS_PER_YEAR)

        return float(sharpe)

    def calculate_volatility(self, daily_returns: pd.Series) -> float:
        """연간 변동성 계산"""
        if len(daily_returns) == 0:
            return 0.0

        # 연간화 (일간 표준편차 * sqrt(252))
        return float(daily_returns.std() * np.sqrt(self.TRADING_DAYS_PER_YEAR))

    def get_rebalance_dates(
        self,
        start_date: date,
        end_date: date,
        rebalance: str
    ) -> list[date]:
        """리밸런싱 날짜 목록 반환"""
        if rebalance == "none":
            return []

        dates = []
        current = start_date

        if rebalance == "monthly":
            delta = relativedelta(months=1)
        elif rebalance == "quarterly":
            delta = relativedelta(months=3)
        elif rebalance == "yearly":
            delta = relativedelta(years=1)
        else:
            return []

        # 첫 번째 리밸런싱은 시작일 이후
        current = current + delta

        while current <= end_date:
            dates.append(current)
            current = current + delta

        return dates

    def normalize_weights(self, portfolio: list[dict]) -> list[dict]:
        """포트폴리오 비중 정규화 (합계 = 1.0)"""
        total_weight = sum(item["weight"] for item in portfolio)

        if total_weight == 0:
            raise ValueError("Total weight cannot be zero")

        return [
            {"symbol": item["symbol"], "weight": item["weight"] / total_weight}
            for item in portfolio
        ]

    def run_backtest(
        self,
        portfolio: list[dict],
        start_date: date,
        end_date: date,
        initial_amount: float = 10000,
        rebalance: str = "quarterly"
    ) -> dict:
        """백테스트 실행"""
        if not portfolio:
            raise ValueError("Portfolio cannot be empty")

        # 비중 정규화
        portfolio = self.normalize_weights(portfolio)

        # 심볼 목록
        symbols = [item["symbol"] for item in portfolio]
        all_symbols = list(set(symbols + self.BENCHMARKS))

        # 가격 데이터 가져오기
        try:
            price_data = self.data_fetcher.get_multiple_prices(
                all_symbols, start_date, end_date
            )
        except ValueError as e:
            raise ValueError(str(e))

        # 공통 날짜 찾기
        common_dates = None
        for symbol, df in price_data.items():
            if common_dates is None:
                common_dates = set(df.index)
            else:
                common_dates = common_dates.intersection(set(df.index))

        common_dates = sorted(list(common_dates))

        if len(common_dates) < 2:
            raise ValueError("Not enough data points for backtest")

        # 포트폴리오 가치 계산
        portfolio_values = self._calculate_portfolio_values(
            portfolio, price_data, common_dates, initial_amount, rebalance
        )

        # 벤치마크 가치 계산
        benchmarks = {}
        benchmark_metrics = {}
        for benchmark in self.BENCHMARKS:
            benchmark_values = self._calculate_single_asset_values(
                price_data[benchmark], common_dates, initial_amount
            )
            benchmarks[benchmark] = benchmark_values
            benchmark_metrics[benchmark] = self._calculate_metrics(benchmark_values)

        # 지표 계산
        metrics = self._calculate_metrics(portfolio_values)

        return {
            "portfolio_values": [
                {"date": str(d), "value": round(v, 2)}
                for d, v in portfolio_values.items()
            ],
            "benchmarks": {
                symbol: [
                    {"date": str(d), "value": round(v, 2)}
                    for d, v in values.items()
                ]
                for symbol, values in benchmarks.items()
            },
            "metrics": metrics,
            "benchmark_metrics": benchmark_metrics
        }

    def _calculate_portfolio_values(
        self,
        portfolio: list[dict],
        price_data: dict[str, pd.DataFrame],
        dates: list[date],
        initial_amount: float,
        rebalance: str
    ) -> dict[date, float]:
        """포트폴리오 일별 가치 계산"""
        rebalance_dates = set(self.get_rebalance_dates(dates[0], dates[-1], rebalance))

        # 초기 포지션 설정
        holdings = {}  # symbol -> shares
        first_date = dates[0]

        for item in portfolio:
            symbol = item["symbol"]
            weight = item["weight"]
            price = price_data[symbol].loc[first_date, "close"]
            amount = initial_amount * weight
            holdings[symbol] = amount / price

        values = {}

        for d in dates:
            # 현재 포트폴리오 가치 계산
            total_value = sum(
                holdings[symbol] * price_data[symbol].loc[d, "close"]
                for symbol in holdings
            )
            values[d] = total_value

            # 리밸런싱
            if d in rebalance_dates and d != dates[-1]:
                holdings = {}
                for item in portfolio:
                    symbol = item["symbol"]
                    weight = item["weight"]
                    price = price_data[symbol].loc[d, "close"]
                    amount = total_value * weight
                    holdings[symbol] = amount / price

        return values

    def _calculate_single_asset_values(
        self,
        price_df: pd.DataFrame,
        dates: list[date],
        initial_amount: float
    ) -> dict[date, float]:
        """단일 자산 일별 가치 계산"""
        first_price = price_df.loc[dates[0], "close"]
        shares = initial_amount / first_price

        return {
            d: shares * price_df.loc[d, "close"]
            for d in dates
        }

    def _calculate_metrics(self, values: dict[date, float]) -> dict:
        """성과 지표 계산"""
        dates = sorted(values.keys())
        value_series = pd.Series([values[d] for d in dates])

        # 일간 수익률
        daily_returns = value_series.pct_change().dropna()

        # 기간 (년)
        years = (dates[-1] - dates[0]).days / 365.25

        # CAGR
        cagr = self.calculate_cagr(
            value_series.iloc[0],
            value_series.iloc[-1],
            years
        )

        # MDD
        mdd = self.calculate_mdd(value_series)

        # Sharpe Ratio
        sharpe = self.calculate_sharpe_ratio(daily_returns)

        # Volatility
        volatility = self.calculate_volatility(daily_returns)

        return {
            "cagr": round(cagr, 4),
            "mdd": round(mdd, 4),
            "sharpe_ratio": round(sharpe, 4),
            "volatility": round(volatility, 4)
        }


# 싱글톤 인스턴스
backtest_engine = BacktestEngine()
