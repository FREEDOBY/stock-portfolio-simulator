"""백테스트 엔진 단위 테스트 (TDD - RED Phase)"""
import pytest
import pandas as pd
import numpy as np
from datetime import date

# 아직 구현되지 않은 모듈 - 테스트 먼저 작성
from app.services.backtest_engine import BacktestEngine


class TestCAGRCalculation:
    """CAGR(연평균 복합 성장률) 계산 테스트"""

    def test_cagr_positive_return(self):
        """양의 수익률 CAGR 계산"""
        # $10,000 -> $20,000 in 5 years = 14.87% CAGR
        engine = BacktestEngine()
        cagr = engine.calculate_cagr(
            initial_value=10000,
            final_value=20000,
            years=5
        )
        assert abs(cagr - 0.1487) < 0.001  # 14.87%

    def test_cagr_negative_return(self):
        """음의 수익률 CAGR 계산"""
        # $10,000 -> $5,000 in 3 years = -20.63% CAGR
        engine = BacktestEngine()
        cagr = engine.calculate_cagr(
            initial_value=10000,
            final_value=5000,
            years=3
        )
        assert abs(cagr - (-0.2063)) < 0.001

    def test_cagr_one_year(self):
        """1년 CAGR = 단순 수익률"""
        engine = BacktestEngine()
        cagr = engine.calculate_cagr(
            initial_value=10000,
            final_value=11000,
            years=1
        )
        assert abs(cagr - 0.10) < 0.001  # 10%


class TestMDDCalculation:
    """MDD(최대 낙폭) 계산 테스트"""

    def test_mdd_simple_drawdown(self):
        """간단한 MDD 계산"""
        engine = BacktestEngine()
        # 100 -> 120 -> 90 -> 110
        # Peak at 120, trough at 90, MDD = (120-90)/120 = 25%
        values = pd.Series([100, 120, 90, 110])
        mdd = engine.calculate_mdd(values)
        assert abs(mdd - 0.25) < 0.001

    def test_mdd_no_drawdown(self):
        """낙폭 없는 경우 (계속 상승)"""
        engine = BacktestEngine()
        values = pd.Series([100, 110, 120, 130])
        mdd = engine.calculate_mdd(values)
        assert mdd == 0.0

    def test_mdd_multiple_drawdowns(self):
        """여러 낙폭 중 최대값"""
        engine = BacktestEngine()
        # 100 -> 150 -> 120 -> 140 -> 100
        # First drawdown: (150-120)/150 = 20%
        # Second drawdown: (140-100)/140 = 28.57%
        values = pd.Series([100, 150, 120, 140, 100])
        mdd = engine.calculate_mdd(values)
        assert abs(mdd - 0.3333) < 0.01  # 최대 낙폭은 150->100 = 33.33%


class TestSharpeRatioCalculation:
    """Sharpe Ratio 계산 테스트"""

    def test_sharpe_ratio_positive(self):
        """양의 Sharpe Ratio"""
        engine = BacktestEngine()
        # 일간 수익률 데이터
        daily_returns = pd.Series([0.01, 0.02, -0.005, 0.015, 0.008] * 50)
        sharpe = engine.calculate_sharpe_ratio(daily_returns, risk_free_rate=0.02)
        assert sharpe > 0

    def test_sharpe_ratio_with_zero_volatility(self):
        """변동성이 0인 경우 (수익률이 일정)"""
        engine = BacktestEngine()
        daily_returns = pd.Series([0.001] * 100)
        sharpe = engine.calculate_sharpe_ratio(daily_returns, risk_free_rate=0.02)
        # 변동성이 거의 0이면 매우 큰 값이 나오거나 특수 처리됨
        # 실제로 의미있는 테스트가 되려면 어느 정도 변동성이 있어야 함
        assert isinstance(sharpe, float)  # 결과가 float인지만 확인


class TestVolatilityCalculation:
    """연간 변동성 계산 테스트"""

    def test_volatility_calculation(self):
        """연간 변동성 계산"""
        engine = BacktestEngine()
        # 일간 수익률 생성 (표준편차 약 1%)
        np.random.seed(42)
        daily_returns = pd.Series(np.random.normal(0.0005, 0.01, 252))
        volatility = engine.calculate_volatility(daily_returns)
        # 연간 변동성 = 일간 표준편차 * sqrt(252)
        expected = daily_returns.std() * np.sqrt(252)
        assert abs(volatility - expected) < 0.001


class TestRebalancing:
    """리밸런싱 로직 테스트"""

    def test_quarterly_rebalance_dates(self):
        """분기별 리밸런싱 날짜 계산"""
        engine = BacktestEngine()
        start = date(2020, 1, 1)
        end = date(2020, 12, 31)
        rebalance_dates = engine.get_rebalance_dates(start, end, "quarterly")
        # 2020년에는 4번의 분기 시작일
        assert len(rebalance_dates) >= 3

    def test_monthly_rebalance_dates(self):
        """월별 리밸런싱 날짜 계산"""
        engine = BacktestEngine()
        start = date(2020, 1, 1)
        end = date(2020, 12, 31)
        rebalance_dates = engine.get_rebalance_dates(start, end, "monthly")
        assert len(rebalance_dates) >= 11

    def test_no_rebalance(self):
        """리밸런싱 없음"""
        engine = BacktestEngine()
        start = date(2020, 1, 1)
        end = date(2020, 12, 31)
        rebalance_dates = engine.get_rebalance_dates(start, end, "none")
        assert len(rebalance_dates) == 0


class TestBacktestExecution:
    """백테스트 실행 통합 테스트"""

    def test_backtest_single_etf(self):
        """단일 ETF 백테스트"""
        engine = BacktestEngine()
        portfolio = [{"symbol": "SPY", "weight": 1.0}]
        result = engine.run_backtest(
            portfolio=portfolio,
            start_date=date(2020, 1, 1),
            end_date=date(2020, 12, 31),
            initial_amount=10000,
            rebalance="none"
        )

        assert "portfolio_values" in result
        assert "metrics" in result
        assert len(result["portfolio_values"]) > 0

    def test_backtest_multiple_etfs(self):
        """복수 ETF 포트폴리오 백테스트"""
        engine = BacktestEngine()
        portfolio = [
            {"symbol": "SPY", "weight": 0.6},
            {"symbol": "QQQ", "weight": 0.4}
        ]
        result = engine.run_backtest(
            portfolio=portfolio,
            start_date=date(2020, 1, 1),
            end_date=date(2020, 12, 31),
            initial_amount=10000,
            rebalance="quarterly"
        )

        assert "portfolio_values" in result
        assert "metrics" in result
        assert "cagr" in result["metrics"]
        assert "mdd" in result["metrics"]
        assert "sharpe_ratio" in result["metrics"]
        assert "volatility" in result["metrics"]

    def test_backtest_includes_benchmarks(self):
        """벤치마크 포함 여부"""
        engine = BacktestEngine()
        portfolio = [{"symbol": "VTI", "weight": 1.0}]
        result = engine.run_backtest(
            portfolio=portfolio,
            start_date=date(2020, 1, 1),
            end_date=date(2020, 12, 31),
            initial_amount=10000,
            rebalance="none"
        )

        assert "benchmarks" in result
        assert "QQQ" in result["benchmarks"]
        assert "SPY" in result["benchmarks"]


class TestEdgeCases:
    """엣지 케이스 테스트"""

    def test_invalid_symbol(self):
        """잘못된 심볼 처리"""
        engine = BacktestEngine()
        portfolio = [{"symbol": "INVALID_SYMBOL_XYZ", "weight": 1.0}]

        with pytest.raises(ValueError):
            engine.run_backtest(
                portfolio=portfolio,
                start_date=date(2020, 1, 1),
                end_date=date(2020, 12, 31),
                initial_amount=10000,
                rebalance="none"
            )

    def test_empty_portfolio(self):
        """빈 포트폴리오"""
        engine = BacktestEngine()

        with pytest.raises(ValueError):
            engine.run_backtest(
                portfolio=[],
                start_date=date(2020, 1, 1),
                end_date=date(2020, 12, 31),
                initial_amount=10000,
                rebalance="none"
            )

    def test_weights_normalization(self):
        """비중 합계가 100%가 아닌 경우 정규화"""
        engine = BacktestEngine()
        portfolio = [
            {"symbol": "SPY", "weight": 0.3},
            {"symbol": "QQQ", "weight": 0.3}
        ]
        # 합계 60% -> 자동 정규화하여 각각 50%로
        normalized = engine.normalize_weights(portfolio)
        assert abs(sum(item["weight"] for item in normalized) - 1.0) < 0.001


class TestDCAInvestedAmounts:
    """DCA(적립식) 투자 시 일별 누적 투자원금 테스트"""

    def test_dca_returns_invested_amounts(self):
        """DCA 모드에서 invested 필드가 응답에 포함되는지 확인"""
        engine = BacktestEngine()
        portfolio = [{"symbol": "SPY", "weight": 1.0}]

        result = engine.run_backtest(
            portfolio=portfolio,
            start_date=date(2023, 1, 1),
            end_date=date(2023, 6, 30),
            initial_amount=10000,
            rebalance="none",
            investment_type="dca",
            dca_settings={"amount": 1000, "frequency": "monthly"}
        )

        # DCA 모드에서는 invested 필드가 있어야 함
        assert "portfolio_values" in result
        assert len(result["portfolio_values"]) > 0

        # 첫 번째 데이터 포인트에 invested 필드 확인
        first_point = result["portfolio_values"][0]
        assert "invested" in first_point
        assert first_point["invested"] == 10000  # 초기 투자금

    def test_dca_invested_amounts_accumulate(self):
        """DCA 투자원금이 누적되는지 확인"""
        engine = BacktestEngine()
        portfolio = [{"symbol": "SPY", "weight": 1.0}]

        result = engine.run_backtest(
            portfolio=portfolio,
            start_date=date(2023, 1, 1),
            end_date=date(2023, 3, 31),
            initial_amount=10000,
            rebalance="none",
            investment_type="dca",
            dca_settings={"amount": 1000, "frequency": "monthly"}
        )

        portfolio_values = result["portfolio_values"]
        invested_values = [pv.get("invested") for pv in portfolio_values if pv.get("invested")]

        # 투자원금은 증가해야 함 (10000 -> 11000 -> 12000 ...)
        assert len(invested_values) > 1
        # 마지막 투자원금 > 첫 투자원금
        assert invested_values[-1] > invested_values[0]

    def test_dca_benchmark_also_has_invested(self):
        """벤치마크도 invested 필드를 가지는지 확인"""
        engine = BacktestEngine()
        portfolio = [{"symbol": "VTI", "weight": 1.0}]

        result = engine.run_backtest(
            portfolio=portfolio,
            start_date=date(2023, 1, 1),
            end_date=date(2023, 3, 31),
            initial_amount=10000,
            rebalance="none",
            investment_type="dca",
            dca_settings={"amount": 1000, "frequency": "monthly"}
        )

        # QQQ 벤치마크에도 invested 필드가 있어야 함
        assert "benchmarks" in result
        assert "QQQ" in result["benchmarks"]

        qqq_first = result["benchmarks"]["QQQ"][0]
        assert "invested" in qqq_first
        assert qqq_first["invested"] == 10000

    def test_lump_sum_no_invested_field(self):
        """거치식 모드에서는 invested 필드가 없어야 함"""
        engine = BacktestEngine()
        portfolio = [{"symbol": "SPY", "weight": 1.0}]

        result = engine.run_backtest(
            portfolio=portfolio,
            start_date=date(2023, 1, 1),
            end_date=date(2023, 3, 31),
            initial_amount=10000,
            rebalance="none",
            investment_type="lump_sum"
        )

        # 거치식에서는 invested 필드가 없어야 함
        first_point = result["portfolio_values"][0]
        assert "invested" not in first_point or first_point.get("invested") is None

    def test_total_invested_matches_last_invested(self):
        """total_invested가 마지막 날짜의 invested와 일치하는지 확인"""
        engine = BacktestEngine()
        portfolio = [{"symbol": "SPY", "weight": 1.0}]

        result = engine.run_backtest(
            portfolio=portfolio,
            start_date=date(2023, 1, 1),
            end_date=date(2023, 6, 30),
            initial_amount=10000,
            rebalance="none",
            investment_type="dca",
            dca_settings={"amount": 1000, "frequency": "monthly"}
        )

        # 마지막 데이터 포인트의 invested와 total_invested가 일치해야 함
        last_invested = result["portfolio_values"][-1].get("invested")
        total_invested = result["total_invested"]

        assert last_invested == total_invested
