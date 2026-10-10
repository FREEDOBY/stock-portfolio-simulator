"""실거래 체결 분포 기반 자동 매수밴드.

올훼 수기 밴드의 로직을 규칙화한 것:
  1차 밴드   = 최근 6개월 체결 하위 10~30% — 지금 장에서 노릴 급매 범위
  2차 밴드   = 실효 고점(추격 금지가) 대비 -12% ~ -8% — 파도 엔진의 하락 판정
               임계(-8%)와 일관된 "고점→하락 확정 후" 기준
  추격 금지  = 최근 6개월 상위 10% (실효 고점)
해제·직거래·지분거래(중앙값의 60% 미만)는 제외. 최근 12개월 체결 8건 미만
평형은 신뢰도가 낮아 밴드를 만들지 않는다.
"""

from collections import defaultdict
from datetime import date, timedelta

import fetcher


def _pct(sorted_vals, p):
    """선형 보간 백분위 (p: 0~1)."""
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def _eok(manwon):
    return round(manwon / 10000, 1)


def build(keyword: str, lawd_cd: str):
    """프로필 단지의 자동 매수밴드 — config buy_bands와 같은 스키마."""
    today = date.today()
    d365 = (today - timedelta(days=365)).isoformat()
    d183 = (today - timedelta(days=183)).isoformat()
    d1095 = (today - timedelta(days=1095)).isoformat()   # 희소 단지 폴백용 3년
    conn = fetcher.get_conn()
    try:
        rows = conn.execute(
            """SELECT deal_date, CAST(exclu_ar AS INT), amount FROM deals
               WHERE sgg = ? AND REPLACE(apt_nm, ' ', '') LIKE ?
                 AND (cdeal_type IS NULL OR cdeal_type != '해제')
                 AND (dealing_gbn IS NULL OR dealing_gbn != '직거래')
                 AND exclu_ar > 0 AND deal_date >= ?
               ORDER BY deal_date""",
            (lawd_cd, f"%{keyword.replace(' ', '')}%", d1095)).fetchall()
    finally:
        conn.close()

    by_g = defaultdict(list)
    for d, g, amt in rows:
        by_g[g].append((d, amt))

    bands = {}
    for g, items in sorted(by_g.items()):
        amts_all = sorted(a for _, a in items)
        med = amts_all[len(amts_all) // 2]
        clean = [(dd, a) for dd, a in items if a > med * 0.6]     # 지분거래 제외
        d12 = sorted(a for dd, a in clean if dd >= d365)
        d6 = sorted(a for dd, a in clean if dd >= d183)
        if len(d12) >= 8:
            # 표본 충분: 실제 체결 분포에서 급매 구간(하위 10~30%)을 읽는다
            base = sorted(d6) if len(d6) >= 5 else d12
            avoid = _eok(_pct(base, 0.90))                        # 실효 고점
            band1 = [_eok(_pct(base, 0.10)), _eok(_pct(base, 0.30))]
            note = f"최근 12개월 {len(d12)}건 (6개월 {len(d6)}건) 분포"
        else:
            # 거래 희소: '최근 12건'이 1~3년에 걸쳐 있어 하위 분위가 과거 저가로
            # 끌려간다. 분포 대신 실효 고점 대비 비율(-7%~-3%)로 급매 범위를 잡는다.
            recent = clean[-12:]
            if len(recent) < 6:
                continue
            base = sorted(a for _, a in recent)
            avoid = _eok(_pct(base, 0.90))
            band1 = [round(avoid * 0.93, 1), round(avoid * 0.97, 1)]
            note = (f"거래 희소 — 최근 {len(recent)}건 기준 "
                    f"({recent[0][0][:7]}~{recent[-1][0][:7]}) · 고점 대비 비율로 산정, 참고용")
        # 2차 = 실효 고점 대비 -12% ~ -8% (파도 엔진의 하락 판정 임계 -8%와 일관).
        # 1차가 이미 고점에서 많이 내려와 있으면 1차 바로 아래로 밀되, 한 점으로
        # 뭉개지지 않게 최소 폭(~4.5%)을 보장한다.
        top2 = min(round(avoid * 0.92, 1), round(band1[0] - 0.1, 1))
        bot2 = min(round(avoid * 0.88, 1), round(top2 * 0.955, 1))
        band2 = [bot2, top2]
        bands[str(g)] = {
            "band1": band1, "band2": band2, "avoid": avoid,
            "note": f"자동 생성 — {note}",
        }
    if not bands:
        return None
    return {
        "as_of": today.isoformat(),
        "note": "자동 생성 밴드 — 1차 = 최근 6개월 체결 하위 10~30% (급매 범위) · "
                "2차 = 실효 고점 대비 -12%~-8% (하락 확정 후 기준) · 추격 금지 = 상위 10%",
        "bands": bands,
    }
