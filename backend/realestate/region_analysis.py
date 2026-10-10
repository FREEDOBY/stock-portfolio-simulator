"""지역 간 풍선효과(선행-후행) 분석.

구별 월간 가격지수를 만들고(평형·단지 구성 변화에 흔들리지 않게 정규화),
상승기·하락기의 전환 시점 순서와 교차상관(lead-lag)을 계산한다.

지수 방법: 각 거래의 ㎡당가를 그 (단지, 평형타입)의 전체기간 중앙값으로 나눠
정규화(≈1.0)한 뒤 월별 중앙값 → 3개월 이동중앙값으로 평활.
같은 단지·평형끼리만 비교하므로 반복매매지수의 간이판에 해당한다.
"""

import statistics
from collections import defaultdict

import fetcher

REGIONS = {"11650": "서초구", "11680": "강남구", "11710": "송파구", "11350": "노원구"}
MIN_TYPE_DEALS = 30   # 정규화 기준으로 삼을 (단지,타입) 최소 거래수


def month_seq(first, last):
    y, m = int(first[:4]), int(first[4:])
    ey, em = int(last[:4]), int(last[4:])
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y}{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def build_index(sgg):
    conn = fetcher.get_conn()
    rows = conn.execute(
        """SELECT deal_ymd, apt_nm || '|' || CAST(exclu_ar AS INT), amount / exclu_ar
           FROM deals
           WHERE sgg = ? AND cdeal_type != '해제' AND exclu_ar > 0""",
        (sgg,),
    ).fetchall()
    conn.close()
    by_key = defaultdict(list)
    for _, key, ppa in rows:
        by_key[key].append(ppa)
    key_med = {k: statistics.median(v) for k, v in by_key.items() if len(v) >= MIN_TYPE_DEALS}
    by_ym = defaultdict(list)
    for ym, key, ppa in rows:
        if key in key_med:
            norm = ppa / key_med[key]
            if 0.35 < norm < 3.0:      # 지분·특수거래 및 극단값 제외
                by_ym[ym].append(norm)
    months = month_seq(min(by_ym), max(by_ym))
    raw = {ym: (statistics.median(by_ym[ym]) if by_ym.get(ym) else None) for ym in months}
    # 빈 달 전방 채움 + 3개월 이동중앙값
    filled, last = {}, None
    for ym in months:
        if raw[ym] is not None:
            last = raw[ym]
        filled[ym] = last
    idx = {}
    for i, ym in enumerate(months):
        win = [filled[m] for m in months[max(0, i - 2): i + 1] if filled[m]]
        idx[ym] = statistics.median(win) if win else None
    n = {ym: len(by_ym.get(ym, [])) for ym in months}
    return months, idx, n


def yoy(idx, months, ym):
    i = months.index(ym)
    if i < 12 or idx[months[i - 12]] in (None, 0) or idx[ym] is None:
        return None
    return (idx[ym] / idx[months[i - 12]] - 1) * 100


def cross_corr(a, b, max_lag=12):
    """a가 b를 몇 개월 선행할 때 월간수익률 상관이 최대인가. 양수 lag = a 선행."""
    ra = [a[i] / a[i - 1] - 1 for i in range(1, len(a)) if a[i] and a[i - 1]]
    rb = [b[i] / b[i - 1] - 1 for i in range(1, len(b)) if b[i] and b[i - 1]]
    m = min(len(ra), len(rb))
    ra, rb = ra[-m:], rb[-m:]
    best = []
    for lag in range(-max_lag, max_lag + 1):
        pairs = [(ra[i], rb[i + lag]) for i in range(m) if 0 <= i + lag < m]
        if len(pairs) < 24:
            continue
        xs, ys = zip(*pairs)
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        cov = sum((x - mx) * (y - my) for x, y in pairs)
        vx = sum((x - mx) ** 2 for x in xs) ** 0.5
        vy = sum((y - my) ** 2 for y in ys) ** 0.5
        if vx and vy:
            best.append((lag, cov / vx / vy))
    return sorted(best, key=lambda t: -t[1])[:3]


def cycle_points(months, idx, a, b):
    """구간 [a,b]에서 지수 고점/저점 시점."""
    seg = [(ym, idx[ym]) for ym in months if a <= ym <= b and idx[ym]]
    hi = max(seg, key=lambda t: t[1])
    lo = min(seg, key=lambda t: t[1])
    return hi, lo


def main():
    data = {}
    for sgg, name in REGIONS.items():
        months, idx, n = build_index(sgg)
        data[sgg] = (months, idx)
        print(f"{name}: {months[0]}~{months[-1]}, 지수화 거래 표본 {sum(1 for v in n.values() if v)}개월")

    common = sorted(set.intersection(*[set(m) for m, _ in data.values()]))

    print("\n=== ① 2021 고점 / 2022-23 저점 시점 (지수 기준) ===")
    for sgg, name in REGIONS.items():
        months, idx = data[sgg]
        hi, _ = cycle_points(months, idx, "202101", "202212")
        _, lo = cycle_points(months, idx, "202201", "202312")
        rec = next((ym for ym in months if ym > lo[0] and idx[ym] and idx[ym] >= hi[1]), None)
        print(f"{name}: 고점 {hi[0]} → 저점 {lo[0]} ({(lo[1]/hi[1]-1)*100:+.1f}%)"
              f" → 전고점 회복 {rec or '미회복'}")

    print("\n=== ② 2016~2021 상승기: 연간 +10% 돌파 시점 ===")
    for sgg, name in REGIONS.items():
        months, idx = data[sgg]
        first = next((ym for ym in months if "201601" <= ym <= "202112"
                      and (y := yoy(idx, months, ym)) is not None and y > 10), None)
        print(f"{name}: {first}")

    print("\n=== ③ 하락 전환: 2021-22에 YoY가 음(-)으로 꺾인 시점 ===")
    for sgg, name in REGIONS.items():
        months, idx = data[sgg]
        first = next((ym for ym in months if "202110" <= ym <= "202312"
                      and (y := yoy(idx, months, ym)) is not None and y < 0), None)
        print(f"{name}: {first}")

    print("\n=== ④ 교차상관 (양수 lag = 앞 지역이 선행) ===")
    pairs = [("11680", "11710"), ("11680", "11350"), ("11710", "11350")]
    for a, b in pairs:
        ma, ia = data[a]
        mb, ib = data[b]
        sa = [ia[ym] for ym in common]
        sb = [ib[ym] for ym in common]
        top = cross_corr(sa, sb)
        print(f"{REGIONS[a]} → {REGIONS[b]}: " +
              ", ".join(f"lag {l:+d}개월 r={r:.2f}" for l, r in top))

    print("\n=== ⑤ 현재(최근월) 연간 상승률 ===")
    for sgg, name in REGIONS.items():
        months, idx = data[sgg]
        lastm = months[-1]
        # 최근월은 신고 미완이라 -1개월 기준
        y1 = yoy(idx, months, months[-2])
        print(f"{name}: {months[-2]} 기준 YoY {y1:+.1f}%")


if __name__ == "__main__":
    main()
