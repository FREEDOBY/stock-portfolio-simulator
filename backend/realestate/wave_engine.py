"""구(區) 단위 부동산 파도(상승·하락 사이클) 진단기.

단지 하나는 하락장에서 월 거래가 0~3건까지 말라 가격 신호가 끊기지만,
구 단위는 최악의 거래절벽(2022-09 송파 33건)에도 지수화 가능한 표본이 남는다.
그래서 파도 판정은 구 지수로 하고, 단지는 매수밴드·급매 감지에만 쓴다.

입력 신호 (매월, 해당 시점까지의 데이터만 사용 — 선견편향 없음):
  - 가격: 구 단위 간이 반복매매지수. 단지·평형별 전체기간 중앙 ㎡당가로 정규화한 뒤
          ① 단지·평형별 월 중앙값 → ② 그 값들의 중앙값(2단계 중앙값) → 3개월 이동중앙값.
          2단계 중앙값인 이유: 신축 단지 일괄신고(2026-09 장지동 180건처럼) 등
          한 단지가 월 표본을 지배해도 지수가 흔들리지 않게 — 단지당 1표.
          정규화 기준은 거래 이력 4년 이상 + 30건 이상인 (단지,평형)만 — 이력이 짧은
          신축은 기준 중앙값이 현재가와 같아 지수를 1.0으로 끌어내리는 왜곡이 있다.
  - 거래량 체제: 최근 3개월 거래량 / 과거 3년 평상시(3개월 합의 중앙값)
          → 동결(<0.45) / 위축(0.45~0.75) / 평시(0.75~1.3) / 과열(>1.3)
  - 기준금리: 6개월 변화 방향 (cycle.BOK_RATE 재사용)

파도 규칙 — 부동산 미시구조를 그대로 반영한 비대칭 판정:
  · 하락파도 진입(고점)은 거래량이 방아쇠: 호가 경직성 때문에 가격은 늦게 깨지므로
    "거래 동결 + 긴축"이면 가격이 신고가권이어도 고점으로 본다.
    (2021-10 송파: 거래 145→47건 붕괴가 가격 붕괴를 4개월 선행)
  · 상승파도 진입(저점 탈출)은 거래량이 검증: 거래 없는 반등(데드캣)은 불인정.
    모멘텀 플러스 + 거래량이 평시의 75% 이상 회복해야 상승 전환.
    (2023-01~02 송파: 85→149→244건 폭발과 함께 지수 반전)
  · 확정도 비대칭: 약세 방향 전환(→고점, →하락)은 1개월이면 반영(조기 경보),
    강세 방향 전환(→상승)은 2개월 연속이어야 확정(휩쏘 방지).

마지막 달 처리: 신고기한(계약 후 30일)이 안 지난 달은 잠정(provisional)으로
표시하되 버리지 않는다 — 구 단위는 절반만 신고돼도 수백 건이라 가격 중앙값은
유효하다. 거래량 체제만 직전 완결월까지로 판단해 신고지연 왜곡을 피한다.
"""

import statistics
from collections import defaultdict
from datetime import date, timedelta

import fetcher
from cycle import BOK_RATE, rate_at

REGIONS = {"11650": "서초구", "11680": "강남구", "11710": "송파구", "11350": "노원구"}
# 파도 판정의 기준 지수는 강남3구(서초·강남·송파) 통합 — 시장의 선행·대표 지표.
# 통합하면 표본이 세 배라 거래절벽에도 월 100건 안팎이 남아 판정이 더 안정적이다.
GN3 = "GN3"
GN3_SGGS = ("11650", "11680", "11710")
GN3_NAME = "강남3구"
MIN_TYPE_DEALS = 30     # 정규화 기준 (단지,평형) 최소 거래수
MIN_KEY_SPAN_Y = 4      # 정규화 기준 (단지,평형) 최소 거래이력 연수
FROZEN = 0.45           # 거래량 동결 임계 (평상시 대비)
RECOVER = 0.75          # 저점 탈출 인정에 필요한 거래량 회복 수준
PHASES = ["상승", "고점", "하락", "저점"]


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


def load_series(sgg=GN3):
    """월별 정규화 지수(원시)와 거래량. (months, raw_idx, vol)
    sgg는 단일 지역코드 또는 GN3(강남3구 통합).

    통합은 거래를 한 풀에 섞지 않고 구별 지수의 동일가중 평균으로 만든다 —
    섞으면 그달 거래 비중이 큰 구 쪽으로 지수가 쏠려(구성효과), 선행 구가
    먼저 깨져도 후행 구 거래가 많으면 신호가 묻힌다."""
    if sgg == GN3:
        series = [load_series(s) for s in GN3_SGGS]
        first = min(s[0][0] for s in series)
        last = max(s[0][-1] for s in series)
        months = _month_seq(first, last)
        raw, vol = {}, {}
        for ym in months:
            vals = [s[1].get(ym) for s in series]
            vals = [v for v in vals if v is not None]
            raw[ym] = sum(vals) / len(vals) if vals else None
            vol[ym] = sum(s[2].get(ym, 0) for s in series)
        return months, raw, vol

    conn = fetcher.get_conn()
    rows = conn.execute(
        """SELECT deal_ymd, apt_nm || '|' || CAST(exclu_ar AS INT),
                  amount / exclu_ar
           FROM deals
           WHERE sgg = ? AND (cdeal_type IS NULL OR cdeal_type != '해제')
             AND exclu_ar > 0""",
        (sgg,),
    ).fetchall()
    conn.close()
    by_key = defaultdict(list)
    for ym, key, ppa in rows:
        by_key[key].append((ym, ppa))
    # 정규화 기준: 거래 30건 이상 + 이력 4년 이상 (단기 이력 신축은 norm≈1 왜곡)
    key_med = {}
    for k, v in by_key.items():
        if len(v) >= MIN_TYPE_DEALS and int(max(ym for ym, _ in v)[:4]) - \
                int(min(ym for ym, _ in v)[:4]) >= MIN_KEY_SPAN_Y:
            key_med[k] = statistics.median(p for _, p in v)
    by_ym_key = defaultdict(lambda: defaultdict(list))
    vol = defaultdict(int)
    for ym, key, ppa in rows:
        vol[ym] += 1
        if key in key_med:
            norm = ppa / key_med[key]
            if 0.35 < norm < 3.0:  # 지분·특수거래 및 극단값 제외
                by_ym_key[ym][key].append(norm)
    months = _month_seq(min(vol), max(vol))
    # 2단계 중앙값: 한 단지가 월 표본을 지배해도 단지당 1표
    raw = {}
    for ym in months:
        per_key = [statistics.median(v) for v in by_ym_key[ym].values()]
        raw[ym] = statistics.median(per_key) if per_key else None
    return months, raw, {ym: vol.get(ym, 0) for ym in months}


def _provisional_months(today=None):
    """신고기한(30일)+수집 여유가 안 지나 표본이 불완전한 달들 (잠정 라벨)."""
    today = today or date.today()
    out = set()
    # 이번 달은 항상 잠정, 지난달도 말일+40일이 안 지났으면 잠정
    out.add(f"{today.year}{today.month:02d}")
    first_this = today.replace(day=1)
    prev_end = first_this - timedelta(days=1)
    if (today - prev_end).days < 40:
        out.add(f"{prev_end.year}{prev_end.month:02d}")
    return out


def compute_waves(sgg=GN3, today=None):
    """매월 파도 판정. 각 행: ym/phase/sub(파도 내 위치)/지표들/provisional."""
    months, raw, vol = load_series(sgg)
    provisional = _provisional_months(today)

    # 표본이 거의 없는 꼬리(월초라 신고 몇 건뿐)는 지수 왜곡이 커서만 제외
    med12 = statistics.median(vol[m] for m in months[-13:-1]) if len(months) > 13 else 0
    while months and vol[months[-1]] < max(10, 0.15 * med12):
        months = months[:-1]

    # 빈 달 전방 채움 → 3개월 이동중앙값 평활
    filled, last = {}, None
    for ym in months:
        if raw[ym] is not None:
            last = raw[ym]
        filled[ym] = last
    smooth = {}
    for i, ym in enumerate(months):
        win = [filled[m] for m in months[max(0, i - 2): i + 1] if filled[m]]
        smooth[ym] = statistics.median(win) if win else None

    out = []
    phase, cand, cand_n = None, None, 0
    for i, ym in enumerate(months):
        if i < 24 or smooth[ym] is None:
            continue
        p = smooth[ym]
        p3, p12 = smooth[months[i - 3]], smooth[months[i - 12]]
        peak24 = max(smooth[m] for m in months[i - 23: i + 1] if smooth[m])
        mom3 = p / p3 - 1 if p3 else 0
        mom12 = p / p12 - 1 if p12 else 0
        dd = p / peak24 - 1
        hiking = rate_at(ym) > rate_at(months[i - 6])

        # 거래량 체제: 잠정 달은 신고 미완으로 과소집계되므로 완결월까지만 사용
        j = i
        while j >= 0 and months[j] in provisional:
            j -= 1
        v3 = sum(vol[m] for m in months[max(0, j - 2): j + 1])
        past = [sum(vol[m] for m in months[k - 2: k + 1])
                for k in range(max(2, j - 35), j)]
        v_base = statistics.median(past) if past else 0
        vr = v3 / v_base if v_base else 1.0

        # ── 파도 판정 ──
        if dd <= -0.07:
            if mom3 > 0.005 and vr >= RECOVER:
                raw_ph = "상승"       # 저점 탈출: 반등 + 거래량 회복 동반
            elif mom3 > -0.01:
                raw_ph = "저점"       # 낙폭 큰 상태에서 하락이 멈춤 (거래 회복 전)
            else:
                raw_ph = "하락"
        elif dd <= -0.03:             # 중간지대: 고점권도 저점권도 아님
            if mom3 < -0.015:
                raw_ph = "하락"
            elif phase in ("하락", "저점"):
                raw_ph = "상승" if (mom3 > 0.005 and vr >= RECOVER) else phase
            else:
                raw_ph = "고점" if mom3 < 0.005 else (phase or "상승")
        else:                         # 고점권 (24개월 고점 -3% 이내)
            if hiking and vr < FROZEN:
                raw_ph = "고점"       # 거래 동결 + 긴축: 가격 신고가여도 고점
            elif mom3 < -0.01:
                raw_ph = "고점"       # 모멘텀 소진
            elif phase in ("하락", "저점") and vr >= RECOVER:
                raw_ph = "상승"       # 전고점 회복 + 거래 동반 = 저점 탈출의 완성
                                      # (거래 없는 신고가 복귀는 소표본 반등일 수 있어 불인정)
            elif mom12 > 0.03 and vr >= 0.6:
                raw_ph = "상승"
            else:
                raw_ph = phase or "상승"

        # ── 확정 (비대칭): 기본 2개월 연속 확인. 단 "거래 동결 + 긴축"이라는
        # 구조 신호가 동반된 약세 전환만 즉시 반영 (조기 경보 — 2021-10 유형).
        # 모멘텀 단독의 월간 출렁임으로는 국면을 바꾸지 않는다 (휩쏘 방지).
        # 같은 방향 후보끼리(예: 고점 대기 → 하락 대기)는 연속성을 승계한다 —
        # 리셋하면 약세 신호가 매달 모양만 바꿔도 전환 확정이 무한히 밀린다.
        def _bearish(p):
            return PHASES.index(p) > PHASES.index(phase) or \
                (phase == "저점" and p == "하락")

        if phase is None:
            phase = raw_ph
        elif raw_ph != phase:
            if _bearish(raw_ph) and hiking and vr < FROZEN:
                phase, cand, cand_n = raw_ph, None, 0
            elif raw_ph == cand or (cand and _bearish(cand) == _bearish(raw_ph)):
                cand, cand_n = raw_ph, cand_n + 1
                if cand_n >= 2:
                    phase, cand, cand_n = raw_ph, None, 0
            else:
                cand, cand_n = raw_ph, 1
        else:
            cand, cand_n = None, 0

        # ── 파도 내 위치 (초입/본파동/말기) ──
        if phase == "상승":
            sub = "초입" if dd < -0.05 else ("말기" if vr < 0.6 or mom3 < 0.01 else "본파동")
        elif phase == "고점":
            sub = "초입" if dd > -0.02 else "말기"
        elif phase == "하락":
            sub = "초입" if dd > -0.10 else ("바닥권" if mom3 > -0.02 else "본하락")
        else:  # 저점
            sub = "탈출 임박" if vr >= 0.6 else "다지기"

        out.append({
            "ym": ym, "phase": phase, "sub": sub,
            "pending": cand,
            "idx": round(p, 3), "mom3": round(mom3 * 100, 1),
            "mom12": round(mom12 * 100, 1), "dd": round(dd * 100, 1),
            "rate": rate_at(ym), "hiking": hiking,
            "vol_ratio": round(vr, 2), "deals": vol[ym],
            "provisional": ym in provisional,
        })
    return out


def phase_position(row):
    """사이클 곡선(0=저점, 0.25=상승, 0.5=고점, 0.75=하락, 1=저점) 위 좌표."""
    ph, sub = row["phase"], row["sub"]
    table = {
        ("상승", "초입"): 0.12, ("상승", "본파동"): 0.27, ("상승", "말기"): 0.40,
        ("고점", "초입"): 0.50, ("고점", "말기"): 0.58,
        ("하락", "초입"): 0.65, ("하락", "본하락"): 0.75, ("하락", "바닥권"): 0.86,
        ("저점", "다지기"): 0.93, ("저점", "탈출 임박"): 0.99,
    }
    return table.get((ph, sub), 0.5)


if __name__ == "__main__":
    import sys
    sgg = sys.argv[1] if len(sys.argv) > 1 else GN3
    for r in compute_waves(sgg):
        mark = " (잠정)" if r["provisional"] else ""
        print(f"{r['ym']} {r['phase']}·{r['sub']}{mark}  dd={r['dd']:+5.1f}%  "
              f"m3={r['mom3']:+5.1f}%  m12={r['mom12']:+5.1f}%  "
              f"vol={r['vol_ratio']:.2f}({r['deals']}건)  rate={r['rate']}"
              + (f"  [{r['pending']} 대기]" if r["pending"] else ""))
