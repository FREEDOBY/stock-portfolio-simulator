/** 나스닥 저점 판정기 (사이드바 전용 페이지)
 *
 * 코스피 저점과 동일 구조 — 파라볼릭 되돌림 + 낙폭 밴드 + 역대 약세장(차트 오버레이 + 표).
 * 한국 전용(수급/신용/반대매매)은 없음. '-20% 돌파 = CASE 2' 트리거 강조.
 * 반도체 레짐(피크·CASE1 / 하강·CASE2)이 되돌림 밴드(비리세션 vs 리세션)를 분기.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchNasdaqBottom } from '../../api/macro';
import { MacroLineChart } from './charts/MacroLineChart';
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
  { period: '현재 26.7', high: '사상최고 (26.6)', low: '진행형', drop: -8, dur: '3주', current: true },
];

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

  const series = [{ dataKey: 'value', color: regime?.color || '#06b6d4', name: 'NASDAQ' }];
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

  const groups = [
    { title: '리세션 없음 (-19~-37%)', rows: NASDAQ_NON_RECESSION, active: bands.applied === 'non_recession' },
    { title: '리세션 동반 (-31~-78%)', rows: NASDAQ_RECESSION, active: bands.applied === 'recession' },
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
          <span className="text-xs font-mono text-slate-600 ml-auto">
            peak {retracement.peak.toLocaleString()} · base {retracement.base.toLocaleString()} ({data.base?.date})
          </span>
        </div>
        <MacroLineChart
          data={data.price || []}
          series={series}
          referenceLines={referenceLines}
          height={300}
          yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
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
          <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">낙폭 밴드</h3>
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
            <span className="text-xs font-mono text-slate-600 ml-auto">1971~ 월봉 · 음영 = 약세장</span>
          </div>
          <MacroLineChart
            data={data.price_full}
            series={[{ dataKey: 'value', color: '#06b6d4', name: 'NASDAQ' }]}
            crisisOverlays={NASDAQ_BEAR_OVERLAYS}
            height={300}
            yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
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
