"""데이터 기반 사이클 판정기.

매월 말 시점에 그 시점까지의 데이터만 사용해(선견편향 없음) 상승/고점/하락/저점을
판정한다. 입력 신호는 세 가지:
  - 가격: 단지 전체 ㎡당 월 중앙값 (3개월 이동중앙값으로 평활)
  - 거래량: 최근 6개월 거래량 vs 과거 3년 평상시 수준
  - 기준금리: 6개월 변화 방향 (한국은행 공표 이력)

규칙(투명하게 공개):
  dd    = 최근 24개월 고점 대비 낙폭
  mom3  = 3개월 모멘텀, mom12 = 12개월 모멘텀
  하락: 고점 대비 -8% 이상 빠졌고 단기 모멘텀이 아직 음(-)
  저점: 고점 대비 -8% 이상 빠진 상태에서 단기 모멘텀이 돌아섬(+)
  상승: 고점권(-8% 이내)이고 연간·단기 모멘텀 모두 양(+), 긴축+거래급감 아님
  고점: 고점권인데 단기 모멘텀 소진, 또는 금리 인상 전환 + 거래 급감
  전환은 2개월 연속 같은 판정이 나와야 확정(휩쏘 방지).
"""

import statistics
from collections import defaultdict

import fetcher

# 한국은행 기준금리 변경 이력 (변경일 → %)
BOK_RATE = [
    ("200601", 3.75), ("200602", 4.00), ("200608", 4.25), ("200706", 4.50),
    ("200708", 5.00), ("200808", 5.25), ("200810", 4.25), ("200811", 4.00),
    ("200812", 3.00), ("200901", 2.50), ("200902", 2.00), ("201007", 2.25),
    ("201011", 2.50), ("201101", 2.75), ("201103", 3.00), ("201106", 3.25),
    ("201207", 3.00), ("201210", 2.75), ("201305", 2.50), ("201408", 2.25),
    ("201410", 2.00), ("201503", 1.75), ("201506", 1.50), ("201606", 1.25),
    ("201711", 1.50), ("201811", 1.75), ("201907", 1.50), ("201910", 1.25),
    ("202003", 0.75), ("202005", 0.50), ("202108", 0.75), ("202111", 1.00),
    ("202201", 1.25), ("202204", 1.50), ("202205", 1.75), ("202207", 2.25),
    ("202208", 2.50), ("202210", 3.00), ("202211", 3.25), ("202301", 3.50),
    ("202410", 3.25), ("202411", 3.00), ("202502", 2.75), ("202505", 2.50),
    ("202607", 2.75), ("202608", 3.00),
]

PHASES = ["상승", "고점", "하락", "저점"]


def rate_at(ym):
    r = BOK_RATE[0][1]
    for k, v in BOK_RATE:
        if k <= ym:
            r = v
        else:
            break
    return r


def _month_seq(first, last):
    y, m = int(first[:4]), int(first[4:])
    ey, em = int(last[:4]), int(last[4:])
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y}{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def load_series(apt_keyword="올림픽훼밀리"):
    """월별 ㎡당가 중앙값(만원/㎡)과 거래량. 지분거래 등 이상치는 ㎡당가 기준으로 제외."""
    conn = fetcher.get_conn()
    rows = conn.execute(
        """SELECT deal_ymd, CAST(exclu_ar AS INT), amount / exclu_ar FROM deals
           WHERE apt_nm LIKE ? AND cdeal_type != '해제' AND exclu_ar > 0
           ORDER BY deal_ymd""",
        (f"%{apt_keyword}%",),
    ).fetchall()
    conn.close()
    # 평형(타입) 구성이 달라져도 지수가 흔들리지 않게, 각 거래를 해당 타입의
    # 전체기간 중앙 ㎡당가로 나눠 정규화한 뒤(≈1.0) 월 중앙값을 취한다.
    by_type = defaultdict(list)
    for _, g, ppa in rows:
        by_type[g].append(ppa)
    type_med = {g: statistics.median(v) for g, v in by_type.items()}
    by_ym = defaultdict(list)
    raw_cnt = defaultdict(int)
    for ym, g, ppa in rows:
        raw_cnt[ym] += 1
        norm = ppa / type_med[g]
        if norm > 0.35:  # 시세의 1/3 이하는 지분/특수거래로 보고 지수에서 제외
            by_ym[ym].append(norm)
    months = _month_seq(min(raw_cnt), max(raw_cnt))
    price = {ym: (statistics.median(by_ym[ym]) if by_ym.get(ym) else None) for ym in months}
    vol = {ym: raw_cnt.get(ym, 0) for ym in months}
    return months, price, vol


def compute_phases(apt_keyword="올림픽훼밀리"):
    months, price, vol = load_series(apt_keyword)
    # 신고(계약 후 30일) 미완으로 표본이 급감한 꼬리 달은 지수를 왜곡하므로 제외.
    # 직전 12개월 중앙 거래량의 30% 미만이면 아직 믿을 수 없는 달로 본다.
    while len(months) > 24:
        prior = [vol[m] for m in months[-13:-1]]
        med = statistics.median(prior) if prior else 0
        if vol[months[-1]] < max(2, 0.3 * med):
            months = months[:-1]
        else:
            break
    # 빈 달은 직전값 유지 → 3개월 이동중앙값으로 평활
    filled, last = {}, None
    for ym in months:
        if price[ym] is not None:
            last = price[ym]
        filled[ym] = last
    smooth = {}
    for i, ym in enumerate(months):
        window = [filled[m] for m in months[max(0, i - 2): i + 1] if filled[m]]
        smooth[ym] = statistics.median(window) if window else None

    out = []
    phase, cand, cand_n = None, None, 0
    for i, ym in enumerate(months):
        if i < 24 or smooth[ym] is None:
            continue
        p = smooth[ym]
        p3 = smooth[months[i - 3]]
        p12 = smooth[months[i - 12]]
        peak24 = max(smooth[m] for m in months[i - 23: i + 1] if smooth[m])
        mom3 = p / p3 - 1 if p3 else 0
        mom12 = p / p12 - 1 if p12 else 0
        dd = p / peak24 - 1
        hiking = rate_at(ym) > rate_at(months[i - 6])
        vol6 = sum(vol[m] for m in months[i - 5: i + 1])
        past = [sum(vol[m] for m in months[j - 5: j + 1]) for j in range(i - 35, i)]
        vol_ratio = vol6 / statistics.median(past) if past and statistics.median(past) else 1.0

        if dd <= -0.08:
            if mom12 > 0.06 and mom3 > 0.01:
                raw = "상승"          # 저점권을 벗어난 뚜렷한 회복
            elif mom3 > -0.01:
                raw = "저점"          # 낙폭 큰 상태에서 하락이 멈춤
            else:
                raw = "하락"
        elif mom3 < -0.01 or (hiking and vol_ratio < 0.55):
            raw = "고점"
        elif mom12 > 0.02:
            raw = "상승"
        else:
            raw = phase or "상승"

        # 2개월 연속 같은 판정이어야 국면 전환 확정
        if raw == phase:
            cand, cand_n = None, 0
        elif raw == cand:
            cand_n += 1
            if cand_n >= 2 or phase is None:
                phase, cand, cand_n = raw, None, 0
        else:
            cand, cand_n = raw, 1
        out.append({
            "ym": ym, "phase": phase or raw,
            "price": round(p, 1), "mom3": round(mom3 * 100, 1),
            "mom12": round(mom12 * 100, 1), "dd": round(dd * 100, 1),
            "rate": rate_at(ym), "hiking": hiking, "vol_ratio": round(vol_ratio, 2),
        })
    # 확정 전 전환 후보(연속 2개월 대기 중)를 마지막 행에 노출
    if out:
        out[-1]["pending"] = cand
    return out


if __name__ == "__main__":
    for row in compute_phases():
        print(row["ym"], row["phase"], f"dd={row['dd']:+.1f}%",
              f"m3={row['mom3']:+.1f}%", f"m12={row['mom12']:+.1f}%",
              f"rate={row['rate']}", f"vol={row['vol_ratio']}")
