import type { BacktestResult } from '../types';

interface Props {
  result: BacktestResult;
}

export function MetricsTable({ result }: Props) {
  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const formatNumber = (value: number) => value.toFixed(2);

  const metrics = [
    {
      name: 'CAGR (연평균 수익률)',
      portfolio: result.metrics.cagr,
      qqq: result.benchmark_metrics.QQQ.cagr,
      spy: result.benchmark_metrics.SPY.cagr,
      format: formatPercent,
      better: 'higher',
    },
    {
      name: 'MDD (최대 낙폭)',
      portfolio: result.metrics.mdd,
      qqq: result.benchmark_metrics.QQQ.mdd,
      spy: result.benchmark_metrics.SPY.mdd,
      format: formatPercent,
      better: 'lower',
    },
    {
      name: 'Sharpe Ratio',
      portfolio: result.metrics.sharpe_ratio,
      qqq: result.benchmark_metrics.QQQ.sharpe_ratio,
      spy: result.benchmark_metrics.SPY.sharpe_ratio,
      format: formatNumber,
      better: 'higher',
    },
    {
      name: 'Volatility (변동성)',
      portfolio: result.metrics.volatility,
      qqq: result.benchmark_metrics.QQQ.volatility,
      spy: result.benchmark_metrics.SPY.volatility,
      format: formatPercent,
      better: 'lower',
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
              <th className="text-right py-3 px-4 text-red-500 font-medium">
                QQQ
              </th>
              <th className="text-right py-3 px-4 text-green-600 font-medium">
                SPY
              </th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const values = [metric.portfolio, metric.qqq, metric.spy];
              return (
                <tr key={metric.name} className="border-b border-gray-100">
                  <td className="py-3 px-4 text-gray-700">{metric.name}</td>
                  <td
                    className={`py-3 px-4 text-right ${getBestClass(
                      metric.portfolio,
                      values,
                      metric.better as 'higher' | 'lower'
                    )}`}
                  >
                    {metric.format(metric.portfolio)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right ${getBestClass(
                      metric.qqq,
                      values,
                      metric.better as 'higher' | 'lower'
                    )}`}
                  >
                    {metric.format(metric.qqq)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right ${getBestClass(
                      metric.spy,
                      values,
                      metric.better as 'higher' | 'lower'
                    )}`}
                  >
                    {metric.format(metric.spy)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <p>* 녹색 배경: 해당 지표에서 가장 좋은 성과</p>
      </div>
    </div>
  );
}
