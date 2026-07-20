/** 코스피 저점 판정기 (사이드바 전용 페이지)
 *
 * A. 파라볼릭 되돌림 — KOSPI base 대비 되돌림 + Fib 레벨 + 역사적 베어장 오버레이
 * B. 신용잔고 추이 (수동, KRX 실연동 전) — 청산 진행/멈춤
 * C. 반대매매량 (수동) — 강제 디레버리징 스파이크 → 진정
 * 반도체 레짐(피크·CASE1 / 하강·CASE2)이 되돌림 밴드(비리세션 vs 리세션)를 분기.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchKospiBottom, setKospiManual } from '../../api/macro';
import { MacroLineChart } from './charts/MacroLineChart';
import { InfoTip } from './charts/InfoTip';
import type { CrisisOverlay } from './charts/crisisOverlayConfig';
import type { KospiBottomData, CreditTrend, ForcedSelling } from '../../types/macro';

// 5년 차트에 들어오는 한국 약세장 구간 (리포트 표 기반)
const KOSPI_BEARS: CrisisOverlay[] = [
  { start: '2021-06-01', end: '2022-09-30', label: '긴축 베어 (-36%)', type: 'correction' },
  { start: '2024-07-01', end: '2024-12-31', label: '엔캐리+계엄 (-18%)', type: 'correction' },
  { start: '2026-02-19', end: '2026-03-31', label: '중동쇼크 (-20%)', type: 'recession' },
];

// 전체이력(1996~) 차트용 — 역대 코스피 약세장 전부 (리포트 표 기반)
const KOSPI_BEAR_OVERLAYS: CrisisOverlay[] = [
  { start: '1997-08-01', end: '1998-06-30', label: 'IMF -76%', type: 'recession' },
  { start: '2000-01-01', end: '2001-09-30', label: '닷컴 -57%', type: 'recession' },
  { start: '2007-10-01', end: '2008-10-31', label: '금융위기 -57%', type: 'recession' },
  { start: '2011-04-01', end: '2011-09-30', label: '신용강등 -26%', type: 'correction' },
  { start: '2018-01-01', end: '2019-08-31', label: '무역전쟁 -24%', type: 'correction' },
  { start: '2020-01-01', end: '2020-03-31', label: '코로나 -37%', type: 'correction' },
  { start: '2021-06-01', end: '2022-09-30', label: '긴축 -36%', type: 'correction' },
  { start: '2024-07-01', end: '2024-12-31', label: '엔캐리계엄 -18%', type: 'correction' },
  { start: '2026-02-01', end: '2026-03-31', label: '중동쇼크 -20%', type: 'correction' },
  { start: '2026-06-01', end: '2026-07-31', label: '현재 -31%', type: 'recession' },
];

// 역대 코스피 약세장 비교표 (리포트 기반)
type BearRow = { period: string; high: string; low: string; drop: number; dur: string; current?: boolean };
const KOSPI_RECESSION: BearRow[] = [
  { period: '1989~92 침체', high: '1,007 (89.4)', low: '459 (92.8)', drop: -54, dur: '3년 4개월' },
  { period: 'IMF 외환위기', high: '1,145 (94.11)', low: '277 (98.6)', drop: -76, dur: '3년 7개월' },
  { period: '닷컴붕괴', high: '1,066 (00.1)', low: '463 (01.9)', drop: -57, dur: '1년 8개월' },
  { period: '금융위기', high: '2,085 (07.10)', low: '892 (08.10)', drop: -57, dur: '1년' },
];
const KOSPI_NON_RECESSION: BearRow[] = [
  { period: '미국 신용강등 11', high: '2,231 (11.4)', low: '1,644 (11.9)', drop: -26, dur: '5개월' },
  { period: '무역전쟁 18', high: '2,607 (18.1)', low: '1,985 (19.8)', drop: -24, dur: '1년 7개월' },
  { period: '코로나 쇼크 20', high: '2,267 (20.1)', low: '1,439 (20.3)', drop: -37, dur: '2개월' },
  { period: '긴축 베어장 21~22', high: '3,316 (21.6)', low: '2,134 (22.9)', drop: -36, dur: '1년 3개월' },
  { period: '엔캐리+계엄 24', high: '2,896 (24.7)', low: '~2,360 (24.12)', drop: -18, dur: '5개월' },
  { period: '중동쇼크 26.3', high: '6,347 (26.2)', low: '5,052 (26.3)', drop: -20, dur: '1개월' },
  { period: '현재 26.7', high: '9,385 (26.6)', low: '6,448 (진행형)', drop: -31, dur: '3주', current: true },
];

const CREDIT_OPTS: { id: CreditTrend; label: string; color: string }[] = [
  { id: 'rising', label: '증가', color: '#ef4444' },
  { id: 'falling', label: '청산중', color: '#f59e0b' },
  { id: 'stalling', label: '멈춤', color: '#10b981' },
];
// 도달 Fib 레벨별 색 (깊을수록 위험색)
const FIB_COLOR: Record<string, string> = {
  '>100%': '#a78bfa', '61.8%': '#ef4444', '50%': '#f97316', '38.2%': '#f59e0b',
};

function shiftMonths(dateStr: string, m: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + m);
  return d.toISOString().substring(0, 10);
}

const FORCED_OPTS: { id: ForcedSelling; label: string; color: string }[] = [
  { id: 'spike', label: '급증', color: '#ef4444' },
  { id: 'normal', label: '보통', color: '#64748b' },
  { id: 'easing', label: '진정', color: '#10b981' },
];

export function KospiBottomPage() {
  const [data, setData] = useState<KospiBottomData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 역대 파라볼릭 이벤트 선택 (전체이력 차트 줌인)
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);

  const events = data?.parabolic_events ?? [];
  const fullPrice = useMemo(() => data?.price_full ?? [], [data]);
  const selEv = selectedEvent !== null ? events[selectedEvent] : null;

  // 선택 이벤트 구간 → Brush 줌 범위 (base 6개월 전 ~ 저점 12개월 후)
  const brushRange = useMemo<[number, number] | null>(() => {
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

  // B/C 차트용 단위 변환 (조/억) — 툴팁·축 모두 읽기 좋게
  const creditChart = useMemo(
    () => (data?.credit_series ?? []).map((p) => ({ date: p.date, value: +(p.value / 1e12).toFixed(2) })),
    [data],
  );
  const forcedChart = useMemo(
    () => (data?.forced_series ?? []).map((p) => ({
      date: p.date,
      amount: p.amount != null ? +(p.amount / 1e8).toFixed(0) : null,
      ratio: p.ratio,
    })),
    [data],
  );

  // B/C 기본 뷰 = 최근 6개월(120거래일) — Brush로 전체 이력(2021.11~) 확장 가능
  const creditRange = useMemo<[number, number] | null>(
    () => (creditChart.length > 130 ? [creditChart.length - 120, creditChart.length - 1] : null),
    [creditChart],
  );
  const forcedRange = useMemo<[number, number] | null>(
    () => (forcedChart.length > 130 ? [forcedChart.length - 120, forcedChart.length - 1] : null),
    [forcedChart],
  );

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

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchKospiBottom());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load KOSPI data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyManual = async (credit: CreditTrend, forced: ForcedSelling) => {
    setSaving(true);
    try {
      await setKospiManual(credit, forced);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm font-mono text-slate-500">Loading KOSPI bottom...</p>
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
        <p className="text-sm font-mono text-slate-500">KOSPI 데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  const { retracement, bands, band_target, regime } = data;
  const dd = data.drawdown_pct ?? 0;

  // 차트 시리즈 + Fib 되돌림 기준선
  const series = [{ dataKey: 'value', color: regime?.color || '#06b6d4', name: 'KOSPI' }];
  const referenceLines = [
    { y: retracement.fib382, color: '#f59e0b', label: '38.2%' },
    { y: retracement.fib50, color: '#f97316', label: '50%' },
    { y: retracement.fib618, color: '#ef4444', label: '61.8%' },
    { y: data.current ?? 0, color: '#06b6d4', label: '현재' },
  ];

  // 낙폭 밴드 게이지 (0 ~ -60%)
  const GAUGE_MIN = -60;
  const pct = (v: number) => `${(Math.min(0, Math.max(GAUGE_MIN, v)) / GAUGE_MIN) * 100}%`;
  const bandLo = bands.applied === 'non_recession' ? bands.non_recession.low : bands.recession.low;
  const bandHi = bands.applied === 'non_recession' ? bands.non_recession.high : bands.recession.high;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* 판정 배너 */}
      <div className="bg-[#111827] border rounded-lg p-5" style={{ borderColor: (data.verdict_color || '#64748b') + '50' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: data.verdict_color }} />
            <div>
              <div className="text-xs font-mono text-slate-500 uppercase tracking-wider">KOSPI Bottom Verdict</div>
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
      </div>

      {/* A. 파라볼릭 되돌림 차트 */}
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-mono font-bold text-cyan-400">A.</span>
          <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">파라볼릭 되돌림</h3>
          <InfoTip text="KOSPI 일봉 5년에서 peak(최고점)와 base(peak 직전 마지막 ≥15% 조정의 저점 = 마지막 가속 상승의 출발점)를 잡아, 상승분에 피보나치 비율을 적용한 되돌림 참고선입니다. 배너의 '되돌림 %' = (peak−현재가)÷(peak−base), 즉 상승분을 얼마나 반납했는지입니다. 역대 사례에서 61.8% 레벨이 자주 바닥이었습니다. 기본 뷰는 현재 이벤트 구간이며 하단 바로 5년 전체를 볼 수 있습니다." />
          <span className="text-xs font-mono text-slate-600 ml-auto">
            peak {retracement.peak.toLocaleString()} · base {retracement.base.toLocaleString()} ({data.base?.date}) · 하단 바 = 5년 전체
          </span>
        </div>
        <MacroLineChart
          data={data.price || []}
          series={series}
          referenceLines={referenceLines}
          crisisOverlays={KOSPI_BEARS}
          height={300}
          yAxisFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
          yDomain={['auto', 'auto']}
          brush
          brushRange={currentRange}
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

      {/* 투자자 수급 (외국인/기관/개인 일별 순매수) */}
      {data.investor_flow && data.investor_flow.length > 0 && (
        <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-mono font-bold text-cyan-400">수급</span>
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">외국인·기관·개인 순매수</h3>
            <InfoTip text="네이버 증권의 투자자별 일별 순매수(억원)입니다. 외국인 지속 순매도 + 개인 순매수 조합은 하락 지속 신호, 외국인 순매수 전환은 저점의 단서로 참고합니다." />
            <span className="text-xs font-mono text-slate-600 ml-auto">단위: 억원 · 네이버</span>
          </div>
          <MacroLineChart
            data={data.investor_flow}
            series={[
              { dataKey: 'foreign', color: '#06b6d4', name: '외국인' },
              { dataKey: 'institution', color: '#f59e0b', name: '기관' },
              { dataKey: 'individual', color: '#94a3b8', name: '개인' },
            ]}
            referenceLines={[{ y: 0, color: '#475569' }]}
            height={220}
            yAxisFormatter={(v) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}조` : `${Math.round(v)}억`)}
          />
          <p className="text-xs font-mono text-slate-600 mt-2">
            외국인 지속 순매도 + 개인 순매수 = 하락 지속 신호 · 외국인 순매수 전환 = 저점 단서
          </p>
        </div>
      )}

      {/* 낙폭 밴드 게이지 */}
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">낙폭 밴드</h3>
            <InfoTip text="peak 대비 현재 낙폭이 역대 약세장 분포의 어느 구간에 있는지 보여주는 게이지입니다. 역사 패턴상 리세션이 없으면 -19~-37%에서, 리세션 동반이면 -37~-55%에서 바닥이 형성됐고 중간지대는 드뭅니다. 어느 밴드를 적용할지는 반도체 레짐(피크=비리세션 / 하강=리세션)이 분기합니다." />
          </div>
          <span className="text-xs font-mono" style={{ color: regime?.color }}>
            적용: {bands.applied === 'non_recession' ? '비리세션 (-19~-37%)' : '리세션 (-37~-55%)'} ← 레짐 {regime?.name}
          </span>
        </div>
        <div className="relative h-6 bg-slate-800 rounded-full overflow-hidden">
          {/* 적용 밴드 구간 */}
          <div
            className="absolute h-full"
            style={{
              left: pct(bandHi),
              width: `calc(${pct(bandLo)} - ${pct(bandHi)})`,
              backgroundColor: (regime?.color || '#64748b') + '30',
            }}
          />
          {/* 현재 낙폭 마커 */}
          <div className="absolute h-full w-0.5 bg-cyan-400" style={{ left: pct(dd) }} />
          <div className="absolute text-xs font-mono text-cyan-300 -translate-x-1/2" style={{ left: pct(dd), top: 6 }}>
            {dd.toFixed(0)}%
          </div>
        </div>
        <div className="flex justify-between text-xs font-mono text-slate-700 mt-1">
          <span>0%</span><span>-19%</span><span>-37%</span><span>-50%</span><span>-60%</span>
        </div>
        <p className="text-xs font-mono text-slate-500 mt-2">
          밴드 목표가: <span className="text-slate-300">{band_target.high.toLocaleString()}</span> ~{' '}
          <span className="text-slate-300">{band_target.low.toLocaleString()}</span>
        </p>
      </div>

      {/* 환율 · 유가 (코스피 매크로 압력) */}
      {data.fx_series && data.fx_series.length > 0 && (
        <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">환율 vs KOSPI</h3>
            <InfoTip text="원/달러 환율과 코스피의 역상관을 겹쳐 보는 차트입니다. 스케일이 크게 달라(코스피 수천 vs 환율 천 단위) 둘 다 구간 시작=100으로 정규화해 상대 등락을 같은 축에서 비교합니다. 원화 약세 → 외국인 환손실 → 자금 이탈 → 지수 하락의 되먹임 때문에, 역사적으로 환율 정점 통과(피크아웃)가 코스피 바닥과 동행/선행했습니다 (2022.10 환율 정점 = 코스피 바닥). 환율이 26주 고점 대비 -2.5% 이상 꺾이면 '피크아웃' 확인 신호가 점등되고 저점 판정 확인 3축(신용·반대매매·환율) 중 하나로 계산됩니다." />
            {data.fx_peakout?.status && (
              <span
                className="text-xs font-mono px-2 py-0.5 rounded border ml-auto"
                style={{
                  color: data.fx_peakout.status === 'peaked' ? '#10b981' : data.fx_peakout.status === 'at_high' ? '#ef4444' : '#f59e0b',
                  borderColor: (data.fx_peakout.status === 'peaked' ? '#10b981' : data.fx_peakout.status === 'at_high' ? '#ef4444' : '#f59e0b') + '50',
                  backgroundColor: (data.fx_peakout.status === 'peaked' ? '#10b981' : data.fx_peakout.status === 'at_high' ? '#ef4444' : '#f59e0b') + '15',
                }}
              >
                {data.fx_peakout.status === 'peaked' ? '환율 피크아웃 ✓' : data.fx_peakout.status === 'at_high' ? '환율 고점권 (압력 지속)' : '환율 완화 중 (미확정)'}
                {' · '}{data.fx_peakout.now?.toLocaleString()}원 (고점 대비 {data.fx_peakout.off_high_pct}%)
              </span>
            )}
          </div>
          <MacroLineChart
            data={data.fx_series}
            series={[
              { dataKey: 'kospi', color: '#06b6d4', name: 'KOSPI (시작=100)' },
              { dataKey: 'usdkrw', color: '#f59e0b', name: '원/달러 (시작=100)' },
            ]}
            height={300}
            yAxisFormatter={(v) => `${v.toFixed(0)}`}
            yDomain={['auto', 'auto']}
            referenceLines={[{ y: 100, color: '#475569', label: '기준 100' }]}
            brush
          />
        </div>
      )}

      {data.wti_series && data.wti_series.length > 0 && (
        <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">WTI 유가 ($ · YoY %)</h3>
            <InfoTip text="한국은 원유 전량 수입국이라 유가 급등 = 무역수지 악화 + 원화 약세 + 기업 마진 압박의 삼중고입니다. 단, 코스피와의 상관은 원인에 따라 다릅니다 — 수요 견인 상승(글로벌 호황)은 동반 상승, 공급 쇼크(전쟁·봉쇄, 2026 중동쇼크)는 역방향. 그래서 오버레이하지 않고 단독으로 두며, YoY(주황)가 급등하는 '속도'가 빠를 때(공급 쇼크형)를 위험 신호로 읽습니다." />
          </div>
          <MacroLineChart
            data={data.wti_series}
            series={[
              { dataKey: 'value', color: '#a78bfa', name: 'WTI $', type: 'area' },
              { dataKey: 'yoy', color: '#f59e0b', name: 'YoY %', yAxisId: 'right' },
            ]}
            height={260}
            yAxisFormatter={(v) => `$${v.toFixed(0)}`}
            rightYAxisFormatter={(v) => `${v.toFixed(0)}%`}
            yDomain={['auto', 'auto']}
            referenceLines={[{ y: 0, color: '#64748b', yAxisId: 'right' }]}
            brush
          />
        </div>
      )}

      {/* 전체이력 차트 + 역대 파라볼릭 되돌림 (Brush 확대/스크롤) */}
      {fullPrice.length > 0 && (
        <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">역대 파라볼릭 되돌림 (전체 이력)</h3>
            <InfoTip text="1996년~ 월봉에서 '사상 신고가 대비 -25% 이상 하락' 이벤트를 자동 검출해, 이벤트별 base·저점·되돌림 깊이·도달 Fib 레벨·소요 기간을 계산한 표입니다. 행을 클릭하면 해당 구간으로 확대되고 그 이벤트의 Fib 기준선이 차트에 표시됩니다. 진행형(현재) 이벤트는 일봉 기준으로 항상 포함됩니다. 역대 6회 중 3회가 61.8%에서 바닥을 잡았습니다. 주의: IMF 행은 1996년 이전 데이터가 없어 base가 부정확합니다." />
            <span className="text-xs font-mono text-slate-600 ml-auto">
              1996~ 월봉 · 음영 = 약세장 · 하단 바 드래그 = 확대/스크롤
            </span>
          </div>
          <MacroLineChart
            data={fullPrice}
            series={[{ dataKey: 'value', color: '#06b6d4', name: 'KOSPI' }]}
            crisisOverlays={KOSPI_BEAR_OVERLAYS}
            referenceLines={selEv ? [
              { y: selEv.peak, color: '#64748b', label: 'Peak' },
              { y: selEv.fib382, color: '#f59e0b', label: '38.2%' },
              { y: selEv.fib50, color: '#f97316', label: '50%' },
              { y: selEv.fib618, color: '#ef4444', label: '61.8%' },
              { y: selEv.base, color: '#475569', label: 'Base' },
            ] : []}
            height={340}
            yAxisFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            brush
            brushRange={brushRange}
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
        </div>
      )}

      {/* 역대 코스피 약세장 비교표 */}
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">역대 코스피 약세장</h3>
          <span className="text-xs font-mono text-slate-600 ml-auto">
            적용 밴드: <span style={{ color: regime?.color }}>{bands.applied === 'non_recession' ? '비리세션' : '리세션'}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { title: '리세션 없음 (-18~-37%)', rows: KOSPI_NON_RECESSION, active: bands.applied === 'non_recession' },
            { title: '리세션 동반 (-54% 이상)', rows: KOSPI_RECESSION, active: bands.applied === 'recession' },
          ].map((grp) => (
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
          패턴: 리세션 없으면 -18~-37%에서 바닥, 리세션이면 -54%↑ · 중간지대 거의 없음 → 반도체 레짐이 어느 밴드일지 분기
        </p>
      </div>

      {/* B/C 신용잔고 + 반대매매 — 전체 폭 (위 차트들과 동일 사이즈) */}
      <div className="space-y-4">
        <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-mono font-bold text-cyan-400">B.</span>
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">신용잔고 추이</h3>
            <InfoTip text="KOFIA 일별 신용융자 잔고(조원)입니다. 하락장에서 잔고가 계속 줄면 레버리지 청산이 진행 중이고, 줄어들다가 멈추면(멈춤) 강제 매물이 소진됐다는 뜻 — 저점 판정의 확인 신호 중 하나입니다. 매수신호 = 청산이 '멈춤'." />
            {data.credit_source === 'auto' ? (
              <span className="text-xs font-mono text-emerald-400/80 ml-auto">
                자동 · KOFIA{data.credit_latest ? ` (${(data.credit_latest / 1e12).toFixed(1)}조)` : ''}
              </span>
            ) : (
              <span className="text-xs font-mono text-amber-500/70 ml-auto">수동 · 키 미발급</span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-500 mb-3">매수신호 = 청산이 <b className="text-emerald-400">멈춤</b></p>
          <div className="flex gap-1">
            {CREDIT_OPTS.map((o) => {
              const active = data.credit_trend === o.id;
              const isAuto = data.credit_source === 'auto';
              return (
                <button
                  key={o.id}
                  onClick={() => applyManual(o.id, data.forced_selling || 'normal')}
                  disabled={saving || isAuto}
                  title={isAuto ? 'KOFIA 자동값 (수동 변경 불가)' : ''}
                  className="flex-1 px-3 py-2 text-sm font-mono rounded transition-all disabled:cursor-not-allowed"
                  style={{
                    color: active ? o.color : '#475569',
                    backgroundColor: active ? o.color + '20' : '#0a0e17',
                    border: `1px solid ${active ? o.color + '60' : '#1e293b'}`,
                    opacity: isAuto && !active ? 0.35 : 1,
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {creditChart.length > 1 && (
            <div className="mt-3">
              <MacroLineChart
                data={creditChart}
                series={[{ dataKey: 'value', color: '#f59e0b', name: '신용잔고 (조)', type: 'area' }]}
                height={300}
                yAxisFormatter={(v) => `${v.toFixed(1)}조`}
                yDomain={['auto', 'auto']}
                brush
                brushRange={creditRange}
              />
              <p className="text-xs font-mono text-slate-600 mt-1">
                ~{creditChart[creditChart.length - 1]?.date} · 기본 6개월 · 하단 바 = 전체 {creditChart.length}거래일(2021.11~) · KOFIA (T+2 영업일 공표)
              </p>
            </div>
          )}
        </div>

        <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-mono font-bold text-cyan-400">C.</span>
            <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">반대매매량</h3>
            <InfoTip text="KOFIA 미수금 반대매매 금액(빨간 막대, 억원)과 미수금 대비 비중(시안 라인, %)입니다. 급증(스파이크)은 강제 디레버리징이 진행 중이라는 뜻이고, 스파이크 후 진정되면 투매(캐피튤레이션)가 마무리 국면에 가깝다는 확인 신호입니다." />
            {data.forced_source === 'auto' ? (
              <span className="text-xs font-mono text-emerald-400/80 ml-auto">
                자동 · KOFIA
                {data.forced_amount != null ? ` (${(data.forced_amount / 1e8).toFixed(0)}억` : ''}
                {data.forced_ratio != null ? ` · ${data.forced_ratio}%)` : data.forced_amount != null ? ')' : ''}
              </span>
            ) : (
              <span className="text-xs font-mono text-amber-500/70 ml-auto">수동 · 키 미발급</span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-500 mb-3">스파이크 후 <b className="text-emerald-400">진정</b> = 캐피튤레이션 근접</p>
          <div className="flex gap-1">
            {FORCED_OPTS.map((o) => {
              const active = data.forced_selling === o.id;
              const isAuto = data.forced_source === 'auto';
              return (
                <button
                  key={o.id}
                  onClick={() => applyManual(data.credit_trend || 'falling', o.id)}
                  disabled={saving || isAuto}
                  title={isAuto ? 'KOFIA 자동값 (수동 변경 불가)' : ''}
                  className="flex-1 px-3 py-2 text-sm font-mono rounded transition-all disabled:cursor-not-allowed"
                  style={{
                    color: active ? o.color : '#475569',
                    backgroundColor: active ? o.color + '20' : '#0a0e17',
                    border: `1px solid ${active ? o.color + '60' : '#1e293b'}`,
                    opacity: isAuto && !active ? 0.35 : 1,
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {forcedChart.length > 1 && (
            <div className="mt-3">
              <MacroLineChart
                data={forcedChart}
                series={[
                  { dataKey: 'amount', color: '#ef4444', name: '반대매매 (억)', type: 'bar' },
                  { dataKey: 'ratio', color: '#06b6d4', name: '미수금 대비 %', yAxisId: 'right' },
                ]}
                height={300}
                yAxisFormatter={(v) => `${v}억`}
                rightYAxisFormatter={(v) => `${v}%`}
                brush
                brushRange={forcedRange}
              />
              <p className="text-xs font-mono text-slate-600 mt-1">
                ~{forcedChart[forcedChart.length - 1]?.date} · 기본 6개월 · 하단 바 = 전체 {forcedChart.length}거래일(2021.11~) · KOFIA (T+2 영업일 공표)
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs font-mono text-slate-600 text-center">
        판정 = 낙폭 밴드 도달 + 확인 2/3 (신용 청산 멈춤 · 반대매매 진정 · 환율 피크아웃) · 반도체 레짐이 밴드를 분기
      </p>
    </div>
  );
}
