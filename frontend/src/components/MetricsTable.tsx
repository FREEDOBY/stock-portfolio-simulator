import { useState } from 'react';
import type { BacktestResult, BenchmarkType } from '../types';

interface Props {
  result: BacktestResult;
  selectedBenchmarks: BenchmarkType[];
}

interface MetricInfo {
  name: string;
  description: string;
  formula: string;
  interpretation: string;
}

const metricInfos: Record<string, MetricInfo> = {
  'CAGR': {
    name: 'CAGR',
    description: 'Compound Annual Growth Rate',
    formula: 'CAGR = (Final/Initial)^(1/years) - 1',
    interpretation: 'Higher is better. Annualized return rate.',
  },
  'MDD': {
    name: 'MDD',
    description: 'Maximum Drawdown',
    formula: 'MDD = (Peak - Trough) / Peak',
    interpretation: 'Lower is better. Max decline from peak.',
  },
  'SHARPE': {
    name: 'Sharpe Ratio',
    description: 'Risk-adjusted Return',
    formula: 'Sharpe = (R - Rf) / StdDev x sqrt(252)',
    interpretation: '>1 good, >2 excellent.',
  },
  'VOL': {
    name: 'Volatility',
    description: 'Annual Volatility',
    formula: 'Vol = DailyStdDev x sqrt(252)',
    interpretation: 'Lower = more stable.',
  },
};

export function MetricsTable({ result, selectedBenchmarks }: Props) {
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const formatNumber = (value: number) => value.toFixed(2);

  const getMetricValue = (metricKey: string, benchmark: BenchmarkType) => {
    const benchmarkMetrics = result.benchmark_metrics[benchmark];
    switch (metricKey) {
      case 'CAGR': return benchmarkMetrics.cagr;
      case 'MDD': return benchmarkMetrics.mdd;
      case 'SHARPE': return benchmarkMetrics.sharpe_ratio;
      case 'VOL': return benchmarkMetrics.volatility;
      default: return 0;
    }
  };

  const metrics = [
    { key: 'CAGR', label: 'CAGR', portfolio: result.metrics.cagr, format: formatPercent, better: 'higher' as const },
    { key: 'MDD', label: 'MDD', portfolio: result.metrics.mdd, format: formatPercent, better: 'lower' as const },
    { key: 'SHARPE', label: 'SHARPE', portfolio: result.metrics.sharpe_ratio, format: formatNumber, better: 'higher' as const },
    { key: 'VOL', label: 'VOL', portfolio: result.metrics.volatility, format: formatPercent, better: 'lower' as const },
  ];

  const getBestClass = (
    value: number,
    values: number[],
    better: 'higher' | 'lower'
  ) => {
    const best = better === 'higher' ? Math.max(...values) : Math.min(...values);
    return value === best ? 'text-emerald-400 font-bold' : 'text-slate-300';
  };

  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">Metrics</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-3 text-slate-500 font-mono text-sm uppercase">
                Metric
              </th>
              <th className="text-right py-2 px-3 text-emerald-400 font-mono text-sm">
                PORTFOLIO
              </th>
              {selectedBenchmarks.includes('QQQ') && (
                <th className="text-right py-2 px-3 text-orange-400 font-mono text-sm">
                  QQQ
                </th>
              )}
              {selectedBenchmarks.includes('SPY') && (
                <th className="text-right py-2 px-3 text-violet-400 font-mono text-sm">
                  SPY
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const values = [
                metric.portfolio,
                ...selectedBenchmarks.map((b) => getMetricValue(metric.key, b)),
              ];
              const info = metricInfos[metric.key];
              return (
                <tr
                  key={metric.key}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-help relative"
                  onMouseEnter={() => setHoveredMetric(metric.key)}
                  onMouseLeave={() => setHoveredMetric(null)}
                >
                  <td className="py-2.5 px-3 text-slate-400 font-mono text-sm relative">
                    <span className="flex items-center gap-1.5">
                      {metric.label}
                      <svg
                        className="w-3 h-3 text-slate-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </span>
                    {hoveredMetric === metric.key && info && (
                      <div className="absolute left-0 top-full mt-1 z-50 w-72 p-3 bg-[#1a1f2e] border border-slate-600/50 text-sm rounded shadow-xl shadow-black/50">
                        <p className="font-bold text-cyan-400 mb-1 text-xs">
                          {info.description}
                        </p>
                        <p className="text-slate-400 mb-2 font-mono text-xs bg-[#0a0e17] p-2 rounded">
                          {info.formula}
                        </p>
                        <p className="text-slate-500 text-xs">
                          {info.interpretation}
                        </p>
                      </div>
                    )}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-mono text-sm transition-colors ${getBestClass(
                      metric.portfolio,
                      values,
                      metric.better
                    )}`}
                  >
                    {metric.format(metric.portfolio)}
                  </td>
                  {selectedBenchmarks.includes('QQQ') && (
                    <td
                      className={`py-2.5 px-3 text-right font-mono text-sm transition-colors ${getBestClass(
                        getMetricValue(metric.key, 'QQQ'),
                        values,
                        metric.better
                      )}`}
                    >
                      {metric.format(getMetricValue(metric.key, 'QQQ'))}
                    </td>
                  )}
                  {selectedBenchmarks.includes('SPY') && (
                    <td
                      className={`py-2.5 px-3 text-right font-mono text-sm transition-colors ${getBestClass(
                        getMetricValue(metric.key, 'SPY'),
                        values,
                        metric.better
                      )}`}
                    >
                      {metric.format(getMetricValue(metric.key, 'SPY'))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 투자 요약 */}
      <div className="mt-5 pt-4 border-t border-slate-700/30">
        <h3 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider font-mono">Summary</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#0d1117] border border-slate-700/30 rounded p-3">
            <p className="text-xs text-slate-500 font-mono mb-1">INVESTED</p>
            <p className="text-lg font-bold text-slate-200 font-mono">
              ${result.total_invested.toLocaleString()}
            </p>
          </div>
          <div className="bg-[#0d1117] border border-slate-700/30 rounded p-3">
            <p className="text-xs text-slate-500 font-mono mb-1">FINAL VALUE</p>
            <p className="text-lg font-bold text-slate-200 font-mono">
              $
              {result.portfolio_values[
                result.portfolio_values.length - 1
              ].value.toLocaleString()}
            </p>
          </div>
          <div className="bg-[#0d1117] border border-slate-700/30 rounded p-3">
            <p className="text-xs text-slate-500 font-mono mb-1">P&L</p>
            {(() => {
              const finalValue =
                result.portfolio_values[result.portfolio_values.length - 1].value;
              const profit = finalValue - result.total_invested;
              const profitPercent =
                ((finalValue / result.total_invested) - 1) * 100;
              const isPositive = profit >= 0;
              return (
                <p
                  className={`text-lg font-bold font-mono ${
                    isPositive ? 'text-emerald-400 glow-green' : 'text-red-400 glow-red'
                  }`}
                >
                  {isPositive ? '+' : ''}${profit.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{' '}
                  <span className="text-xs">
                    ({isPositive ? '+' : ''}
                    {profitPercent.toFixed(1)}%)
                  </span>
                </p>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-600 font-mono">
        <p>* Green highlight = best performer per metric</p>
      </div>
    </div>
  );
}
