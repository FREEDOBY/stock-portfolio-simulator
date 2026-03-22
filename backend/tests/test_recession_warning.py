"""침체 경고 시스템 단위 테스트"""
import pytest
import pandas as pd
import numpy as np

from app.services.recession_warning import RecessionWarningEngine, WarningLevel


@pytest.fixture
def engine():
    return RecessionWarningEngine()


class TestIndividualChecks:
    """개별 지표 체크 테스트"""

    # UT-001: 금리차 역전 감지
    def test_yield_curve_inverted(self, engine):
        t10y2y = pd.Series([-0.5, -0.3, -0.1], index=pd.date_range("2025-01", periods=3, freq="ME"))
        result = engine.check_yield_curve_inversion(t10y2y)
        assert result["triggered"] is True
        assert result["weight"] == 3.0

    # UT-002: 금리차 정상 → 미발동
    def test_yield_curve_normal(self, engine):
        t10y2y = pd.Series([0.5, 0.8, 1.0], index=pd.date_range("2025-01", periods=3, freq="ME"))
        result = engine.check_yield_curve_inversion(t10y2y)
        assert result["triggered"] is False

    # UT-003: 금리차 재양전 (역전 후 양수 전환)
    def test_yield_curve_uninversion(self, engine):
        # 과거 12개월 내 음수 → 현재 양수
        t10y2y = pd.Series(
            [-0.5, -0.3, -0.1, 0.1, 0.3],
            index=pd.date_range("2025-01", periods=5, freq="ME"),
        )
        result = engine.check_yield_curve_uninversion(t10y2y)
        assert result["triggered"] is True

    # UT-004: 은행 대출 기준 강화
    def test_bank_lending_tightening(self, engine):
        drtscilm = pd.Series([10, 25, 45], index=pd.date_range("2025-01", periods=3, freq="ME"))
        result = engine.check_bank_lending(drtscilm)
        assert result["triggered"] is True  # 최근값 45 > 20

    # UT-005: 임시직 감소
    def test_temp_help_declining(self, engine):
        temphelps = pd.Series(
            [3000, 2950, 2900, 2850, 2800, 2750],
            index=pd.date_range("2025-01", periods=6, freq="ME"),
        )
        result = engine.check_temp_employment(temphelps)
        assert result["triggered"] is True

    # UT-006: 임시직 증가 → 미발동
    def test_temp_help_rising(self, engine):
        temphelps = pd.Series(
            [2700, 2750, 2800, 2850, 2900, 2950],
            index=pd.date_range("2025-01", periods=6, freq="ME"),
        )
        result = engine.check_temp_employment(temphelps)
        assert result["triggered"] is False

    # UT-007: 신용카드 연체율 상승
    def test_credit_delinquency_rising(self, engine):
        drcclacbs = pd.Series([2.0, 2.2, 2.5, 2.8], index=pd.date_range("2025-01", periods=4, freq="QE"))
        result = engine.check_credit_delinquency(drcclacbs)
        assert result["triggered"] is True  # 4분기 연속 상승

    # UT-008: CLI 하락
    def test_cli_declining(self, engine):
        result = engine.check_cli_decline(cli_value=99.5, mom=-0.3)
        assert result["triggered"] is True  # CLI < 100 & MoM < 0

    # UT-009: CLI 정상
    def test_cli_normal(self, engine):
        result = engine.check_cli_decline(cli_value=101.0, mom=0.2)
        assert result["triggered"] is False

    # UT-010: HY 스프레드 확대
    def test_hy_spread_widening(self, engine):
        result = engine.check_hy_spread(5.5)
        assert result["triggered"] is True  # > 5%

    # UT-011: Sahm Rule 발동
    def test_sahm_rule_triggered(self, engine):
        result = engine.check_sahm_rule(0.6)
        assert result["triggered"] is True  # >= 0.5

    # UT-012: Sahm Rule 미발동
    def test_sahm_rule_normal(self, engine):
        result = engine.check_sahm_rule(0.2)
        assert result["triggered"] is False


class TestOverallWarning:
    """종합 경고 레벨 테스트"""

    # UT-013: 전체 정상 → Level 0
    def test_all_normal(self, engine):
        checks = [
            {"triggered": False, "weight": 3.0},
            {"triggered": False, "weight": 2.5},
            {"triggered": False, "weight": 2.5},
            {"triggered": False, "weight": 2.0},
            {"triggered": False, "weight": 2.0},
            {"triggered": False, "weight": 1.5},
            {"triggered": False, "weight": 1.5},
            {"triggered": False, "weight": 1.0},
        ]
        score, level = engine.calculate_warning_level(checks)
        assert score == 0.0
        assert level == WarningLevel.NORMAL

    # UT-014: 금리차 역전만 → Level 1 (3.0/16.0 = 18.75%)
    def test_single_warning(self, engine):
        checks = [
            {"triggered": True, "weight": 3.0},  # 금리차
            {"triggered": False, "weight": 2.5},
            {"triggered": False, "weight": 2.5},
            {"triggered": False, "weight": 2.0},
            {"triggered": False, "weight": 2.0},
            {"triggered": False, "weight": 1.5},
            {"triggered": False, "weight": 1.5},
            {"triggered": False, "weight": 1.0},
        ]
        score, level = engine.calculate_warning_level(checks)
        assert abs(score - 18.75) < 0.1
        assert level == WarningLevel.CAUTION

    # UT-015: 금리차+은행+임시직 → Level 2 (8.0/16.0 = 50%)
    def test_multiple_warnings(self, engine):
        checks = [
            {"triggered": True, "weight": 3.0},
            {"triggered": True, "weight": 2.5},
            {"triggered": True, "weight": 2.5},
            {"triggered": False, "weight": 2.0},
            {"triggered": False, "weight": 2.0},
            {"triggered": False, "weight": 1.5},
            {"triggered": False, "weight": 1.5},
            {"triggered": False, "weight": 1.0},
        ]
        score, level = engine.calculate_warning_level(checks)
        assert abs(score - 50.0) < 0.1
        assert level == WarningLevel.WARNING

    # UT-016: 대부분 발동 → Level 3
    def test_critical_level(self, engine):
        checks = [
            {"triggered": True, "weight": 3.0},
            {"triggered": True, "weight": 2.5},
            {"triggered": True, "weight": 2.5},
            {"triggered": True, "weight": 2.0},
            {"triggered": True, "weight": 2.0},
            {"triggered": False, "weight": 1.5},
            {"triggered": False, "weight": 1.5},
            {"triggered": False, "weight": 1.0},
        ]
        score, level = engine.calculate_warning_level(checks)
        assert score >= 60
        assert level == WarningLevel.DANGER

    # UT-017: 빈 체크 → Level 0
    def test_empty_checks(self, engine):
        score, level = engine.calculate_warning_level([])
        assert score == 0.0
        assert level == WarningLevel.NORMAL
