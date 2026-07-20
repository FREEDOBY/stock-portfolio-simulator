/** 나스닥 저점 판정기 (사이드바 전용 페이지)
 *
 * 코스피 저점과 동일 구조 — 파라볼릭 되돌림 + 낙폭 밴드 + 역대 약세장(차트 오버레이 + 표).
 * 한국 전용(수급/신용/반대매매)은 없음. '-20% 돌파 = CASE 2' 트리거 강조.
 * 반도체 레짐(피크·CASE1 / 하강·CASE2)이 되돌림 밴드(비리세션 vs 리세션)를 분기.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchNasdaqBottom } from '../../api/macro';
import { MacroLineChart } from './charts/MacroLineChart';
import { InfoTip } from './charts/InfoTip';
import type { CrisisOverlay } from './charts/crisisOverlayConfig';
import type { NasdaqBottomData } from '../../types/macro';

// 전체이력(1971~) 차트용 — 역대 나스닥 약세장 (리포트 표 기반)
const NASDAQ_BEAR_OVERLAYS: CrisisOverlay[] = [
  { start: '1973-01-01', end: '1974-10-31', label: '오일쇼크 -60%', type: 'recession' },
  { start: '1987-08-01', end: '1987-10-31', label: '블랙먼데이 -36%', type: 'correction' },
  { start: '1990-07-01', end: '1990-10-31', label: '걸프전 -31%', type: 'recession' },
  { start: '1998-07-01', end: '1998-10-31', label: 'LTCM -33%', type: 'correction' },
  { start: '2000-03-01', end: '2002-10-31', label: '닷컴 -78%', type: 'recession' },
  { start: '2007-10-01', end: '2009-03-31', label: '금융위기 -56%', type: 'recession' },
  { start: '2011-05-01', end: '2011-10-31', label: '신용강등 -19%', type: 'correction' },
  { start: '2018-08-01', end: '2018-12-31', label: '파월쇼크 -24%', type: 'correction' },
  { start: '2020-02-01', end: '2020-03-31', label: '코로나 -33%', type: 'recession' },
  { start: '2021-11-01', end: '2022-10-31', label: '긴축 -37%', type: 'correction' },
  { start: '2024-12-01', end: '2025-04-30', label: '관세쇼크 -24%', type: 'correction' },
  { start: '2026-06-01', end: '2026-07-31', label: '현재 -8%', type: 'correction' },
];

function shiftMonths(dateStr: string, m: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + m);
  return d.toISOString().substring(0, 10);
}

// 도달 Fib 레벨별 색 (깊을수록 위험색)
const FIB_COLOR: Record<string, string> = {
  '>100%': '#a78bfa', '61.8%': '#ef4444', '50%': '#f97316', '38.2%': '#f59e0b',
};

type BearRow = { period: string; high: string; low: string; drop: number; dur: string; current?: boolean };
const NASDAQ_RECESSION: BearRow[] = [
  { period: '오일쇼크 73~74', high: '137 (73.1)', low: '54 (74.10)', drop: -60, dur: '1년 9개월' },
  { period: '걸프전 침체 90', high: '470 (90.7)', low: '323 (90.10)', drop: -31, dur: '3개월' },
  { period: '닷컴붕괴 00~02', high: '5,048 (00.3)', low: '1,114 (02.10)', drop: -78, dur: '2년 7개월' },
  { period: '금융위기 07~09', high: '2,861 (07.10)', low: '1,268 (09.3)', drop: -56, dur: '1년 5개월' },
  { period: '코로나 20', high: '9,838 (20.2)', low: '6,631 (20.3)', drop: -33, dur: '1개월' },
];
const NASDAQ_NON_RECESSION: BearRow[] = [
  { period: '블랙먼데이 87', high: '456 (87.8)', low: '288 (87.10)', drop: -36, dur: '2개월' },
  { period: 'LTCM 98', high: '2,028 (98.7)', low: '1,357 (98.10)', drop: -33, dur: '3개월' },
  { period: '미국 신용강등 11', high: '2,887 (11.5)', low: '2,335 (11.10)', drop: -19, dur: '5개월' },
  { period: '파월쇼크 18', high: '8,133 (18.8)', low: '6,190 (18.12)', drop: -24, dur: '4개월' },
  { period: '긴축 베어장 21~22', high: '16,212 (21.11)', low: '10,213 (22.10)', drop: -37, dur: '11개월' },
  { period: '관세쇼크 25', high: '20,174 (24.12)', low: '~15,300 (25.4)', drop: -24, dur: '4개월' },
];

/** 배너와 동일한 라이브 데이터로 '현재' 행 생성 (하드코딩 대신 실데이터 연동) */
function buildCurrentRow(data: NasdaqBottomData): BearRow | null {
  const peak = data.peak;
  const cur = data.current;
  const dd = data.drawdown_pct;
  if (!peak || cur == null || dd == null) return null;
  const ym = (s?: string) => (s ? `${s.slice(2, 4)}.${Number(s.slice(5, 7))}` : '');
  let dur = '진행형';
  if (peak.date) {
    const months = Math.max(0, Math.round((Date.now() - new Date(peak.date).getTime()) / (1000 * 60 * 60 * 24 * 30)));
    dur = months >= 1 ? `${months}개월 (진행형)` : '1개월내 (진행형)';
  }
  return {
    period: `현재 ${ym(peak.date)}~`,
    high: `${peak.value.toLocaleString()} (${ym(peak.date)})`,
    low: `${cur.toLocaleString()} (진행형)`,
    drop: dd,
    dur,
    current: true,
  };
}

export function NasdaqBottomPage() {
  const [data, setData] = useState<NasdaqBottomData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchNasdaqBottom());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NASDAQ data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 역대 파라볼릭 이벤트 선택 (전체이력 차트 줌인)
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const events = data?.parabolic_events ?? [];
  const fullPrice = useMemo(() => data?.price_full ?? [], [data]);
  const selEv = selectedEvent !== null ? events[selectedEvent] : null;

  // 선택 이벤트 구간 → Brush 줌 범위 (base 6개월 전 ~ 저점 12개월 후)
  const eventRange = useMemo<[number, number] | null>(() => {
    if (!selEv || fullPrice.length === 0) return null;
    const from = shiftMonths(selEv.base_date, -6);
    const to = shiftMonths(selEv.bottom_date, 12);
    let start = fullPrice.findIndex((p) => p.date >= from);
    if (start < 0) start = 0;
    let end = fullPrice.length - 1;
    for (let i = fullPrice.length - 1; i >= 0; i--) {
      if (fullPrice[i].date <= to) { end = i; break; }
    }
    return start < end ? [start, end] : null;
  }, [selEv, fullPrice]);

  // A섹션 기본 뷰 = 현재 이벤트 구간 (base 3개월 전 ~ 현재) — Brush로 5년 전체 확장 가능
  const currentRange = useMemo<[number, number] | null>(() => {
    const price = data?.price ?? [];
    const baseDate = data?.base?.date;
    if (price.length < 2 || !baseDate) return null;
    const from = shiftMonths(baseDate, -3);
    let start = price.findIndex((p) => p.date >= from);
    if (start < 0) start = 0;
    return start < price.length - 1 ? [start, price.length - 1] : null;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm font-mono text-slate-500">Loading NASDAQ bottom...</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[#111827] border border-red-500/30 rounded-lg p-6 text-center">
        <p className="text-sm font-mono text-red-400">[ERROR] {error}</p>
      </div>
    );
  }
  if (!data?.available || !data.retracement || !data.bands || !data.band_target) {
    return (
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-6 text-center">
        <p className="text-sm font-mono text-slate-500">NASDAQ 데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  const { retracement, bands, band_target, regime } = data;
  const dd = data.drawdown_pct ?? 0;

  const series = [
    { dataKey: 'value', color: regime?.color || '#06b6d4', name: 'NASDAQ' },
    { dataKey: 'sma50', color: '#10b981', name: '50일', strokeDasharray: '4 2' },
    { dataKey: 'sma120', color: '#3b82f6', name: '120일', strokeDasharray: '4 2' },
    { dataKey: 'sma200', color: '#ec4899', name: '200일', strokeDasharray: '4 2' },
  ];
  const referenceLines = [
    { y: retracement.fib382, color: '#f59e0b', label: '38.2%' },
    { y: retracement.fib50, color: '#f97316', label: '50%' },
    { y: retracement.fib618, color: '#ef4444', label: '61.8%' },
    { y: data.current ?? 0, color: '#06b6d4', label: '현재' },
  ];

  // 낙폭 밴드 게이지 (0 ~ -80%, 나스닥은 리세션 -78%까지)
  const GAUGE_MIN = -80;
  const pct = (v: number) => `${(Math.min(0, Math.max(GAUGE_MIN, v)) / GAUGE_MIN) * 100}%`;
  const bandLo = bands.applied === 'non_recession' ? bands.non_recession.low : bands.recession.low;
  const bandHi = bands.applied === 'non_recession' ? bands.non_recession.high : bands.recession.high;

  const curRow = buildCurrentRow(data);
  const groups = [
    {
      title: '리세션 없음 (-19~-37%)',
      rows: bands.applied === 'non_recession' && curRow ? [...NASDAQ_NON_RECESSION, curRow] : NASDAQ_NON_RECESSION,
      active: bands.applied === 'non_recession',
    },
    {
      title: '리세션 동반 (-31~-78%)',
      rows: bands.applied === 'recession' && curRow ? [...NASDAQ_RECESSION, curRow] : NASDAQ_RECESSION,
      active: bands.applied === 'recession',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* 판정 배너 */}
      <div className="bg-[#111827] border rounded-lg p-5" style={{ borderColor: (data.verdict_color || '#64748b') + '50' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: data.verdict_color }} />
            <div>
              <div className="text-xs font-mono text-slate-500 uppercase tracking-wider">NASDAQ Bottom Verdict</div>
              <div className="text-2xl font-mono font-bold" style={{ color: data.verdict_color }}>{data.verdict}</div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-center">
            <div>
              <div className="text-xs font-mono text-slate-600">현재 낙폭</div>
              <div className="text-2xl font-mono font-bold text-slate-200">{dd.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-xs font-mono text-slate-600">되돌림</div>
              <div className="text-2xl font-mono font-bold text-slate-200">{data.retracement_pct ?? '–'}%</div>
            </div>
            <div>
              <div className="text-xs font-mono text-slate-600">반도체 레짐</div>
              <div className="text-sm font-mono font-bold" style={{ color: regime?.color }}>{regime?.name}</div>
            </div>
          </div>
        </div>
        {/* CASE 2 트리거 */}
        <div className="mt-3 text-xs font-mono px-3 py-1.5 rounded"
          style={{
            color: data.breach20 ? '#ef4444' : '#64748b',
            backgroundColor: data.breach20 ? '#ef444415' : '#0a0e17',
            border: `1px solid ${data.breach20 ? '#ef444440' : '#1e293b'}`,
          }}>
          {data.breach20
            ? '⚠ 나스닥 -20% 돌파 → 코스피 CASE 2(감익 사이클) 확률 급등'
            : '나스닥 -20% 미돌파 = 아직 조정. -20% 넘으면 CASE 2 확률 급등 (한국 국지 쇼크 → 글로벌 전환 신호)'}
        </div>
      </div>

      {/* A. 파라볼릭 되돌림 차트 */}
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-mono font-bold text-cyan-400">A.</span>
          <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">파라볼릭 되돌림</h3>
          <InfoTip text="나스닥 주봉 5년 창에서 peak(최고점)와 base(peak 직전 마지막 ≥15% 조정의 저점 = 마지막 가속 상승의 출발점, 코스피와 동일 규칙)를 잡아 피보나치 되돌림 레벨을 계산합니다. 배너의 '되돌림 %' = 상승분 반납 비율. 주봉 종가 기준이라 base가 일중 저점보다 약간 높을 수 있습니다(오차 ~2%). 기본 뷰는 현재 이벤트 구간, 하단 바로 5년 전체 확대 가능." />
          <span className="text-xs font-mono text-slate-600 ml-auto">
            peak {retracement.peak.toLocaleString()} · base {retracement.base.toLocaleString()} ({data.base?.date}) · 하단 바 = 5년 전체
          </span>
        </div>
        <MacroLineChart
          data={data.price || []}
          series={series}
          referenceLines={referenceLines}
          height={300}
          yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          yDomain={['auto', 'auto']}
          brush
          brushRange={currentRange}
        />
        {/* RSI(14) 주봉 서브차트 — A차트 기본 확대 구간에 맞춰 슬라이스 */}
        <div className="mt-1">
          <div className="text-xs font-mono text-slate-500 mb-1">RSI(14) · 일봉 — 70 과매수 / 30 과매도</div>
          <MacroLineChart
            data={currentRange ? (data.price || []).slice(currentRange[0], currentRange[1] + 1) : (data.price || [])}
            series={[{ dataKey: 'rsi', color: '#a78bfa', name: 'RSI' }]}
            height={130}
            yDomain={[0, 100]}
            referenceLines={[
              { y: 70, color: '#ef4444', label: '70' },
              { y: 50, color: '#475569' },
              { y: 30, color: '#10b981', label: '30' },
            ]}
          />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
          {[
            { label: 'Peak', v: retracement.peak, c: '#64748b' },
            { label: '38.2%', v: retracement.fib382, c: '#f59e0b' },
            { label: '50%', v: retracement.fib50, c: '#f97316' },
            { label: '61.8%', v: retracement.fib618, c: '#ef4444' },
            { label: 'Base', v: retracement.base, c: '#475569' },
          ].map((x) => (
            <div key={x.label} className="bg-[#0a0e17] rounded p-2 border border-slate-700/30 text-center">
              <div className="text-xs font-mono text-slate-600">{x.label}</div>
              <div className="text-sm font-mono font-bold" style={{ color: x.c }}>{x.v.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 낙폭 밴드 게이지 */}
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">낙폭 밴드</h3>
            <InfoTip text="peak 대비 현재 낙폭이 역대 나스닥 약세장 분포의 어느 구간인지 보여주는 게이지입니다. 리세션이 없으면 -19~-37%, 리세션 동반이면 -31~-78%(닷컴 -78%)까지 깊어졌던 것이 역사 패턴이며, 적용 밴드는 반도체 레짐이 분기합니다. 나스닥 -20% 돌파는 코스피 CASE 2(감익 사이클) 전환 트리거로 씁니다." />
          </div>
          <span className="text-xs font-mono" style={{ color: regime?.color }}>
            적용: {bands.applied === 'non_recession' ? '비리세션 (-19~-37%)' : '리세션 (-31~-78%)'} ← 레짐 {regime?.name}
          </span>
        </div>
        <div className="relative h-6 bg-slate-800 rounded-full overflow-hidden">
          <div className="absolute h-full"
            style={{ left: pct(bandHi), width: `calc(${pct(bandLo)} - ${pct(bandHi)})`, backgroundColor: (regime?.color || '#64748b') + '30' }} />
          <div className="absolute h-full w-0.5 bg-cyan-400" style={{ left: pct(dd) }} />
          <div className="absolute text-xs font-mono text-cyan-300 -translate-x-1/2" style={{ left: pct(dd), top: 6 }}>{dd.toFixed(0)}%</div>
        </div>
        <div className="flex justify-between text-xs font-mono text-slate-700 mt-1">
          <span>0%</span><span>-19%</span><span>-37%</span><span>-56%</span><span>-80%</span>
        </div>
        <p className="text-xs font-mono text-slate-500 mt-2">
          밴드 목표가: <span className="text-slate-300">{band_target.high.toLocaleString()}</span> ~{' '}
          <span className="text-slate-300">{band_target.low.toLocaleString()}</span>
        </p>
      </div>

      {/* 전체이력 차트 + 역대 약세장 오버레이 */}
      {data.price_full && data.price_full.length > 0 && (
        <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">역대 나스닥 약세장 (전체 이력)</h3>
            <InfoTip text="1971년~ 주봉 전체 이력에서 '사상 신고가 대비 -25% 이상 하락' 이벤트를 자동 검출한 표입니다. 행 클릭 = 해당 구간 확대 + 그 이벤트의 Fib 레벨 표시. 역대 9회 중 4회가 61.8%에서 바닥, 4회는 >100%(상승분 전체 반납)였습니다. 주의: 2007 금융위기는 닷컴 고점(5,048)을 회복하기 전의 2차 하락이라 별도 이벤트로 검출되지 않고 닷컴 이벤트에 흡수됩니다." />
            <span className="text-xs font-mono text-slate-600 ml-auto">1971~ 월봉 · 음영 = 약세장 · 하단 바 드래그 = 확대/스크롤</span>
          </div>
          <MacroLineChart
            data={data.price_full}
            series={[{ dataKey: 'value', color: '#06b6d4', name: 'NASDAQ' }]}
            crisisOverlays={NASDAQ_BEAR_OVERLAYS}
            referenceLines={selEv ? [
              { y: selEv.peak, color: '#64748b', label: 'Peak' },
              { y: selEv.fib382, color: '#f59e0b', label: '38.2%' },
              { y: selEv.fib50, color: '#f97316', label: '50%' },
              { y: selEv.fib618, color: '#ef4444', label: '61.8%' },
              { y: selEv.base, color: '#475569', label: 'Base' },
            ] : []}
            height={340}
            yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            brush
            brushRange={eventRange}
          />
          {/* 이벤트 테이블: 행 클릭 → 해당 구간 줌 + 그 이벤트의 Fib 레벨 표시 */}
          {events.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs font-mono whitespace-nowrap">
                <thead>
                  <tr className="text-slate-600 border-b border-slate-800">
                    <th className="text-left py-1">고점</th>
                    <th className="text-right px-2">Base</th>
                    <th className="text-right px-2">저점</th>
                    <th className="text-right px-2">낙폭</th>
                    <th className="text-right px-2">되돌림</th>
                    <th className="text-right px-2">도달 Fib</th>
                    <th className="text-right">고점→저점</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev, i) => (
                    <tr
                      key={ev.peak_date}
                      onClick={() => setSelectedEvent(selectedEvent === i ? null : i)}
                      className={`border-b border-slate-800/40 cursor-pointer transition-colors ${
                        selectedEvent === i ? 'bg-cyan-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className={`py-1 ${ev.ongoing ? 'text-cyan-300 font-bold' : 'text-slate-300'}`}>
                        {ev.peak_date.substring(0, 7)} · {ev.peak.toLocaleString()}{ev.ongoing ? ' (진행형)' : ''}
                      </td>
                      <td className="text-right px-2 text-slate-500">
                        {ev.base.toLocaleString()} ({ev.base_date.substring(0, 7)})
                      </td>
                      <td className="text-right px-2 text-slate-500">
                        {ev.bottom.toLocaleString()} ({ev.bottom_date.substring(0, 7)})
                      </td>
                      <td className="text-right px-2 font-bold"
                        style={{ color: ev.drawdown_pct <= -50 ? '#ef4444' : ev.drawdown_pct <= -30 ? '#f97316' : '#f59e0b' }}>
                        {ev.drawdown_pct}%
                      </td>
                      <td className="text-right px-2 text-slate-300">{ev.retracement_pct ?? '–'}%</td>
                      <td className="text-right px-2 font-bold"
                        style={{ color: (ev.fib_reached && FIB_COLOR[ev.fib_reached]) || '#64748b' }}>
                        {ev.fib_reached ?? '<38.2%'}
                      </td>
                      <td className="text-right text-slate-500">{ev.months_to_bottom}개월</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs font-mono text-slate-600 mt-2">
                행 클릭 = 해당 이벤트 구간 확대 + Fib 레벨 표시 · 다시 클릭 = 전체 보기 · 되돌림 = (고점−저점)÷(고점−base)
              </p>
            </div>
          )}
          <p className="text-xs font-mono text-slate-600 mt-2">
            회색 = 리세션 동반(-31~-78%) · 빨강 = 리세션 없음(-19~-37%) · 현재 오른쪽 끝
          </p>
        </div>
      )}

      {/* 역대 나스닥 약세장 비교표 */}
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">역대 나스닥 약세장</h3>
          <span className="text-xs font-mono text-slate-600 ml-auto">
            적용 밴드: <span style={{ color: regime?.color }}>{bands.applied === 'non_recession' ? '비리세션' : '리세션'}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map((grp) => (
            <div key={grp.title} className="rounded-lg border p-2"
              style={{ borderColor: grp.active ? (regime?.color || '#64748b') + '60' : '#1e293b' }}>
              <div className="text-xs font-mono mb-2 flex items-center gap-2"
                style={{ color: grp.active ? regime?.color : '#64748b' }}>
                {grp.title}
                {grp.active && (
                  <span className="text-[10px] px-1.5 rounded" style={{ backgroundColor: (regime?.color || '#64748b') + '20' }}>적용</span>
                )}
              </div>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-slate-600 border-b border-slate-800">
                    <th className="text-left py-1">시기</th>
                    <th className="text-right">고점</th>
                    <th className="text-right">저점</th>
                    <th className="text-right">낙폭</th>
                    <th className="text-right">기간</th>
                  </tr>
                </thead>
                <tbody>
                  {grp.rows.map((r) => (
                    <tr key={r.period} className="border-b border-slate-800/40"
                      style={{ backgroundColor: r.current ? '#06b6d415' : 'transparent' }}>
                      <td className={`py-1 ${r.current ? 'text-cyan-300 font-bold' : 'text-slate-400'}`}>{r.period}</td>
                      <td className="text-right text-slate-500">{r.high}</td>
                      <td className="text-right text-slate-500">{r.low}</td>
                      <td className="text-right font-bold"
                        style={{ color: r.drop <= -50 ? '#ef4444' : r.drop <= -30 ? '#f97316' : '#f59e0b' }}>{r.drop}%</td>
                      <td className="text-right text-slate-500">{r.dur}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="text-xs font-mono text-slate-600 mt-3">
          패턴: 리세션 없으면 -19~-37%, 리세션이면 -31~-78% → 반도체 레짐이 어느 밴드일지 분기
        </p>
      </div>
    </div>
  );
}
