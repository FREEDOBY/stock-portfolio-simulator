"""구 단위 파도 판정기(wave.py) 백테스트.

이미 결과를 아는 과거 구간(앵커)과 판정기 출력을 비교한다. 앵커는 공지의
시장 사실 + 송파구 실측 지수 피벗으로 정의 (backtest_cycle.py와 동일 구간).
한 단계 인접 국면(상승↔고점, 고점↔하락, 하락↔저점, 저점↔상승)은 전환
타이밍 ±2개월 오차에 해당하므로 '인접 허용' 적중률도 함께 본다.
"""

import sys

import wave_engine as wave

ANCHORS = [
    ("200810", "200903", "하락"),   # 금융위기 급락
    ("201006", "201212", "하락"),   # 장기 침체
    ("201302", "201312", "저점"),   # 바닥 다지기 (실측 저점 2013)
    ("201601", "201809", "상승"),   # 대세 상승 1파
    ("201811", "201904", "하락"),   # 9·13 후 조정
    ("201908", "202106", "상승"),   # 대세 상승 2파
    ("202110", "202202", "고점"),   # 거래 동결 속 고점 (가격은 아직 신고가권)
    ("202204", "202211", "하락"),   # 금리 급등기 급락
    ("202301", "202309", "저점"),   # 저점 후 횡보
    ("202405", "202506", "상승"),   # 재상승 (전고점 회복)
]

NEIGHBOR = {
    "상승": {"고점", "저점"}, "고점": {"상승", "하락"},
    "하락": {"고점", "저점"}, "저점": {"하락", "상승"},
}


def run(sgg="11710"):
    rows = {r["ym"]: r for r in wave.compute_waves(sgg)}
    total_hit = total_near = total_n = 0
    flips = 0
    prev = None
    for ym in sorted(rows):
        if prev and rows[ym]["phase"] != prev:
            flips += 1
        prev = rows[ym]["phase"]

    name = wave.GN3_NAME if sgg == wave.GN3 else wave.REGIONS.get(sgg, sgg)
    print(f"=== {name} ===")
    print(f"{'구간':22} {'정답':6} {'적중':10} 판정 분포")
    for a, b, want in ANCHORS:
        got = [rows[ym]["phase"] for ym in rows if a <= ym <= b]
        if not got:
            print(f"{a}~{b:8} {want:6} (데이터 없음)")
            continue
        hit = sum(1 for g in got if g == want)
        near = sum(1 for g in got if g == want or g in NEIGHBOR[want])
        dist = {}
        for g in got:
            dist[g] = dist.get(g, 0) + 1
        total_hit += hit
        total_near += near
        total_n += len(got)
        print(f"{a}~{b:8} {want:6} {hit:>3}/{len(got):<4}     {dist}")
    print(f"\n적중률: {total_hit}/{total_n} = {total_hit/total_n*100:.0f}%"
          f"  (인접 허용 {total_near/total_n*100:.0f}%)"
          f"  · 전체 기간 국면 전환 {flips}회")
    last = rows[max(rows)]
    print(f"현재({last['ym']}{' 잠정' if last['provisional'] else ''}) 판정: "
          f"{last['phase']}·{last['sub']}"
          + (f" [{last['pending']} 전환 대기]" if last["pending"] else "")
          + f"  dd={last['dd']}% m3={last['mom3']}% m12={last['mom12']}%"
          f" vol={last['vol_ratio']} rate={last['rate']}%")


if __name__ == "__main__":
    for sgg in (sys.argv[1:] or [wave.GN3]):
        run(sgg)
        print()
