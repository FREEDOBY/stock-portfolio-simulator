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
  'CAGR (연평균 수익률)': {
    name: 'CAGR',
    description: 'Compound Annual Growth Rate (연평균 복합 성장률)',
    formula: 'CAGR = (최종자산 / 투자원금)^(1/년수) - 1',
    interpretation: '높을수록 좋음. 연간 평균 수익률을 나타냄',
  },
  'MDD (최대 낙폭)': {
    name: 'MDD',
    description: 'Maximum Drawdown (최대 낙폭)',
    formula: 'MDD = (고점 - 저점) / 고점',
    interpretation: '낮을수록 좋음. 최고점 대비 최대 하락폭',
  },
  'Sharpe Ratio': {
    name: 'Sharpe Ratio',
    description: '위험 대비 수익률 (샤프 비율)',
    formula: 'Sharpe = (수익률 - 무위험수익률) / 표준편차 × √252',
    interpretation: '높을수록 좋음. 1 이상이면 양호, 2 이상이면 우수',
  },
  'Volatility (변동성)': {
    name: 'Volatility',
    description: '연간 변동성 (Annual Volatility)',
    formula: 'Volatility = 일간수익률 표준편차 × √252',
    interpretation: '낮을수록 안정적. 가격 변동의 크기를 나타냄',
  },
};

const BENCHMARK_COLORS: Record<BenchmarkType, string> = {
  QQQ: 'text-red-500',
  SPY: 'text-green-600',
};

export function MetricsTable({ result, selectedBenchmarks }: Props) {
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const formatNumber = (value: number) => value.toFixed(2);

  const getMetricValue = (metricName: string, benchmark: BenchmarkType) => {
    const benchmarkMetrics = result.benchmark_metrics[benchmark];
    switch (metricName) {
      case 'CAGR (연평균 수익률)':
        return benchmarkMetrics.cagr;
      case 'MDD (최대 낙폭)':
        return benchmarkMetrics.mdd;
      case 'Sharpe Ratio':
        return benchmarkMetrics.sharpe_ratio;
      case 'Volatility (변동성)':
        return benchmarkMetrics.volatility;
      default:
        return 0;
    }
  };

  const metrics = [
    {
      name: 'CAGR (연평균 수익률)',
      portfolio: result.metrics.cagr,
      format: formatPercent,
      better: 'higher' as const,
    },
    {
      name: 'MDD (최대 낙폭)',
      portfolio: result.metrics.mdd,
      format: formatPercent,
      better: 'lower' as const,
    },
    {
      name: 'Sharpe Ratio',
      portfolio: result.metrics.sharpe_ratio,
      format: formatNumber,
      better: 'higher' as const,
    },
    {
      name: 'Volatility (변동성)',
      portfolio: result.metrics.volatility,
      format: formatPercent,
      better: 'lower' as const,
    },
  ];

  const getBestClass = (
    value: number,
    values: number[],
    better: 'higher' | 'lower'
  ) => {
    const best = better === 'higher' ? Math.max(...values) : Math.min(...values);
    return value === best ? 'bg-green-100 font-semibold' : '';
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">성과 지표</h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-gray-600 font-medium">
                지표
              </th>
              <th className="text-right py-3 px-4 text-blue-600 font-medium">
                내 포트폴리오
              </th>
              {selectedBenchmarks.includes('QQQ') && (
                <th className="text-right py-3 px-4 text-red-500 font-medium">
                  QQQ
                </th>
              )}
              {selectedBenchmarks.includes('SPY') && (
                <th className="text-right py-3 px-4 text-green-600 font-medium">
                  SPY
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const values = [
                metric.portfolio,
                ...selectedBenchmarks.map((b) => getMetricValue(metric.name, b)),
              ];
              const info = metricInfos[metric.name];
              return (
                <tr
                  key={metric.name}
                  className="border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-help relative"
                  onMouseEnter={() => setHoveredMetric(metric.name)}
                  onMouseLeave={() => setHoveredMetric(null)}
                >
                  <td className="py-3 px-4 text-gray-700 relative">
                    <span className="flex items-center gap-1">
                      {metric.name}
                      <svg
                        className="w-4 h-4 text-gray-400"
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
                    {/* 툴팁 */}
                    {hoveredMetric === metric.name && info && (
                      <div className="absolute left-0 top-full mt-1 z-50 w-72 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl">
                        <p className="font-semibold text-blue-300 mb-1">
                          {info.description}
                        </p>
                        <p className="text-gray-300 mb-2 font-mono text-xs bg-gray-800 p-2 rounded">
                          {info.formula}
                        </p>
                        <p className="text-gray-400 text-xs">
                          {info.interpretation}
                        </p>
                        <div className="absolute -top-2 left-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-gray-900" />
                      </div>
                    )}
                  </td>
                  <td
                    className={`py-3 px-4 text-right transition-colors ${getBestClass(
                      metric.portfolio,
                      values,
                      metric.better
                    )}`}
                  >
                    {metric.format(metric.portfolio)}
                  </td>
                  {selectedBenchmarks.includes('QQQ') && (
                    <td
                      className={`py-3 px-4 text-right transition-colors ${getBestClass(
                        getMetricValue(metric.name, 'QQQ'),
                        values,
                        metric.better
                      )}`}
                    >
                      {metric.format(getMetricValue(metric.name, 'QQQ'))}
                    </td>
                  )}
                  {selectedBenchmarks.includes('SPY') && (
                    <td
                      className={`py-3 px-4 text-right transition-colors ${getBestClass(
                        getMetricValue(metric.name, 'SPY'),
                        values,
                        metric.better
                      )}`}
                    >
                      {metric.format(getMetricValue(metric.name, 'SPY'))}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 투자 요약 */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">투자 요약</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
            <p className="text-sm text-gray-500">총 투자 원금</p>
            <p className="text-xl font-bold text-gray-800">
              ${result.total_invested.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
            <p className="text-sm text-gray-500">최종 자산</p>
            <p className="text-xl font-bold text-gray-800">
              $
              {result.portfolio_values[
                result.portfolio_values.length - 1
              ].value.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
            <p className="text-sm text-gray-500">총 수익</p>
            {(() => {
              const finalValue =
                result.portfolio_values[result.portfolio_values.length - 1].value;
              const profit = finalValue - result.total_invested;
              const profitPercent =
                ((finalValue / result.total_invested) - 1) * 100;
              const isPositive = profit >= 0;
              return (
                <p
                  className={`text-xl font-bold ${
                    isPositive ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {isPositive ? '+' : ''}${profit.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{' '}
                  <span className="text-sm">
                    ({isPositive ? '+' : ''}
                    {profitPercent.toFixed(1)}%)
                  </span>
                </p>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <p>* 녹색 배경: 해당 지표에서 가장 좋은 성과 | 지표 위에 마우스를 올리면 설명을 볼 수 있습니다</p>
      </div>
    </div>
  );
}
