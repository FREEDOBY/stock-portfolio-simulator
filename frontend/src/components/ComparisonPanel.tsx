import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { ComparisonEntry } from '../types';
import type { Settings } from './SimulationSettings';
import { exportReport } from '../utils/htmlExport';

interface Props {
  entries: ComparisonEntry[];
  settings: Settings;
  onClose: () => void;
}

/** 여러 저장 포트폴리오의 백테스트를 수익률(%) 기준으로 겹쳐 비교 */
export function ComparisonPanel({ entries, settings, onClose }: Props) {
  // 날짜 합집합 기준으로 각 시리즈를 손익률(%)로 정규화.
  // 거치식은 초기금액 대비, 적립식은 그 시점까지의 누적 투자원금(invested) 대비 —
  // 방식이 달라도 "넣은 돈 대비 몇 % 벌었나"로 공정하게 겹쳐진다.
  // dataKey는 이름 대신 인덱스 키(p0, p1...)를 사용 — 이름에 '.' 등이 있으면
  // recharts가 중첩 경로로 해석해 선이 사라지는 문제 방지
  const pctSeries = useMemo(
    () =>
      entries.map((e) => {
        const fallback = e.result.total_invested || e.result.portfolio_values[0]?.value || 1;
        return e.result.portfolio_values.map((p) => ({
          date: p.date,
          pct: (p.value / (p.invested || fallback) - 1) * 100,
        }));
      }),
    [entries],
  );

  const chartData = useMemo(() => {
    const dateSet = new Set<string>();
    for (const s of pctSeries) for (const p of s) dateSet.add(p.date);
    const dates = [...dateSet].sort();
    const maps = pctSeries.map((s) => new Map(s.map((p) => [p.date, p.pct])));
    return dates.map((date) => {
      const row: Record<string, string | number | null> = { date };
      entries.forEach((_, i) => {
        row[`p${i}`] = maps[i].get(date) ?? null;
      });
      return row;
    });
  }, [entries, pctSeries]);

  // 결과가 완전히 동일한 포트폴리오 감지 (같은 비중 + 같은 설정) —
  // 선이 겹쳐 안 보이는 것을 점선 + 경고로 드러낸다
  const duplicateOf = useMemo(() => {
    const key = (s: { date: string; pct: number }[]) =>
      `${s.length}|${s[s.length - 1]?.pct.toFixed(6)}|${s[Math.floor(s.length / 2)]?.pct.toFixed(6)}|${s[Math.floor(s.length / 4)]?.pct.toFixed(6)}`;
    const seen = new Map<string, number>();
    return pctSeries.map((s, i) => {
      if (s.length === 0) return null;
      const k = key(s);
      const first = seen.get(k);
      if (first !== undefined) return first;
      seen.set(k, i);
      return null;
    });
  }, [pctSeries]);

  const formatPercent = (v: number) => `${(v * 100).toFixed(2)}%`;

  const STRATEGY_LABEL: Record<string, string> = {
    lump_sum: '거치식',
    dca: '적립식',
    ma_dca: 'MA적립식',
  };
  /** 이 항목이 비교에 실제 사용한 전략 (저장 설정 없으면 현재 설정으로 폴백) */
  const strategyOf = (e: ComparisonEntry) => {
    const s = e.saved.settings;
    const inv = s?.investmentType ?? settings.investmentType;
    const reb = s?.rebalance ?? settings.rebalance;
    return `${STRATEGY_LABEL[inv] ?? inv} · ${reb}${s ? '' : ' (현재 설정)'}`;
  };

  const metricRows = [
    { label: 'CAGR', get: (e: ComparisonEntry) => e.result.metrics.cagr, fmt: formatPercent, better: 1 },
    { label: 'MDD', get: (e: ComparisonEntry) => e.result.metrics.mdd, fmt: formatPercent, better: -1 },
    { label: 'SHARPE', get: (e: ComparisonEntry) => e.result.metrics.sharpe_ratio, fmt: (v: number) => v.toFixed(2), better: 1 },
    { label: 'VOL', get: (e: ComparisonEntry) => e.result.metrics.volatility, fmt: formatPercent, better: -1 },
    {
      label: 'INVESTED',
      get: (e: ComparisonEntry) => e.result.total_invested,
      fmt: (v: number) => `$${Math.round(v).toLocaleString()}`,
      better: 0, // 원금은 우열 없음
    },
    {
      label: 'FINAL',
      get: (e: ComparisonEntry) => e.result.portfolio_values[e.result.portfolio_values.length - 1]?.value ?? 0,
      fmt: (v: number) => `$${Math.round(v).toLocaleString()}`,
      better: 1,
    },
    {
      label: 'P&L %',
      get: (e: ComparisonEntry) => {
        const final = e.result.portfolio_values[e.result.portfolio_values.length - 1]?.value ?? 0;
        return e.result.total_invested ? (final / e.result.total_invested - 1) * 100 : 0;
      },
      fmt: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
      better: 1,
    },
  ];

  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    exportReport({
      title: 'Portfolio Comparison Report',
      mode: 'percent',
      preNormalized: true, // 투자원금 대비 손익률로 이미 정규화됨 (거치식/적립식 공정 비교)
      series: entries.map((e, i) => ({
        name: `${e.label} (${strategyOf(e).split(' · ')[0]})`,
        color: e.color,
        points: pctSeries[i].map((p) => ({ date: p.date, value: p.pct })),
      })),
      metricsColumns: entries.map((e) => ({
        name: e.label,
        color: e.color,
        metrics: e.result.metrics,
        invested: e.result.total_invested,
        finalValue: e.result.portfolio_values[e.result.portfolio_values.length - 1]?.value ?? 0,
      })),
      settingsSummary: `${settings.startDate} ~ ${settings.endDate} · 매수방식/금액/리밸런싱은 각 포트폴리오 저장 설정 · 투자원금 대비 손익률(%)`,
      filename: `portfolio-compare-${stamp}.html`,
    });
  };

  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">
            Comparison · {entries.length} portfolios
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-1 text-sm font-mono rounded bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
          >
            EXPORT HTML
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm font-mono rounded border border-slate-700 text-slate-500 hover:text-slate-400 hover:border-slate-600 transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-600 font-mono mb-3">
        기간 동일({settings.startDate} ~ {settings.endDate}) · 매수방식·금액·리밸런싱은 각 저장본 설정 ·{' '}
        투자원금 대비 손익률(%) 비교
      </p>

      {duplicateOf.some((d) => d !== null) && (
        <p className="text-xs text-amber-400 font-mono mb-3">
          ⚠ 동일 결과:{' '}
          {duplicateOf
            .map((d, i) => (d !== null ? `${entries[i].label} = ${entries[d].label}` : null))
            .filter(Boolean)
            .join(', ')}{' '}
          — 비중과 매수방식이 같아 선이 완전히 겹칩니다 (겹친 쪽은 점선으로 표시). 다르게 비교하려면 해당
          저장본을 LOAD → 설정 변경 → 같은 이름으로 SAVE 하세요.
        </p>
      )}

      {entries.some((e) => e.result.portfolio_values.length === 0) && (
        <p className="text-xs text-amber-400 font-mono mb-3">
          ⚠ 데이터 없음:{' '}
          {entries
            .filter((e) => e.result.portfolio_values.length === 0)
            .map((e) => e.label)
            .join(', ')}{' '}
          — 설정 기간에 시세가 없는 종목(상장 전 등)이 포함된 포트폴리오입니다. 기간을 줄여서 다시 비교하세요.
        </p>
      )}

      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
            tickFormatter={(d: string) => d.slice(0, 7)}
            minTickGap={48}
          />
          <YAxis
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
            tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
            width={56}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1f2e',
              border: '1px solid rgba(71,85,105,.6)',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'monospace',
            }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(v: number | string) =>
              typeof v === 'number' ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : v
            }
          />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'monospace' }} />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 3" />
          {entries.map((e, i) => (
            <Line
              key={e.label}
              type="monotone"
              dataKey={`p${i}`}
              name={e.label}
              stroke={e.color}
              strokeWidth={2}
              strokeDasharray={duplicateOf[i] !== null ? '6 5' : undefined}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* 지표 비교표 */}
      <div className="overflow-x-auto mt-4">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-3 text-slate-500 font-mono text-sm uppercase">Metric</th>
              {entries.map((e) => (
                <th key={e.label} className="text-right py-2 px-3 font-mono text-sm text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: e.color }} />
                    <span className="truncate max-w-[120px]" title={e.label}>{e.label}</span>
                  </span>
                  <span className="block text-[10px] font-normal text-slate-600 mt-0.5">{strategyOf(e)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((row) => {
              const values = entries.map(row.get);
              const best =
                row.better === 0 ? null : row.better === 1 ? Math.max(...values) : Math.min(...values);
              return (
                <tr key={row.label} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-3 text-slate-400 font-mono text-sm">{row.label}</td>
                  {entries.map((e, i) => (
                    <td
                      key={e.label}
                      className={`py-2.5 px-3 text-right font-mono text-sm ${
                        best !== null && values[i] === best ? 'text-emerald-400 font-bold' : 'text-slate-300'
                      }`}
                    >
                      {row.fmt(values[i])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-slate-600 font-mono">
        <p>* Green = best per metric · 기간은 현재 설정으로 통일, 매수방식·금액·리밸런싱은 각 저장본 설정 (미저장 구버전은 현재 설정)</p>
      </div>
    </div>
  );
}
