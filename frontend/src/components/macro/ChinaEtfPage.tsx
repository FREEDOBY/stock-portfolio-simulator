/** 국내 상장 중국 ETF (사이드바 전용 페이지)
 *
 * 나스닥 A차트와 동일 구조의 파라볼릭 되돌림을 ETF별 카드로 반복.
 * 4축 커버리지: 본토 CSI300 · 본토 A50 · 항셍테크 · 홍콩 H주 — 지수 중복 없음.
 * 한국 상장이라 원화 기준 = 환율 효과 포함된 실체감 수익률.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchChinaEtf } from '../../api/macro';
import { MacroLineChart } from './charts/MacroLineChart';
import { InfoTip } from './charts/InfoTip';
import type { ChinaEtfData, ChinaEtfItem } from '../../types/macro';

function shiftMonths(dateStr: string, m: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + m);
  return d.toISOString().substring(0, 10);
}

function EtfCard({ etf }: { etf: ChinaEtfItem }) {
  const price = useMemo(() => etf.price ?? [], [etf]);
  const retracement = etf.retracement;

  // 기본 뷰 = base 3개월 전 ~ 현재 (Brush로 5년 전체 확장 가능) — 나스닥 A차트와 동일
  const currentRange = useMemo<[number, number] | null>(() => {
    const baseDate = etf.base?.date;
    if (price.length < 2 || !baseDate) return null;
    const from = shiftMonths(baseDate, -3);
    let start = price.findIndex((p) => p.date >= from);
    if (start < 0) start = 0;
    return start < price.length - 1 ? [start, price.length - 1] : null;
  }, [price, etf.base?.date]);

  if (!etf.available || !retracement) {
    return (
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
        <div className="text-sm font-mono text-slate-400">{etf.name} <span className="text-slate-600">{etf.code}</span></div>
        <p className="text-xs font-mono text-slate-600 mt-2">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  const dd = etf.drawdown_pct ?? 0;
  const series = [
    { dataKey: 'value', color: etf.verdict_color || '#06b6d4', name: etf.name },
    { dataKey: 'sma50', color: '#10b981', name: '50일', strokeDasharray: '4 2' },
    { dataKey: 'sma120', color: '#3b82f6', name: '120일', strokeDasharray: '4 2' },
    { dataKey: 'sma200', color: '#ec4899', name: '200일', strokeDasharray: '4 2' },
  ];
  const referenceLines = [
    { y: retracement.fib382, color: '#f59e0b', label: '38.2%' },
    { y: retracement.fib50, color: '#f97316', label: '50%' },
    { y: retracement.fib618, color: '#ef4444', label: '61.8%' },
    { y: etf.current ?? 0, color: '#06b6d4', label: '현재' },
  ];

  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
      {/* 헤더: 이름 + 판정 + 핵심 스탯 */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: etf.verdict_color }} />
          <span className="text-sm font-mono font-bold text-slate-200">{etf.name}</span>
          <span className="text-xs font-mono text-slate-600">{etf.code}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{etf.index}</span>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] font-mono text-slate-600">현재가</div>
            <div className="text-sm font-mono font-bold text-slate-200">{(etf.current ?? 0).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-slate-600">낙폭</div>
            <div className="text-sm font-mono font-bold" style={{ color: etf.verdict_color }}>{dd.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-slate-600">되돌림</div>
            <div className="text-sm font-mono font-bold text-slate-200">{etf.retracement_pct ?? '–'}%</div>
          </div>
          <div className="text-xs font-mono font-bold" style={{ color: etf.verdict_color }}>{etf.verdict}</div>
        </div>
      </div>

      {/* A. 파라볼릭 되돌림 차트 */}
      <div className="text-xs font-mono text-slate-600 mb-1">
        peak {retracement.peak.toLocaleString()} ({etf.peak?.date}) · base {retracement.base.toLocaleString()} ({etf.base?.date}) · 하단 바 = 5년 전체
      </div>
      <MacroLineChart
        data={price}
        series={series}
        referenceLines={referenceLines}
        height={260}
        yAxisFormatter={(v) => v.toLocaleString()}
        yDomain={['auto', 'auto']}
        brush
        brushRange={currentRange}
      />
      {/* RSI(14) 일봉 서브차트 — A차트 기본 확대 구간에 맞춰 슬라이스 */}
      <div className="mt-1">
        <div className="text-xs font-mono text-slate-500 mb-1">RSI(14) · 일봉 — 70 과매수 / 30 과매도</div>
        <MacroLineChart
          data={currentRange ? price.slice(currentRange[0], currentRange[1] + 1) : price}
          series={[{ dataKey: 'rsi', color: '#a78bfa', name: 'RSI' }]}
          height={110}
          yDomain={[0, 100]}
          referenceLines={[
            { y: 70, color: '#ef4444', label: '70' },
            { y: 50, color: '#475569' },
            { y: 30, color: '#10b981', label: '30' },
          ]}
        />
      </div>
      {/* Fib 레벨 그리드 */}
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
  );
}

export function ChinaEtfPage() {
  const [data, setData] = useState<ChinaEtfData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await fetchChinaEtf(force));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load China ETF data');
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
          <p className="text-sm font-mono text-slate-500">Loading China ETFs...</p>
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
  if (!data?.available || !data.etfs?.length) {
    return (
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-6 text-center">
        <p className="text-sm font-mono text-slate-500">중국 ETF 데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div>
              <div className="text-xs font-mono text-slate-500 uppercase tracking-wider">China ETF · KRX Listed</div>
              <div className="text-2xl font-mono font-bold text-slate-200">중국 ETF 파라볼릭 되돌림</div>
            </div>
            <InfoTip text="국내 상장 중국 ETF 4종(본토 CSI300 · 본토 A50 · 항셍테크 · 홍콩 H주)의 일봉 5년 창에서 peak와 base(peak 직전 마지막 ≥15% 조정의 저점)를 잡아 피보나치 되돌림을 계산합니다 — 코스피·나스닥 A차트와 동일 규칙. 원화 표시 가격이라 환율 효과가 포함됩니다. 기본 뷰는 현재 이벤트 구간, 하단 바로 5년 전체 확대." />
          </div>
          <button
            onClick={() => load(true)}
            className="text-xs font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors"
          >
            ↻ 새로고침
          </button>
        </div>
      </div>
      {data.etfs.map((etf) => (
        <EtfCard key={etf.code} etf={etf} />
      ))}
    </div>
  );
}
