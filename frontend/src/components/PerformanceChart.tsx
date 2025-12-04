import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { BacktestResult } from '../types';

interface Props {
  result: BacktestResult;
}

export function PerformanceChart({ result }: Props) {
  // 데이터 병합
  const chartData = result.portfolio_values.map((pv, index) => ({
    date: pv.date,
    포트폴리오: pv.value,
    QQQ: result.benchmarks.QQQ[index]?.value,
    SPY: result.benchmarks.SPY[index]?.value,
  }));

  // 날짜 포맷
  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // 금액 포맷
  const formatValue = (value: number) => {
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">성과 차트</h2>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number) => formatValue(value)}
              labelFormatter={(label) => `날짜: ${label}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="포트폴리오"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="QQQ"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="SPY"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
