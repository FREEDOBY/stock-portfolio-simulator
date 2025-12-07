"""배당 통계 기능 테스트 (TDD - RED Phase)"""
import pytest
import pandas as pd
from datetime import date
from unittest.mock import patch, MagicMock

from app.services.backtest_engine import BacktestEngine


class TestDividendDataFetching:
    """배당 데이터 조회 테스트"""

    def test_get_dividends_returns_dataframe(self):
        """배당 데이터 조회 시 DataFrame 반환"""
        from app.services.data_fetcher import DataFetcher
        fetcher = DataFetcher()

        result = fetcher.get_dividends(
            symbol="SCHD",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31)
        )

        assert isinstance(result, pd.DataFrame)
        # 배당이 있으면 'dividend' 컬럼이 있어야 함
        if not result.empty:
            assert 'dividend' in result.columns

    def test_get_dividends_empty_for_non_dividend_etf(self):
        """배당 없는 ETF는 빈 DataFrame 반환"""
        from app.services.data_fetcher import DataFetcher
        fetcher = DataFetcher()

        # QQQ는 배당이 거의 없거나 매우 적음
        result = fetcher.get_dividends(
            symbol="TQQQ",  # 레버리지 ETF는 배당 없음
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31)
        )

        assert isinstance(result, pd.DataFrame)

    def test_get_dividends_handles_timezone(self):
        """timezone-aware 날짜 처리"""
        from app.services.data_fetcher import DataFetcher
        fetcher = DataFetcher()

        # 이 테스트는 timezone 관련 에러 없이 실행되어야 함
        result = fetcher.get_dividends(
            symbol="VYM",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31)
        )

        assert isinstance(result, pd.DataFrame)


class TestDividendStatsCalculation:
    """배당 통계 계산 테스트"""

    def test_calculate_dividend_stats_basic(self):
        """기본 배당 통계 계산"""
        engine = BacktestEngine()

        # Mock 배당 데이터
        portfolio = [{"symbol": "SCHD", "weight": 1.0}]
        dividend_data = {
            "SCHD": pd.DataFrame({
                'dividend': [0.5, 0.6, 0.55, 0.65]
            }, index=[
                date(2023, 3, 15),
                date(2023, 6, 15),
                date(2023, 9, 15),
                date(2023, 12, 15)
            ])
        }

        stats = engine.calculate_dividend_stats(
            portfolio=portfolio,
            dividend_data=dividend_data,
            total_invested=10000,
            shares_held={"SCHD": 100}
        )

        assert 'total_dividends' in stats
        assert 'dividend_yield' in stats
        assert 'monthly_average' in stats
        assert 'monthly_data' in stats
        assert 'by_etf' in stats

    def test_calculate_dividend_stats_total_amount(self):
        """총 배당금 계산 정확성"""
        engine = BacktestEngine()

        portfolio = [{"symbol": "SCHD", "weight": 1.0}]
        dividend_data = {
            "SCHD": pd.DataFrame({
                'dividend': [0.5, 0.5]  # 주당 $0.5 * 2회
            }, index=[
                date(2023, 3, 15),
                date(2023, 6, 15)
            ])
        }

        stats = engine.calculate_dividend_stats(
            portfolio=portfolio,
            dividend_data=dividend_data,
            total_invested=10000,
            shares_held={"SCHD": 100}  # 100주 보유
        )

        # 총 배당 = 0.5 * 100 + 0.5 * 100 = $100
        assert stats['total_dividends'] == 100.0

    def test_calculate_dividend_stats_yield(self):
        """배당 수익률 계산"""
        engine = BacktestEngine()

        portfolio = [{"symbol": "SCHD", "weight": 1.0}]
        dividend_data = {
            "SCHD": pd.DataFrame({
                'dividend': [1.0]
            }, index=[date(2023, 6, 15)])
        }

        stats = engine.calculate_dividend_stats(
            portfolio=portfolio,
            dividend_data=dividend_data,
            total_invested=10000,  # $10,000 투자
            shares_held={"SCHD": 100}
        )

        # 배당 수익률 = (100 / 10000) * 100 = 1%
        assert abs(stats['dividend_yield'] - 1.0) < 0.01

    def test_calculate_dividend_stats_monthly_data(self):
        """월별 데이터 집계"""
        engine = BacktestEngine()

        portfolio = [{"symbol": "SCHD", "weight": 1.0}]
        dividend_data = {
            "SCHD": pd.DataFrame({
                'dividend': [0.5, 0.6]
            }, index=[
                date(2023, 3, 15),
                date(2023, 6, 15)
            ])
        }

        stats = engine.calculate_dividend_stats(
            portfolio=portfolio,
            dividend_data=dividend_data,
            total_invested=10000,
            shares_held={"SCHD": 100}
        )

        monthly = stats['monthly_data']
        assert len(monthly) >= 2

        # 월별 데이터에 필수 필드 확인
        for m in monthly:
            assert 'month' in m
            assert 'amount' in m
            assert 'by_etf' in m

    def test_calculate_dividend_stats_multiple_etfs(self):
        """복수 ETF 배당 집계"""
        engine = BacktestEngine()

        portfolio = [
            {"symbol": "SCHD", "weight": 0.5},
            {"symbol": "VYM", "weight": 0.5}
        ]
        dividend_data = {
            "SCHD": pd.DataFrame({
                'dividend': [0.5]
            }, index=[date(2023, 3, 15)]),
            "VYM": pd.DataFrame({
                'dividend': [0.3]
            }, index=[date(2023, 3, 20)])
        }

        stats = engine.calculate_dividend_stats(
            portfolio=portfolio,
            dividend_data=dividend_data,
            total_invested=10000,
            shares_held={"SCHD": 50, "VYM": 50}
        )

        # by_etf에 두 ETF 모두 있어야 함
        assert 'SCHD' in stats['by_etf']
        assert 'VYM' in stats['by_etf']

        # 총 배당 = SCHD(0.5*50) + VYM(0.3*50) = 25 + 15 = 40
        assert abs(stats['total_dividends'] - 40.0) < 0.01

    def test_calculate_dividend_stats_empty_dividends(self):
        """배당 없는 경우 처리"""
        engine = BacktestEngine()

        portfolio = [{"symbol": "TQQQ", "weight": 1.0}]
        dividend_data = {
            "TQQQ": pd.DataFrame(columns=['dividend'])  # 빈 DataFrame
        }

        stats = engine.calculate_dividend_stats(
            portfolio=portfolio,
            dividend_data=dividend_data,
            total_invested=10000,
            shares_held={"TQQQ": 100}
        )

        assert stats['total_dividends'] == 0.0
        assert stats['dividend_yield'] == 0.0
        assert stats['monthly_average'] == 0.0


class TestBacktestWithDividends:
    """백테스트 + 배당 통합 테스트"""

    def test_backtest_includes_dividend_stats(self):
        """백테스트 결과에 dividend_stats 포함"""
        engine = BacktestEngine()

        result = engine.run_backtest(
            portfolio=[{"symbol": "SCHD", "weight": 1.0}],
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31),
            initial_amount=10000,
            rebalance="none"
        )

        assert 'dividend_stats' in result
        stats = result['dividend_stats']

        assert 'total_dividends' in stats
        assert 'dividend_yield' in stats
        assert 'monthly_data' in stats

    def test_backtest_dividend_stats_structure(self):
        """dividend_stats 구조 검증"""
        engine = BacktestEngine()

        result = engine.run_backtest(
            portfolio=[{"symbol": "VYM", "weight": 1.0}],
            start_date=date(2023, 1, 1),
            end_date=date(2023, 12, 31),
            initial_amount=10000,
            rebalance="none"
        )

        stats = result['dividend_stats']

        # 필수 필드
        assert isinstance(stats['total_dividends'], (int, float))
        assert isinstance(stats['dividend_yield'], (int, float))
        assert isinstance(stats['monthly_average'], (int, float))
        assert isinstance(stats['monthly_data'], list)
        assert isinstance(stats['by_etf'], dict)

    def test_backtest_dca_dividend_stats(self):
        """적립식 투자 + 배당 통계"""
        engine = BacktestEngine()

        result = engine.run_backtest(
            portfolio=[{"symbol": "SCHD", "weight": 1.0}],
            start_date=date(2023, 1, 1),
            end_date=date(2023, 6, 30),
            initial_amount=10000,
            rebalance="none",
            investment_type="dca",
            dca_settings={"amount": 1000, "frequency": "monthly"}
        )

        assert 'dividend_stats' in result
        # DCA에서도 배당 통계가 정상 계산되어야 함
        assert result['dividend_stats']['total_dividends'] >= 0
