/**
 * 매크로 · 사이클 진단 카드.
 * 사이클 곡선 SVG + 선행지표 집계 + 구 단위 파도 자동판정(타임라인 스트립)
 * + 매물 나우캐스트 + 지표 테이블 + 요약.
 *
 * 파도 판정은 구(區) 지수 기반(wave_engine.py) — 단지 하나는 하락장에서 거래가
 * 말라 신호가 끊기지만 구 단위는 최악의 거래절벽에도 표본이 남는다.
 */

import { useMemo } from 'react';
import type {
  CycleRow, Deal, ListingsResponse, MacroConfig, RegionRow, WaveResponse, WaveRow,
} from '../../lib/realestate/types';
import { PHASE_ORDER, SIGNAL_STYLE, TREND_ARROW, THEME, median } from '../../lib/realestate/utils';

/* 사이클 곡선 (저점→상승→고점→하락→저점), 현재 위치 마커 */
function CycleCurve({ phase, pos, asof }: { phase: string; pos: number; asof: string }) {
  const W = 720, H = 168, L = 16, R = 16;
  const xOf = (t: number) => L + t * (W - L - R);
  const yOf = (t: number) => 88 + 46 * Math.cos(2 * Math.PI * t);
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    pts.push(`${xOf(t).toFixed(1)},${yOf(t).toFixed(1)}`);
  }
  const zones = [
    { t: 0.25, y: yOf(0.25) + 34, name: '상승' },
    { t: 0.5, y: yOf(0.5) - 16, name: '고점' },
    { t: 0.75, y: yOf(0.75) + 34, name: '하락' },
    { t: 0.97, y: yOf(0.97) + 22, name: '저점' },
    { t: 0.03, y: yOf(0.03) + 22, name: '저점' },
  ];
  const p = Math.min(Math.max(pos, 0), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block max-w-[720px]">
      {[0.08, 0.42, 0.58, 0.92].map((t) => (
        <line key={t} x1={xOf(t)} x2={xOf(t)} y1={26} y2={146} stroke={THEME.grid} strokeWidth={1} />
      ))}
      <polyline
        points={pts.join(' ')} fill="none"
        stroke={THEME.muted} strokeWidth={2} strokeLinejoin="round"
      />
      {zones.map((z, i) => (
        <text
          key={i} x={xOf(z.t)} y={z.y} textAnchor="middle"
          style={{
            fontSize: 13,
            fontWeight: z.name === phase ? 700 : 400,
            fill: z.name === phase ? THEME.ink : THEME.muted,
          }}
        >
          {z.name}
        </text>
      ))}
      <circle cx={xOf(p)} cy={yOf(p)} r={7} fill={THEME.accent} stroke={THEME.surface} strokeWidth={2.5} />
      <text
        x={p > 0.82 ? xOf(p) - 14 : xOf(p) + 14} y={yOf(p) - 12}
        textAnchor={p > 0.82 ? 'end' : 'start'}
        style={{ fontSize: 12.5, fontWeight: 700, fill: THEME.accent }}
      >
        현재 위치 ({asof})
      </text>
    </svg>
  );
}

/* 판정 타임라인 스트립 (파도/단지 공용 — ym·phase·dd만 쓴다) */
function PhaseTimeline({ rows }: { rows: { ym: string; phase: string; dd: number }[] }) {
  const W = 720, H = 42;
  const w = W / rows.length;
  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block max-w-[720px]">
        {rows.map((r, i) => (
          <rect
            key={r.ym} x={(i * w).toFixed(2)} y={2}
            width={Math.max(w, 0.6).toFixed(2)} height={18}
            fill={(SIGNAL_STYLE[r.phase] || { dot: '#999' }).dot}
          >
            <title>{`${r.ym.slice(0, 4)}.${r.ym.slice(4)} ${r.phase} (고점대비 ${r.dd}%)`}</title>
          </rect>
        ))}
        {rows.map((r, i) =>
          r.ym.slice(4) === '01' && +r.ym.slice(0, 4) % 2 === 0 ? (
            <text
              key={'t' + r.ym} x={(i * w).toFixed(1)} y={34}
              style={{ fontSize: 9.5, fill: THEME.muted }}
            >
              {r.ym.slice(0, 4)}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex gap-3.5 mt-0.5 text-xs text-slate-300">
        {PHASE_ORDER.map((ph) => (
          <span key={ph} className="inline-flex items-center gap-[5px]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SIGNAL_STYLE[ph].dot }} />
            {ph}
          </span>
        ))}
      </div>
    </div>
  );
}

/* 구 단위 파도 자동 판정: 현재 국면·파도 내 위치 + 타임라인 + 3개 구 비교 */
function WaveStrip({ wave }: { wave: WaveResponse }) {
  const rows = wave.rows;
  const last = rows[rows.length - 1];
  const st = SIGNAL_STYLE[last.phase] || { dot: '#999' };
  return (
    <div className="my-1 mb-3.5">
      <div className="text-[13.5px] font-semibold text-slate-200">
        <span
          className="inline-block w-[9px] h-[9px] rounded-full mr-1.5"
          style={{ background: st.dot }}
        />
        파도 자동 판정 ({wave.primaryName} 지수): {last.phase} · {last.sub}
        {last.pending ? ` (${last.pending} 전환 신호 감지 — 다음 달 지속 시 확정)` : ''}
        {last.provisional ? ' · 최근월 잠정(신고 진행 중)' : ''}
        {' — '}24개월 고점 대비 {last.dd}%,{' '}
        3개월 {last.mom3 > 0 ? '+' : ''}{last.mom3}% · 12개월 {last.mom12 > 0 ? '+' : ''}{last.mom12}%,{' '}
        기준금리 {last.rate}%{last.hiking ? ' (인상 중)' : ''}, 거래수준 {Math.round(last.vol_ratio * 100)}%
      </div>
      <PhaseTimeline rows={rows} />
      {wave.regions.length > 1 && (
        <div className="text-xs text-slate-300 mt-1.5">
          지역 비교 (서초·강남 선행 → 송파 → 노원 후행):{' '}
          {['11650', '11680', '11710', '11350']
            .map((sgg) => wave.regions.find((r) => r.sgg === sgg))
            .filter((r) => !!r)
            .map((r, i) => (
              <span key={r!.sgg}>
                {i > 0 && ' · '}
                <b className="text-slate-200">{r!.name.slice(0, 2)}</b> {r!.phase}·{r!.sub}
                {r!.pending ? ` [${r!.pending} 대기]` : ''}
              </span>
            ))}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-1.5">
        기준 지수 = 서초·강남·송파 구별 지수(단지·평형별 정규화 ㎡당가의 2단계 중앙값)의
        동일가중 평균 — 한 단지 일괄신고나 구별 거래 비중 변화에 왜곡 없음 ·
        하락파도 진입은 거래 동결+긴축이 방아쇠(가격보다 3~6개월 선행), 저점 탈출은 거래량
        회복(평시 75%+)이 동반돼야 인정 — 하락장 거래절벽에도 구 단위면 표본이 남아 판정이
        끊기지 않음. 검증: 2008~2026 매월 선견편향 없이 소급, 적중 75% (인접 국면 허용 96%)
        · 2022 하락 8/8 · 2024~25 재상승 14/14. 규칙·성적: wave_engine.py / backtest_wave.py
      </p>
    </div>
  );
}

/* (구버전 폴백) 단지 가격 모델 판정 — 파도 API 실패 시에만 표시 */
function ModelStrip({ rows }: { rows: CycleRow[] }) {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const st = SIGNAL_STYLE[last.phase] || { dot: '#999' };
  return (
    <div className="my-1 mb-3.5">
      <div className="text-[13.5px] font-semibold text-slate-200">
        <span
          className="inline-block w-[9px] h-[9px] rounded-full mr-1.5"
          style={{ background: st.dot }}
        />
        모델 자동 판정(단지): {last.phase}
        {last.pending ? ` (${last.pending} 전환 신호 감지 — 다음 달 지속 시 확정)` : ''}
        {' — '}24개월 고점 대비 {last.dd}%,{' '}
        3개월 {last.mom3 > 0 ? '+' : ''}{last.mom3}% · 12개월 {last.mom12 > 0 ? '+' : ''}{last.mom12}%,{' '}
        기준금리 {last.rate}%{last.hiking ? ' (인상 중)' : ''}, 거래수준 {Math.round(last.vol_ratio * 100)}%
      </div>
      <PhaseTimeline rows={rows} />
    </div>
  );
}

/* 매물 나우캐스트: 평형별 최저호가 vs 최근 실거래 — 호가가 실거래 밑으로 오면 꺾임 신호 */
function ListingNowcast({ listings, deals }: { listings: ListingsResponse; deals: Deal[] }) {
  const gaps = useMemo(() => {
    if (!listings.types) return [];
    const out: { g: string; gap: number; ask: number; recent: number }[] = [];
    for (const [g, stat] of Object.entries(listings.types)) {
      const done = deals
        .filter((d) => Math.floor(d.ar) === +g && d.cdeal !== '해제')
        .slice(-3)
        .map((d) => d.amt / 10000);
      if (done.length < 2 || !stat.min) continue;
      const recent = median(done);
      out.push({ g, gap: (stat.min / recent - 1) * 100, ask: stat.min, recent });
    }
    return out.sort((a, b) => +a.g - +b.g);
  }, [listings, deals]);
  if (!gaps.length) return null;
  return (
    <div className="text-xs text-slate-300 mb-3">
      <b className="text-slate-200">매물 나우캐스트</b> — 최저호가 vs 최근 실거래(2~3건 중앙값):{' '}
      {gaps.map((x, i) => (
        <span key={x.g} className="whitespace-nowrap">
          {i > 0 && ' · '}
          {x.g}㎡{' '}
          <b style={{ color: x.gap < 0 ? THEME.down : x.gap < 2 ? THEME.ink : THEME.up }}>
            {x.gap > 0 ? '+' : ''}{x.gap.toFixed(1)}%
          </b>
        </span>
      ))}
      <span className="text-slate-400">
        {' '}— 최저호가가 실거래 아래(-)로 내려오면 매도자 항복 = 꺾임 신호, 위(+)에 떠 있으면
        아직 버티는 중. 매물 적체·호가인하 추세는 히스토리 수집 2~3주 후 추가 예정.
      </span>
    </div>
  );
}

interface Props {
  macro: MacroConfig | null;
  cycleRows: CycleRow[];
  wave: WaveResponse | null;
  regions: RegionRow[] | null;
  listings: ListingsResponse | null;
  deals: Deal[];
}

export function MacroCard({ macro, cycleRows, wave, regions, listings, deals }: Props) {
  if (!macro) return null;

  /* 곡선 위 현재 위치: 파도 엔진 판정 우선, 없으면 config 수기값 */
  const waveLast: WaveRow | null = wave?.rows.length ? wave.rows[wave.rows.length - 1] : null;
  const curvePhase = waveLast?.phase ?? macro.phase;
  const curvePos = waveLast?.pos ?? macro.phase_pos ?? 0.5;
  const curveAsof = waveLast
    ? `${waveLast.ym.slice(0, 4)}.${waveLast.ym.slice(4)}${waveLast.provisional ? ' 잠정' : ''}`
    : macro.as_of.slice(0, 7);

  /* 지표 신호 집계 */
  const tally: Record<string, number> = {};
  (macro.indicators || []).forEach((i) => { tally[i.signal] = (tally[i.signal] || 0) + 1; });
  const lead = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const leadStyle = lead.length ? SIGNAL_STYLE[lead[0][0]] : null;

  const lines = Array.isArray(macro.summary) ? macro.summary : [macro.summary];
  const th = 'text-left px-2.5 py-1.5 border-b border-gray-800 font-medium whitespace-nowrap';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-[18px] mt-4">
      <h2 className="text-[15px] font-semibold mb-1 text-slate-100">매크로 · 사이클 진단</h2>
      <p className="text-xs text-slate-400 mb-3">
        파도 판정·가격·거래량·지역확산 = DB 실시간 계산 (갱신 버튼/자동 갱신) ·
        금리·M2 문구 = 수기 (기준일 {macro.as_of}, backend/realestate/config.json에서 수정)
      </p>

      <div className="max-w-[720px]">
        <CycleCurve phase={curvePhase} pos={curvePos} asof={curveAsof} />
      </div>

      {lead.length > 0 && (
        <div className="text-[13.5px] font-semibold mb-1.5 text-slate-200">
          <span
            className="inline-block w-[9px] h-[9px] rounded-full mr-1.5"
            style={{ background: leadStyle?.dot }}
          />
          선행지표 신호 집계: {lead.map(([k, n]) => `${k} ${n}`).join(' · ')} → 종합 판정
          &quot;{macro.phase}&quot; (아래 파도 모델은 실거래 데이터로 뒤따라 확인)
        </div>
      )}

      {wave ? <WaveStrip wave={wave} /> : <ModelStrip rows={cycleRows} />}

      {listings?.ok && <ListingNowcast listings={listings} deals={deals} />}

      <div className="overflow-x-auto mt-1.5">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-slate-400">
              <th className={th}>지표</th>
              <th className={th}>현황</th>
              <th className={th}>신호</th>
              <th className={th}>비고</th>
            </tr>
          </thead>
          <tbody>
            {(macro.indicators || []).map((ind) => {
              let value = ind.value;
              // 지역 확산 지표는 DB에서 계산한 실시간 값으로 대체
              if (regions && regions.length && ind.name.includes('지역 확산')) {
                value =
                  regions
                    .map((r) => `${r.name.slice(0, 2)} YoY ${r.yoy != null && r.yoy > 0 ? '+' : ''}${r.yoy}%`)
                    .join(' · ') +
                  ` (${regions[0].asof.slice(0, 4)}.${regions[0].asof.slice(4)} 기준 자동)`;
              }
              const st = SIGNAL_STYLE[ind.signal] || { dot: THEME.muted, txt: ind.signal };
              return (
                <tr key={ind.name}>
                  <td className="px-2.5 py-1.5 border-b border-gray-800 font-semibold whitespace-nowrap">
                    {ind.name} {TREND_ARROW[ind.trend] || ''}
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-gray-800">{value}</td>
                  <td className="px-2.5 py-1.5 border-b border-gray-800">
                    <span className="inline-flex items-center gap-[5px] whitespace-nowrap font-semibold">
                      <span className="w-2 h-2 rounded-full" style={{ background: st.dot }} />
                      {st.txt}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 border-b border-gray-800 text-slate-400 min-w-[220px]">
                    {ind.note || ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3.5 text-[13.5px] leading-[1.65] text-slate-300">
        {lines.map((line, i) => {
          // "결론 —", "완충 —" 처럼 대시 앞 라벨은 굵게
          const cut = line.indexOf('—');
          if (cut > 0 && cut < 14) {
            return (
              <div key={i} className="mb-[7px]">
                <b className="text-slate-100">{line.slice(0, cut + 1)}</b>
                {line.slice(cut + 1)}
              </div>
            );
          }
          return <div key={i} className="mb-[7px]">{line}</div>;
        })}
      </div>
    </div>
  );
}
