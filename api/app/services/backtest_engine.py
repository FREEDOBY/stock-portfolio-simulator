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

    def get_dca_dates(
        self,
        start_date: date,
        end_date: date,
        frequency: str,
        available_dates: set[date] = None
    ) -> list[date]:
        """적립식 투자 날짜 목록 반환"""
        dates = [start_date]  # 첫 투자일 포함
        current = start_date

        if frequency == "daily":
            delta = timedelta(days=1)
        elif frequency == "weekly":
            delta = timedelta(weeks=1)
        elif frequency == "biweekly":
            delta = timedelta(weeks=2)
        elif frequency == "monthly":
            delta = relativedelta(months=1)
        else:
            return [start_date]

        current = current + delta
        while current <= end_date:
            dates.append(current)
            current = current + delta

        # 거래일만 필터링 (휴장일은 다음 거래일로 조정)
        if available_dates:
            adjusted_dates = []
            sorted_available = sorted(available_dates)
            for d in dates:
                if d in available_dates:
                    adjusted_dates.append(d)
                else:
                    # 다음 거래일 찾기
                    for avail in sorted_available:
                        if avail >= d:
                            if avail not in adjusted_dates:
                                adjusted_dates.append(avail)
                            break
            return adjusted_dates

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
        rebalance: str = "quarterly",
        investment_type: str = "lump_sum",
        dca_settings: Optional[dict] = None
    ) -> dict:
        """백테스트 실행"""
        if not portfolio:
            raise ValueError("Portfolio cannot be empty")

        # DCA 유효성 검사
        if investment_type == "dca" and not dca_settings:
            raise ValueError("DCA settings required for DCA investment type")

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

        common_dates_set = common_dates
        common_dates = sorted(list(common_dates))

        if len(common_dates) < 2:
            raise ValueError("Not enough data points for backtest")

        # 투자 방식에 따른 분기
        portfolio_invested_amounts = {}  # 일별 누적 투자원금
        benchmark_invested_amounts = {}  # 벤치마크별 일별 누적 투자원금
        holdings_history = {}  # 일별 보유주식수 기록

        if investment_type == "dca" and dca_settings:
            dca_amount = dca_settings["amount"]
            dca_frequency = dca_settings["frequency"]

            # 적립식 포트폴리오 계산
            portfolio_values, portfolio_invested_amounts, total_invested, holdings_history = self._calculate_portfolio_values_dca(
                portfolio, price_data, common_dates,
                initial_amount, dca_amount, dca_frequency, rebalance,
                common_dates_set
            )

            # 적립식 벤치마크 계산
            benchmarks = {}
            benchmark_metrics = {}
            for benchmark in self.BENCHMARKS:
                bench_values, bench_invested_amounts, bench_invested = self._calculate_single_asset_values_dca(
                    price_data[benchmark], common_dates,
                    initial_amount, dca_amount, dca_frequency,
                    common_dates_set
                )
                benchmarks[benchmark] = bench_values
                benchmark_invested_amounts[benchmark] = bench_invested_amounts
                benchmark_metrics[benchmark] = self._calculate_metrics(
                    bench_values, bench_invested
                )

            # 적립식 지표 계산 (총 투자 원금 기준)
            metrics = self._calculate_metrics(portfolio_values, total_invested)
        else:
            # 기존 거치식 로직
            portfolio_values, holdings_history = self._calculate_portfolio_values(
                portfolio, price_data, common_dates, initial_amount, rebalance
            )
            total_invested = initial_amount

            # 벤치마크 가치 계산
            benchmarks = {}
            benchmark_metrics = {}
            for benchmark in self.BENCHMARKS:
                benchmark_values = self._calculate_single_asset_values(
                    price_data[benchmark], common_dates, initial_amount
                )
                benchmarks[benchmark] = benchmark_values
                benchmark_metrics[benchmark] = self._calculate_metrics(benchmark_values)

            # 거치식 지표 계산
            metrics = self._calculate_metrics(portfolio_values)

        # 배당 데이터 조회 및 통계 계산
        symbols = [item["symbol"] for item in portfolio]
        dividend_data = self.data_fetcher.get_multiple_dividends(
            symbols, start_date, end_date
        )

        # 정확한 배당 통계 계산 (일별 보유주식수 사용)
        dividend_stats = self.calculate_dividend_stats_accurate(
            portfolio=portfolio,
            dividend_data=dividend_data,
            total_invested=total_invested,
            holdings_history=holdings_history
        )

        # 응답 생성
        response_portfolio_values = []
        for d, v in portfolio_values.items():
            item = {"date": str(d), "value": round(v, 2)}
            # DCA 모드일 때만 invested 추가
            if d in portfolio_invested_amounts:
                item["invested"] = round(portfolio_invested_amounts[d], 2)
            response_portfolio_values.append(item)

        response_benchmarks = {}
        for symbol, values in benchmarks.items():
            benchmark_list = []
            for d, v in values.items():
                item = {"date": str(d), "value": round(v, 2)}
                # DCA 모드일 때만 invested 추가
                if symbol in benchmark_invested_amounts and d in benchmark_invested_amounts[symbol]:
                    item["invested"] = round(benchmark_invested_amounts[symbol][d], 2)
                benchmark_list.append(item)
            response_benchmarks[symbol] = benchmark_list

        return {
            "portfolio_values": response_portfolio_values,
            "benchmarks": response_benchmarks,
            "metrics": metrics,
            "benchmark_metrics": benchmark_metrics,
            "total_invested": round(total_invested, 2),
            "dividend_stats": dividend_stats
        }

    def _calculate_portfolio_values(
        self,
        portfolio: list[dict],
        price_data: dict[str, pd.DataFrame],
        dates: list[date],
        initial_amount: float,
        rebalance: str
    ) -> tuple[dict[date, float], dict[date, dict[str, float]]]:
        """
        포트폴리오 일별 가치 계산

        Returns:
            (values dict, holdings_history dict) - 일별 가치와 일별 보유주식수
        """
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
        holdings_history = {}  # 일별 보유주식수 기록

        for d in dates:
            # 현재 포트폴리오 가치 계산
            total_value = sum(
                holdings[symbol] * price_data[symbol].loc[d, "close"]
                for symbol in holdings
            )
            values[d] = total_value
            holdings_history[d] = holdings.copy()  # 해당 날짜의 보유주식수 저장

            # 리밸런싱
            if d in rebalance_dates and d != dates[-1]:
                holdings = {}
                for item in portfolio:
                    symbol = item["symbol"]
                    weight = item["weight"]
                    price = price_data[symbol].loc[d, "close"]
                    amount = total_value * weight
                    holdings[symbol] = amount / price

        return values, holdings_history

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

    def _calculate_metrics(
        self,
        values: dict[date, float],
        total_invested: Optional[float] = None
    ) -> dict:
        """성과 지표 계산

        Args:
            values: 일별 포트폴리오 가치
            total_invested: 총 투자 원금 (적립식의 경우 사용)
        """
        dates = sorted(values.keys())
        value_series = pd.Series([values[d] for d in dates])

        # 일간 수익률
        daily_returns = value_series.pct_change().dropna()

        # 기간 (년)
        years = (dates[-1] - dates[0]).days / 365.25

        # CAGR - 적립식의 경우 총 투자 원금 기준으로 계산
        initial_for_cagr = total_invested if total_invested else value_series.iloc[0]
        cagr = self.calculate_cagr(
            initial_for_cagr,
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

    def _calculate_portfolio_values_dca(
        self,
        portfolio: list[dict],
        price_data: dict[str, pd.DataFrame],
        dates: list[date],
        initial_amount: float,
        dca_amount: float,
        dca_frequency: str,
        rebalance: str,
        available_dates: set[date]
    ) -> tuple[dict[date, float], dict[date, float], float, dict[date, dict[str, float]]]:
        """
        적립식 포트폴리오 일별 가치 계산

        Returns:
            (values dict, invested_amounts dict, total_invested, holdings_history dict)
        """
        # DCA 투자일 및 리밸런싱일 계산
        dca_dates = set(self.get_dca_dates(
            dates[0], dates[-1], dca_frequency, available_dates
        ))
        rebalance_dates = set(self.get_rebalance_dates(dates[0], dates[-1], rebalance))

        holdings = {}  # symbol -> shares
        total_invested = 0.0
        values = {}
        invested_amounts = {}  # 일별 누적 투자원금
        holdings_history = {}  # 일별 보유주식수 기록
        first_date = dates[0]

        for d in dates:
            # 1. 첫날 투자 (초기 투자금 또는 DCA 금액)
            if d == first_date:
                # 초기 투자금이 있으면 초기 투자금으로
                # 없으면 DCA 금액으로 첫 투자
                first_investment = initial_amount if initial_amount > 0 else dca_amount
                if first_investment > 0:
                    total_invested += first_investment
                    for item in portfolio:
                        symbol = item["symbol"]
                        weight = item["weight"]
                        price = price_data[symbol].loc[d, "close"]
                        amount = first_investment * weight
                        holdings[symbol] = holdings.get(symbol, 0) + amount / price

            # 2. DCA 투자일에 추가 매수 (첫날 제외)
            elif d in dca_dates:
                total_invested += dca_amount
                for item in portfolio:
                    symbol = item["symbol"]
                    weight = item["weight"]
                    price = price_data[symbol].loc[d, "close"]
                    additional_amount = dca_amount * weight
                    holdings[symbol] = holdings.get(symbol, 0) + additional_amount / price

            # 일별 누적 투자원금 기록
            invested_amounts[d] = total_invested

            # 3. 현재 포트폴리오 가치 계산
            total_value = sum(
                holdings.get(symbol, 0) * price_data[symbol].loc[d, "close"]
                for symbol in [item["symbol"] for item in portfolio]
            )
            values[d] = total_value
            holdings_history[d] = holdings.copy()  # 해당 날짜의 보유주식수 저장

            # 4. 리밸런싱 (DCA 이후 수행)
            if d in rebalance_dates and d != dates[-1] and total_value > 0:
                holdings = {}
                for item in portfolio:
                    symbol = item["symbol"]
                    weight = item["weight"]
                    price = price_data[symbol].loc[d, "close"]
                    amount = total_value * weight
                    holdings[symbol] = amount / price

        return values, invested_amounts, total_invested, holdings_history

    def _calculate_single_asset_values_dca(
        self,
        price_df: pd.DataFrame,
        dates: list[date],
        initial_amount: float,
        dca_amount: float,
        dca_frequency: str,
        available_dates: set[date]
    ) -> tuple[dict[date, float], dict[date, float], float]:
        """
        단일 자산 적립식 일별 가치 계산

        Returns:
            (values dict, invested_amounts dict, total_invested)
        """
        dca_dates = set(self.get_dca_dates(
            dates[0], dates[-1], dca_frequency, available_dates
        ))

        shares = 0.0
        total_invested = 0.0
        values = {}
        invested_amounts = {}  # 일별 누적 투자원금
        first_date = dates[0]

        for d in dates:
            # 첫날 투자 (초기 투자금 또는 DCA 금액)
            if d == first_date:
                first_investment = initial_amount if initial_amount > 0 else dca_amount
                if first_investment > 0:
                    total_invested += first_investment
                    price = price_df.loc[d, "close"]
                    shares += first_investment / price

            # DCA 투자일 (첫날 제외)
            elif d in dca_dates:
                total_invested += dca_amount
                price = price_df.loc[d, "close"]
                shares += dca_amount / price

            # 일별 누적 투자원금 기록
            invested_amounts[d] = total_invested
            values[d] = shares * price_df.loc[d, "close"]

        return values, invested_amounts, total_invested

    def calculate_dividend_stats_accurate(
        self,
        portfolio: list[dict],
        dividend_data: dict[str, pd.DataFrame],
        total_invested: float,
        holdings_history: dict[date, dict[str, float]]
    ) -> dict:
        """
        정확한 배당 통계 계산 (배당일 기준 보유주식수 사용)

        Args:
            portfolio: 포트폴리오 구성
            dividend_data: 심볼별 배당 데이터
            total_invested: 총 투자 원금
            holdings_history: 일별 보유 주식수 기록

        Returns:
            배당 통계 딕셔너리
        """
        total_dividends = 0.0
        by_etf = {}
        monthly_data_dict = {}  # {month: {total: 0, by_etf: {}}}

        # 보유 기록이 있는 날짜들 정렬
        sorted_holding_dates = sorted(holdings_history.keys()) if holdings_history else []

        def get_shares_on_date(symbol: str, target_date: date) -> float:
            """특정 날짜에 해당 심볼의 보유 주식수 반환"""
            if not sorted_holding_dates:
                return 0.0

            # 배당일 이전의 가장 가까운 보유 기록 찾기
            closest_date = None
            for d in sorted_holding_dates:
                if d <= target_date:
                    closest_date = d
                else:
                    break

            if closest_date is None:
                return 0.0

            return holdings_history[closest_date].get(symbol, 0.0)

        for item in portfolio:
            symbol = item["symbol"]

            if symbol not in dividend_data or dividend_data[symbol].empty:
                by_etf[symbol] = 0.0
                continue

            df = dividend_data[symbol]
            symbol_total = 0.0

            for div_date, row in df.iterrows():
                # 배당일 기준 보유 주식수 조회
                shares = get_shares_on_date(symbol, div_date)
                div_amount = row['dividend'] * shares
                symbol_total += div_amount
                total_dividends += div_amount

                # 월별 집계
                month = f"{div_date.year}-{div_date.month:02d}"
                if month not in monthly_data_dict:
                    monthly_data_dict[month] = {'total': 0.0, 'by_etf': {}}
                monthly_data_dict[month]['total'] += div_amount
                if symbol not in monthly_data_dict[month]['by_etf']:
                    monthly_data_dict[month]['by_etf'][symbol] = 0.0
                monthly_data_dict[month]['by_etf'][symbol] += div_amount

            by_etf[symbol] = round(symbol_total, 2)

        # 월별 데이터 리스트 변환
        monthly_data = []
        for month in sorted(monthly_data_dict.keys()):
            data = monthly_data_dict[month]
            monthly_data.append({
                'month': month,
                'amount': round(data['total'], 2),
                'by_etf': {k: round(v, 2) for k, v in data['by_etf'].items()}
            })

        # 배당 수익률 계산
        dividend_yield = (total_dividends / total_invested * 100) if total_invested > 0 else 0.0

        # 월평균 계산
        num_months = len(monthly_data) if monthly_data else 1
        monthly_average = total_dividends / num_months if num_months > 0 else 0.0

        return {
            'total_dividends': round(total_dividends, 2),
            'dividend_yield': round(dividend_yield, 4),
            'monthly_average': round(monthly_average, 2),
            'monthly_data': monthly_data,
            'by_etf': by_etf
        }

    def calculate_dividend_stats(
        self,
        portfolio: list[dict],
        dividend_data: dict[str, pd.DataFrame],
        total_invested: float,
        shares_held: dict[str, float]
    ) -> dict:
        """
        배당 통계 계산 (레거시 - 단일 보유주식수 사용)

        Args:
            portfolio: 포트폴리오 구성
            dividend_data: 심볼별 배당 데이터
            total_invested: 총 투자 원금
            shares_held: 심볼별 보유 주식 수

        Returns:
            배당 통계 딕셔너리
        """
        total_dividends = 0.0
        by_etf = {}
        monthly_data_dict = {}  # {month: {total: 0, by_etf: {}}}

        for item in portfolio:
            symbol = item["symbol"]
            shares = shares_held.get(symbol, 0)

            if symbol not in dividend_data or dividend_data[symbol].empty:
                by_etf[symbol] = 0.0
                continue

            df = dividend_data[symbol]
            symbol_total = 0.0

            for div_date, row in df.iterrows():
                div_amount = row['dividend'] * shares
                symbol_total += div_amount
                total_dividends += div_amount

                # 월별 집계
                month = f"{div_date.year}-{div_date.month:02d}"
                if month not in monthly_data_dict:
                    monthly_data_dict[month] = {'total': 0.0, 'by_etf': {}}
                monthly_data_dict[month]['total'] += div_amount
                if symbol not in monthly_data_dict[month]['by_etf']:
                    monthly_data_dict[month]['by_etf'][symbol] = 0.0
                monthly_data_dict[month]['by_etf'][symbol] += div_amount

            by_etf[symbol] = round(symbol_total, 2)

        # 월별 데이터 리스트 변환
        monthly_data = []
        for month in sorted(monthly_data_dict.keys()):
            data = monthly_data_dict[month]
            monthly_data.append({
                'month': month,
                'amount': round(data['total'], 2),
                'by_etf': {k: round(v, 2) for k, v in data['by_etf'].items()}
            })

        # 배당 수익률 계산
        dividend_yield = (total_dividends / total_invested * 100) if total_invested > 0 else 0.0

        # 월평균 계산
        num_months = len(monthly_data) if monthly_data else 1
        monthly_average = total_dividends / num_months if num_months > 0 else 0.0

        return {
            'total_dividends': round(total_dividends, 2),
            'dividend_yield': round(dividend_yield, 4),
            'monthly_average': round(monthly_average, 2),
            'monthly_data': monthly_data,
            'by_etf': by_etf
        }


# 싱글톤 인스턴스
backtest_engine = BacktestEngine()
