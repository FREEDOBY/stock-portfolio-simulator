"""시장 베어장 위험 스코어 — 유형별 4축 판정 엔진

베어장은 촉발 원인별로 성격이 달라 단일 지표로 예측 불가.
유형별 축을 분리해 독립 점수화하고, 30년 소급 시계열로 검증한다:

- tightening (긴축형, 1980·2018·2022): 연준 인상 사이클·M2 감속·실질금리
- bubble     (버블형, 2000·2021): 버핏지표 이격·200주선 과열·저변동성 안주
- credit     (신용위기형, 2008): HY 스프레드·은행 대출태도·연체율·커브 사이클
- shock      (쇼크 확인, 1987·2020·2025): 예측 불가 유형 — 예측이 아닌
             이탈 확인 전담 (200일선≈40주선 이탈·낙폭·VIX 스파이크)

설계 원칙:
- 모든 판정은 pd.Series 벡터 연산 — "현재값 = 시계열 마지막 행"으로
  현재 판정과 소급 검증이 같은 코드를 공유 (이중 구현 금지)
- 월별 가용 신호의 max_points 합이 분모. 가용 배점 < 60이면 그 달 축 점수 = None
  (recession_warning의 데이터-없음 희석 문제 회피)
- FRED vintage 미지원 → 소급 검증은 개정 후 데이터 기준 (당시 실시간 재현 아님)
- 40주 SMA ≈ 200일선 근사 (일봉은 5년치뿐이라 소급 불가 → 주봉으로 통일)
"""
import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ── 임계값 (역사 검증 튜닝은 여기만 수정) ──
THRESHOLDS = {
    # 축 1 · 긴축형
    "hike_cycle_bp": 1.0,        # 12개월 내 인상폭 ≥ 1.0%p
    "hike_cycle_bp_24m": 1.5,    # 또는 24개월 내 ≥ 1.5%p (2018형 완만한 사이클)
    "m2_negative": 0.0,          # M2 YoY < 0 → 만점
    "m2_slow": 2.5,              # M2 YoY < 2.5 → 절반
    "real_rate": 0.5,            # FEDFUNDS - CPI YoY ≥ 0.5%p
    "high_rate": 4.0,            # 4%+ 를
    "high_rate_months": 6,       #   6개월 유지
    "qt_drain": 0.0,             # 연준 총자산(WALCL) YoY < 0 (QT 진행 — 2018형)
    "cpi_hot": 4.0,              # CPI YoY ≥ 4% 가
    "cpi_hot_months": 3,         #   3개월 지속 — 연준 대응(인상)이 강제되는 상황을 대응 이전에 선행
                                 #   (2021-06부터 점등해 실제 인상 시작 9개월 선행. 1996 이후
                                 #    발생 구간은 2005-06·2008·2021-23뿐이라 오탐 위험 낮음)
    "cpi_hot": 4.0,              # CPI YoY ≥ 4% 3개월 지속 → 연준 대응 강제 국면 (부분)
    "cpi_very_hot": 6.0,         # CPI YoY ≥ 6% 3개월 지속 → 만점 (1973·2021형 선행)
    # 축 2 · 버블형
    "buffett_ext_hi": 20.0,      # 5년 평균 대비 +20% → 만점
    "buffett_ext_lo": 10.0,      #                +10% → 절반
    "sma200w_hi": 40.0,          # 200주선 이격 +40% → 만점
    "sma200w_lo": 25.0,          #               +25% → 절반
    "vix_complacent": 15.0,      # VIX 12개월 평균 < 15
    "melt_up": 40.0,             # 나스닥 12개월 수익률 ≥ +40%
    # 축 3 · 신용위기형 — 스프레드는 BAA10Y(무디스 Baa - 10Y).
    # BAMLH0A0HYM2(HY)는 ICE 라이선스 축소로 FRED가 최근 3년만 제공해 소급 불가.
    "spread_hi": 4.5,            # BAA10Y ≥ 4.5 → 만점 (2008 피크 6.2, 코로나 4.5)
    "spread_lo": 3.0,            #        ≥ 3.0 → 절반 (2011·2016 수준)
    "spread_widen": 0.4,         # 6개월 저점 대비 +0.4%p 확대 (2007-08 +0.48 사전 포착.
                                 #   확대 단독은 20점=주의라 2011·2015 조정장 오탐은 경고 미달)
    "bank_tight": 15.0,          # DRTSCILM ≥ 15 (2007-10 19.2 포착 — recession_warning의 20보다
                                 #   이른 경계. 베어장 축은 선행 경고가 목적)
    "curve_lookback": 24,        # 역전 해소 판정: 24개월 내 역전 이력
    # 축 4 · 쇼크 확인
    "dd_deep": -20.0,            # 낙폭 ≤ -20% → 만점
    "dd_mid": -10.0,             #      ≤ -10% → 절반
    "vix_spike_max": 30.0,       # 월중 최고 VIX ≥ 30
    "vix_spike_mean": 25.0,      # 월평균 VIX ≥ 25
}

# 검증용 베어장 에피소드 (peak = 고점 월)
BEAR_EPISODES = [
    {"key": "2000_dotcom", "label": "닷컴버블", "peak": "2000-03", "expected": ["bubble", "tightening"]},
    {"key": "2008_gfc", "label": "금융위기", "peak": "2007-10", "expected": ["credit", "tightening"]},
    {"key": "2018_powell", "label": "파월 긴축", "peak": "2018-08", "expected": ["tightening"]},
    {"key": "2020_covid", "label": "코로나", "peak": "2020-02", "expected": ["shock"]},   # 예측축 무점등이 정답
    # 2022: 실제 인상은 고점(2021-11) 이후 시작 → 긴축축은 원리상 사전 점등 불가.
    # 사전 경고는 버블축 담당, 긴축축은 하락 중 확인(2022년 중 100점 도달).
    {"key": "2022_hike", "label": "인플레 긴축", "peak": "2021-11", "expected": ["bubble"]},
    {"key": "2025_tariff", "label": "관세 쇼크", "peak": "2024-12", "expected": ["shock"]},
]

WARN_LEVEL = 35.0    # 경고 임계 (검증 통과 기준)
SHOCK_BREAK = 50.0   # 쇼크축 '이탈' 임계

# 지표 참조 테이블용 에피소드 (검증 대상보다 넓게 — 데이터 커버리지 1996-07 이후 하락장 전부)
REFERENCE_EPISODES = [
    {"key": "1998_ltcm", "label": "LTCM -33%", "peak": "1998-07"},
    {"key": "2000_dotcom", "label": "닷컴 -78%", "peak": "2000-03"},
    {"key": "2008_gfc", "label": "금융위기 -56%", "peak": "2007-10"},
    {"key": "2011_downgrade", "label": "신용강등 -19%", "peak": "2011-05"},
    {"key": "2018_powell", "label": "파월쇼크 -24%", "peak": "2018-08"},
    {"key": "2020_covid", "label": "코로나 -33%", "peak": "2020-02"},
    {"key": "2022_hike", "label": "긴축 -37%", "peak": "2021-11"},
    {"key": "2025_tariff", "label": "관세쇼크 -24%", "peak": "2024-12"},
]

AXIS_META = {
    "tightening": {"label": "긴축형", "desc": "연준 긴축이 유동성을 조이는 유형 (2018·2022)"},
    "bubble": {"label": "버블형", "desc": "밸류에이션·심리 과열이 무너지는 유형 (2000·2021)"},
    "credit": {"label": "신용위기형", "desc": "신용 시스템 균열 — 가장 깊은 유형 (2008)"},
    "shock": {"label": "쇼크 확인", "desc": "예측 불가 유형 — 추세 이탈 확인 전담 (1987·2020·2025)"},
}

LEVEL_COLORS = {"danger": "#ef4444", "warning": "#f97316", "caution": "#f59e0b", "normal": "#10b981"}

# 행동 단계 — 근거: 30년 소급에서 복수 축 동시 경고는 오탐 0,
# 단일 축(대개 버블) 경고는 강세장에서 수년 지속(1993-96·2013-15) → 행동이 아닌 경계
STAGE_INFO = {
    "defense": {"label": "방어", "action": "손절/현금화 검토", "color": "#ef4444",
                "desc": "쇼크축 이탈 — 유형 불문 하락 진행 확인. 긴 하락장에선 초반 -15~25% 시점."},
    "reduce": {"label": "비중 관리", "action": "비중 축소·신규 매수 중단 검토", "color": "#f97316",
               "desc": "예측축 2개 이상 동시 경고 — 1998·2000·2007·2018 전부 이 상태로 고점 통과, 오탐 0회."},
    "watch": {"label": "경계", "action": "신규 매수 신중", "color": "#f59e0b",
              "desc": "단일 축 경고 — 압력 축적 중. 단독 경고는 고점까지 수년 걸릴 수 있음(닷컴 2년, 2013-15는 무사통과)."},
    "normal": {"label": "정상", "action": "계획대로 유지", "color": "#10b981",
               "desc": "전 축 안정."},
}


def _level(score: Optional[float]) -> str:
    if score is None:
        return "normal"
    if score >= 60:
        return "danger"
    if score >= WARN_LEVEL:
        return "warning"
    if score >= 15:
        return "caution"
    return "normal"


class BearMarketRiskEngine:
    """4축 베어장 위험 판정 (벡터화 — 현재 = 시계열 마지막 행)"""

    # ── 프레임 구성 ──

    def build_monthly_frame(self, inputs: dict) -> pd.DataFrame:
        """입력 시리즈 → 월말 정렬 DataFrame. NaN 유지(커버리지 판정용).

        inputs 키(값은 pd.Series 또는 None):
        fedfunds, m2, cpi (월간) / t10y2y, hy, vix (일간) /
        bank, card, ncbcel, gdp (분기) / nasdaq_weekly (주간)
        """
        cols: dict[str, pd.Series] = {}

        def _m(key: str, how: str = "last") -> Optional[pd.Series]:
            s = inputs.get(key)
            if s is None or len(s) == 0:
                return None
            s = s.sort_index()
            r = s.resample("ME")
            return r.mean() if how == "mean" else r.max() if how == "max" else r.last()

        # 월간 (walcl은 주간 → 월말)
        for k in ("fedfunds", "m2", "cpi", "walcl"):
            v = _m(k)
            if v is not None:
                cols[k] = v
        # 일간 → 월말 (baa10y → spread 컬럼)
        for k, col in (("t10y2y", "t10y2y"), ("baa10y", "spread")):
            v = _m(k)
            if v is not None:
                cols[col] = v
        vix_mean, vix_max = _m("vix", "mean"), _m("vix", "max")
        if vix_mean is not None:
            cols["vix"] = vix_mean
            cols["vix_max"] = vix_max
        # 분기 시리즈 (ffill은 union 인덱스 결합 후 일괄 적용)
        for k in ("bank", "ncbcel", "gdp"):
            v = _m(k)
            if v is not None:
                cols[k] = v

        # 카드 연체율: 4분기 연속 상승 플래그는 분기 원시 시리즈에서 계산 후 전파
        # (ffill된 월간 값을 diff하면 0이 되어 오판정)
        card = inputs.get("card")
        if card is not None and len(card) >= 5:
            card = card.sort_index()
            rising = (card.diff() > 0).rolling(4).sum() >= 4
            rising = rising.where(card.diff().rolling(4).count() >= 4)  # 초기 구간 NaN
            cols["card_rising"] = rising.astype(float).resample("ME").last()

        # 나스닥 주봉 → SMA 계산 후 월말
        nq = inputs.get("nasdaq_weekly")
        if nq is not None and len(nq) > 0:
            nq = nq.sort_index()
            cols["nasdaq"] = nq.resample("ME").last()
            cols["nq_sma40w"] = nq.rolling(40).mean().resample("ME").last()
            cols["nq_sma200w"] = nq.rolling(200).mean().resample("ME").last()

        if not cols:
            return pd.DataFrame()

        df = pd.DataFrame(cols)

        # 발표 지연 전파: 시리즈별 끝 시점이 달라 union 인덱스 꼬리가 NaN이 되므로
        # 결합 후에 ffill. 분기 FRED는 '분기 시작월' 라벨(2026-Q1 = 2026-01)이라
        # 분기 3개월 + 발표 지연 ~3개월 = 최대 7개월 전파 필요
        for k, lim in (("fedfunds", 2), ("m2", 2), ("cpi", 2),
                       ("bank", 7), ("ncbcel", 7), ("gdp", 7), ("card_rising", 7)):
            if k in df:
                df[k] = df[k].ffill(limit=lim)

        # 파생 컬럼
        if "m2" in df:
            df["m2_yoy"] = df["m2"].pct_change(12, fill_method=None) * 100
        if "cpi" in df:
            df["cpi_yoy"] = df["cpi"].pct_change(12, fill_method=None) * 100
        if "walcl" in df:
            df["walcl_yoy"] = df["walcl"].pct_change(12, fill_method=None) * 100
        if "ncbcel" in df and "gdp" in df:
            # NCBCEL 백만달러 / GDP 십억달러 → /1000 (macro_service 버핏지표와 동일 산식)
            df["buffett"] = df["ncbcel"] / 1000 / df["gdp"] * 100
            df["buffett_ma5y"] = df["buffett"].rolling(60, min_periods=36).mean()
        return df

    # ── 신호 헬퍼 ──

    @staticmethod
    def _blank(df: pd.DataFrame) -> pd.Series:
        return pd.Series(np.nan, index=df.index, dtype=float)

    def _graded(self, metric: pd.Series, cuts: list[tuple[float, float]], op: str = "ge") -> pd.Series:
        """metric NaN → NaN, 아니면 충족한 최고 컷의 점수 (cuts는 낮은 점수부터)"""
        pts = pd.Series(np.nan, index=metric.index, dtype=float)
        valid = metric.notna()
        pts[valid] = 0.0
        for thr, p in cuts:
            hit = metric >= thr if op == "ge" else metric <= thr
            pts[valid & hit] = p
        return pts

    # ── 축별 판정 (points Series 리스트 + 카드 메타) ──

    def _axis_tightening(self, df: pd.DataFrame) -> list[dict]:
        T = THRESHOLDS
        out = []

        if "fedfunds" in df:
            hike12 = df["fedfunds"] - df["fedfunds"].rolling(12, min_periods=12).min()
            hike24 = df["fedfunds"] - df["fedfunds"].rolling(24, min_periods=12).min()
            hp = self._blank(df)
            valid = hike12.notna()
            hp[valid] = 0.0
            hp[valid & ((hike12 >= T["hike_cycle_bp"]) | (hike24 >= T["hike_cycle_bp_24m"]))] = 30.0
            out.append({
                "key": "hike_cycle", "label": "연준 인상 사이클", "max": 30,
                "points": hp, "value": hike12, "fmt": lambda v: f"12개월 +{v:.2f}%p",
            })
            hold = (df["fedfunds"] >= T["high_rate"]).astype(float).rolling(T["high_rate_months"]).min()
            hold = hold.where(df["fedfunds"].notna())
            out.append({
                "key": "high_rate_hold", "label": "고금리 유지", "max": 15,
                "points": self._graded(hold, [(1.0, 15)]),
                "value": df["fedfunds"], "fmt": lambda v: f"기준금리 {v:.2f}%",
            })
        if "m2_yoy" in df:
            m2p = self._blank(df)
            valid = df["m2_yoy"].notna()
            m2p[valid] = 0.0
            m2p[valid & (df["m2_yoy"] < T["m2_slow"])] = 12.0
            m2p[valid & (df["m2_yoy"] < T["m2_negative"])] = 25.0
            out.append({
                "key": "m2_squeeze", "label": "M2 감속/감소", "max": 25,
                "points": m2p, "value": df["m2_yoy"], "fmt": lambda v: f"M2 YoY {v:+.1f}%",
            })
        if "fedfunds" in df and "cpi_yoy" in df:
            rr = df["fedfunds"] - df["cpi_yoy"]
            out.append({
                "key": "real_rate", "label": "실질금리 플러스", "max": 15,
                "points": self._graded(rr, [(T["real_rate"], 15)]),
                "value": rr, "fmt": lambda v: f"실질금리 {v:+.2f}%p",
            })
        if "cpi_yoy" in df:
            # 물가 자체가 아니라 "연준 대응이 강제되는 상황"의 선행 신호 —
            # 인상 전에 점등해 behind-the-curve 구간(2021)을 커버
            hot = (df["cpi_yoy"] >= T["cpi_hot"]).astype(float).rolling(T["cpi_hot_months"]).min()
            hot = hot.where(df["cpi_yoy"].notna())
            out.append({
                "key": "inflation_pressure", "label": "인플레 압력", "max": 20,
                "points": self._graded(hot, [(1.0, 20)]),
                "value": df["cpi_yoy"], "fmt": lambda v: f"CPI YoY {v:+.1f}%",
            })
        if "walcl_yoy" in df:
            out.append({
                "key": "qt_drain", "label": "연준 자산 축소(QT)", "max": 15,
                "points": self._graded(df["walcl_yoy"], [(T["qt_drain"], 15)], op="le"),
                "value": df["walcl_yoy"], "fmt": lambda v: f"총자산 YoY {v:+.1f}%",
            })
        return out

    def _axis_bubble(self, df: pd.DataFrame) -> list[dict]:
        T = THRESHOLDS
        out = []

        if "buffett" in df:
            ext = (df["buffett"] / df["buffett_ma5y"] - 1) * 100
            out.append({
                "key": "buffett_stretch", "label": "버핏지표 이격", "max": 40,
                "points": self._graded(ext, [(T["buffett_ext_lo"], 20), (T["buffett_ext_hi"], 40)]),
                "value": ext, "fmt": lambda v: f"5년평균 대비 {v:+.1f}%",
            })
        if "nasdaq" in df and "nq_sma200w" in df:
            ext200 = (df["nasdaq"] / df["nq_sma200w"] - 1) * 100
            out.append({
                "key": "sma200w_ext", "label": "200주선 과이격", "max": 30,
                "points": self._graded(ext200, [(T["sma200w_lo"], 15), (T["sma200w_hi"], 30)]),
                "value": ext200, "fmt": lambda v: f"이격 {v:+.1f}%",
            })
        if "vix" in df:
            vix12 = df["vix"].rolling(12, min_periods=12).mean()
            out.append({
                "key": "vix_complacency", "label": "저변동성 안주", "max": 15,
                "points": self._graded(vix12, [(T["vix_complacent"], 15)], op="le"),
                "value": vix12, "fmt": lambda v: f"VIX 12개월 평균 {v:.1f}",
            })
        if "nasdaq" in df:
            ret12 = df["nasdaq"].pct_change(12, fill_method=None) * 100
            out.append({
                "key": "melt_up", "label": "파라볼릭 가속", "max": 15,
                "points": self._graded(ret12, [(T["melt_up"], 15)]),
                "value": ret12, "fmt": lambda v: f"12개월 {v:+.1f}%",
            })
        return out

    def _axis_credit(self, df: pd.DataFrame) -> list[dict]:
        T = THRESHOLDS
        out = []

        if "spread" in df:
            out.append({
                "key": "spread_level", "label": "Baa 스프레드 레벨", "max": 30,
                "points": self._graded(df["spread"], [(T["spread_lo"], 15), (T["spread_hi"], 30)]),
                "value": df["spread"], "fmt": lambda v: f"{v:.2f}%p",
            })
            widen = df["spread"] - df["spread"].rolling(6, min_periods=6).min()
            out.append({
                "key": "spread_widening", "label": "스프레드 확대 전환", "max": 20,
                "points": self._graded(widen, [(T["spread_widen"], 20)]),
                "value": widen, "fmt": lambda v: f"6개월 저점 대비 +{v:.2f}%p",
            })
        if "bank" in df:
            out.append({
                "key": "bank_tightening", "label": "은행 대출태도 강화", "max": 20,
                "points": self._graded(df["bank"], [(T["bank_tight"], 20)]),
                "value": df["bank"], "fmt": lambda v: f"강화 순비율 {v:.1f}%",
            })
        if "card_rising" in df:
            out.append({
                "key": "card_delinq", "label": "카드 연체율 상승", "max": 15,
                "points": self._graded(df["card_rising"], [(1.0, 15)]),
                "value": df["card_rising"], "fmt": lambda v: "4분기 연속 상승" if v >= 1 else "안정",
            })
        if "t10y2y" in df:
            inv_recent = (df["t10y2y"] < 0).astype(float).rolling(
                THRESHOLDS["curve_lookback"], min_periods=1).max().where(df["t10y2y"].notna())
            cp = self._blank(df)
            valid = df["t10y2y"].notna()
            cp[valid] = 0.0
            cp[valid & (df["t10y2y"] < 0)] = 5.0                                # 역전 중
            cp[valid & (df["t10y2y"] > 0) & (inv_recent >= 1)] = 15.0           # 역전 해소 (침체 직전 패턴)
            out.append({
                "key": "curve_cycle", "label": "커브 역전 사이클", "max": 15,
                "points": cp, "value": df["t10y2y"], "fmt": lambda v: f"10Y-2Y {v:+.2f}%p",
            })
        return out

    def _axis_shock(self, df: pd.DataFrame) -> list[dict]:
        T = THRESHOLDS
        out = []

        if "nasdaq" in df and "nq_sma40w" in df:
            below40 = (df["nasdaq"] < df["nq_sma40w"]).astype(float).where(
                df["nasdaq"].notna() & df["nq_sma40w"].notna())
            out.append({
                "key": "below_40w", "label": "40주선(≈200일선) 이탈", "max": 30,
                "points": self._graded(below40, [(1.0, 30)]),
                "value": (df["nasdaq"] / df["nq_sma40w"] - 1) * 100,
                "fmt": lambda v: f"이격 {v:+.1f}%",
            })
        if "nasdaq" in df and "nq_sma200w" in df:
            below200 = (df["nasdaq"] < df["nq_sma200w"]).astype(float).where(
                df["nasdaq"].notna() & df["nq_sma200w"].notna())
            out.append({
                "key": "below_200w", "label": "200주선 이탈", "max": 25,
                "points": self._graded(below200, [(1.0, 25)]),
                "value": (df["nasdaq"] / df["nq_sma200w"] - 1) * 100,
                "fmt": lambda v: f"이격 {v:+.1f}%",
            })
        if "nasdaq" in df:
            dd = (df["nasdaq"] / df["nasdaq"].rolling(12, min_periods=12).max() - 1) * 100
            out.append({
                "key": "drawdown", "label": "고점 대비 낙폭", "max": 30,
                "points": self._graded(dd, [(T["dd_mid"], 15), (T["dd_deep"], 30)], op="le"),
                "value": dd, "fmt": lambda v: f"{v:+.1f}%",
            })
        if "vix_max" in df:
            spike = self._blank(df)
            valid = df["vix_max"].notna()
            spike[valid] = 0.0
            spike[valid & ((df["vix_max"] >= T["vix_spike_max"]) | (df["vix"] >= T["vix_spike_mean"]))] = 15.0
            out.append({
                "key": "vix_spike", "label": "VIX 스파이크", "max": 15,
                "points": spike, "value": df["vix_max"], "fmt": lambda v: f"월중 최고 {v:.1f}",
            })
        return out

    # ── 축 점수 합산 ──

    @staticmethod
    def _axis_score(signals: list[dict], index: pd.Index) -> pd.Series:
        """월별: 가용 신호 max 합이 분모. 가용 배점 < 60 → NaN(판정 보류)"""
        if not signals:
            return pd.Series(np.nan, index=index, dtype=float)
        earned = pd.Series(0.0, index=index)
        avail = pd.Series(0.0, index=index)
        for s in signals:
            pts = s["points"]
            earned = earned.add(pts.fillna(0.0), fill_value=0.0)
            avail = avail.add(pts.notna().astype(float) * s["max"], fill_value=0.0)
        score = earned / avail * 100
        return score.where(avail >= 60)

    @staticmethod
    def _current_signals(signals: list[dict]) -> list[dict]:
        """마지막 행 → 신호 카드 dict"""
        cards = []
        for s in signals:
            pts = s["points"].iloc[-1] if len(s["points"]) else np.nan
            val = s["value"].iloc[-1] if len(s["value"]) else np.nan
            if pd.isna(pts):
                status, detail = "데이터 없음", "-"
                pts_out = None
            else:
                ratio = pts / s["max"]
                status = "점등" if ratio >= 1 else "부분" if ratio > 0 else "정상"
                detail = s["fmt"](val) if pd.notna(val) else "-"
                pts_out = round(float(pts), 1)
            cards.append({
                "key": s["key"], "label": s["label"], "status": status,
                "value": f"{pts_out if pts_out is not None else '-'}/{s['max']}",
                "detail": detail, "points": pts_out, "max_points": s["max"],
            })
        return cards

    # ── 최종 평가 ──

    def evaluate(self, inputs: dict) -> dict:
        df = self.build_monthly_frame(inputs)
        if df.empty:
            return {"available": False}

        axes_signals = {
            "tightening": self._axis_tightening(df),
            "bubble": self._axis_bubble(df),
            "credit": self._axis_credit(df),
            "shock": self._axis_shock(df),
        }

        scores: dict[str, pd.Series] = {}
        axes_out = []
        for key, sigs in axes_signals.items():
            score = self._axis_score(sigs, df.index)
            scores[key] = score
            cur = score.iloc[-1] if len(score) else np.nan
            cur_val = round(float(cur), 1) if pd.notna(cur) else None
            level = _level(cur_val)
            first_valid = score.first_valid_index()
            axis = {
                "key": key,
                "label": AXIS_META[key]["label"],
                "desc": AXIS_META[key]["desc"],
                "score": cur_val,
                "level": level,
                "color": LEVEL_COLORS[level],
                "coverage_from": first_valid.strftime("%Y-%m") if first_valid is not None else None,
                "signals": self._current_signals(sigs),
            }
            if key == "shock":
                s = cur_val if cur_val is not None else 0
                axis["state_label"] = "이탈" if s >= SHOCK_BREAK else "주의" if s >= 20 else "정상"
            axes_out.append(axis)

        # 요약: 예측축(긴축·버블·신용) 중 최고 점수
        predictive = [a for a in axes_out if a["key"] != "shock" and a["score"] is not None]
        if predictive:
            worst = max(predictive, key=lambda a: a["score"])
            lit = [s["label"] for s in worst["signals"] if s["status"] in ("점등", "부분")]
            headline = f"{worst['label']} 축 {worst['score']:.0f}점"
            if lit:
                headline += f" — {' + '.join(lit[:3])}"
            summary = {
                "worst_axis": worst["key"], "worst_score": worst["score"],
                "level": worst["level"], "color": worst["color"], "headline": headline,
            }
        else:
            summary = {"worst_axis": None, "worst_score": None, "level": "normal",
                       "color": LEVEL_COLORS["normal"], "headline": "데이터 부족"}

        # 행동 단계 — 소급 검증 결과가 근거:
        # 복수 축(2+) 동시 경고는 30년간 오탐 0 (전부 하락장 직전/진행 중),
        # 단일 축(대개 버블) 경고는 강세장에서 수년 지속 가능 → 행동 아닌 경계.
        shock_now = next((a["score"] for a in axes_out if a["key"] == "shock"), None) or 0
        warn_cnt = sum(1 for a in predictive if a["score"] >= WARN_LEVEL)
        if shock_now >= SHOCK_BREAK:
            stage = "defense"
        elif warn_cnt >= 2:
            stage = "reduce"
        elif warn_cnt == 1:
            stage = "watch"
        else:
            stage = "normal"
        summary["stage"] = stage
        summary["stage_info"] = STAGE_INFO[stage]

        # 소급 시계열 (모든 축 NaN인 선두 구간 제거) + 월별 행동 단계
        hist_df = pd.DataFrame(scores).round(1)
        hist_df = hist_df.loc[hist_df.notna().any(axis=1)]
        pred_cols = [k for k in ("tightening", "bubble", "credit") if k in hist_df]
        warn_cnt_s = sum((hist_df[k].fillna(0) >= WARN_LEVEL).astype(int) for k in pred_cols)
        shock_s = hist_df["shock"].fillna(0) if "shock" in hist_df else pd.Series(0, index=hist_df.index)
        stage_s = pd.Series(
            np.select(
                [shock_s >= SHOCK_BREAK, warn_cnt_s >= 2, warn_cnt_s >= 1],
                ["defense", "reduce", "watch"], default="normal"),
            index=hist_df.index)
        history = [
            {"date": idx.strftime("%Y-%m"),
             **{k: (float(v) if pd.notna(v) else None) for k, v in row.items()},
             "stage": stage_s[idx]}
            for idx, row in hist_df.iterrows()
        ]

        return {
            "available": True,
            "axes": axes_out,
            "summary": summary,
            "history": history,
            "validation": self.validate_episodes(hist_df),
            "reference": self.episode_reference(axes_signals),
        }

    def episode_reference(self, axes_signals: dict) -> dict:
        """역대 하락장 고점 시점의 지표 실측값 스냅샷 + 현재 값 (한눈 비교용)

        예측축 지표는 고점 당월 값(그 상태로 고점을 통과했는지),
        쇼크축 지표는 고점 후 6개월 내 극단값(하락이 어디까지 갔는지).
        """
        columns = [
            {"key": s["key"], "label": s["label"],
             "axis": axis_key, "axis_label": AXIS_META[axis_key]["label"]}
            for axis_key, sigs in axes_signals.items() for s in sigs
        ]

        def _row_metrics(lookup) -> dict:
            metrics = {}
            for axis_key, sigs in axes_signals.items():
                for s in sigs:
                    v = lookup(axis_key, s)
                    metrics[s["key"]] = s["fmt"](v) if pd.notna(v) else None
            return metrics

        rows = []
        for ep in REFERENCE_EPISODES:
            peak = pd.Period(ep["peak"], freq="M")

            def _at_peak(axis_key: str, s: dict, peak=peak):
                vs = s["value"].copy()
                vs.index = vs.index.to_period("M")
                if axis_key == "shock":
                    win = vs.loc[peak: peak + 6].dropna()
                    if win.empty:
                        return np.nan
                    return win.max() if s["key"] == "vix_spike" else win.min()
                return vs.get(peak, np.nan)

            rows.append({"key": ep["key"], "label": ep["label"], "peak": ep["peak"],
                         "metrics": _row_metrics(_at_peak)})

        rows.append({
            "key": "current", "label": "현재", "peak": None,
            "metrics": _row_metrics(
                lambda _ax, s: s["value"].iloc[-1] if len(s["value"]) else np.nan),
        })
        return {"columns": columns, "rows": rows}

    # ── 소급 검증 ──

    def validate_episodes(self, hist_df: pd.DataFrame) -> list[dict]:
        """각 베어장: 예측축은 peak 직전 12개월 최대 점수, 쇼크축은 peak 후 6개월 최대"""
        out = []
        for ep in BEAR_EPISODES:
            peak = pd.Period(ep["peak"], freq="M").to_timestamp(how="end").normalize()
            pre = hist_df.loc[peak - pd.DateOffset(months=12): peak]
            post = hist_df.loc[peak: peak + pd.DateOffset(months=6)]
            axes = {}
            for col in hist_df.columns:
                window = post if col == "shock" else pre
                mx = window[col].max() if col in window and not window[col].dropna().empty else None
                threshold = SHOCK_BREAK if col == "shock" else WARN_LEVEL
                axes[col] = {
                    "max_score": round(float(mx), 1) if mx is not None and pd.notna(mx) else None,
                    "warned": bool(mx is not None and pd.notna(mx) and mx >= threshold),
                }
            expected_hit = all(axes.get(k, {}).get("warned") for k in ep["expected"])
            out.append({
                "key": ep["key"], "label": ep["label"], "peak": ep["peak"],
                "expected": ep["expected"], "axes": axes, "passed": expected_hit,
            })
        return out


bear_market_risk_engine = BearMarketRiskEngine()
