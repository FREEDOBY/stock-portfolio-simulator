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
import type { BacktestResult, BenchmarkType } from '../types';

interface Props {
  result: BacktestResult;
  selectedBenchmarks: BenchmarkType[];
  onBenchmarkChange: (benchmarks: BenchmarkType[]) => void;
}

const BENCHMARK_CONFIG: Record<BenchmarkType, { color: string; label: string }> = {
  QQQ: { color: '#ef4444', label: 'QQQ (나스닥 100)' },
  SPY: { color: '#22c55e', label: 'SPY (S&P 500)' },
};

export function PerformanceChart({ result, selectedBenchmarks, onBenchmarkChange }: Props) {
  // 벤치마크 토글
  const toggleBenchmark = (benchmark: BenchmarkType) => {
    onBenchmarkChange(
      selectedBenchmarks.includes(benchmark)
        ? selectedBenchmarks.filter((b) => b !== benchmark)
        : [...selectedBenchmarks, benchmark]
    );
  };

  // 데이터 병합
  const chartData = result.portfolio_values.map((pv, index) => {
    const dataPoint: Record<string, string | number | undefined> = {
      date: pv.date,
      포트폴리오: pv.value,
    };

    if (selectedBenchmarks.includes('QQQ')) {
      dataPoint.QQQ = result.benchmarks.QQQ[index]?.value;
    }
    if (selectedBenchmarks.includes('SPY')) {
      dataPoint.SPY = result.benchmarks.SPY[index]?.value;
    }

    return dataPoint;
  });

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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">성과 차트</h2>

        {/* 벤치마크 선택 */}
        <div className="flex gap-2">
          {(Object.keys(BENCHMARK_CONFIG) as BenchmarkType[]).map((benchmark) => (
            <button
              key={benchmark}
              onClick={() => toggleBenchmark(benchmark)}
              className={`px-3 py-1.5 text-sm rounded-lg border-2 transition-all ${
                selectedBenchmarks.includes(benchmark)
                  ? 'border-current font-semibold'
                  : 'border-gray-300 text-gray-400'
              }`}
              style={{
                color: selectedBenchmarks.includes(benchmark)
                  ? BENCHMARK_CONFIG[benchmark].color
                  : undefined,
                borderColor: selectedBenchmarks.includes(benchmark)
                  ? BENCHMARK_CONFIG[benchmark].color
                  : undefined,
              }}
            >
              {benchmark}
            </button>
          ))}
        </div>
      </div>

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
            {selectedBenchmarks.includes('QQQ') && (
              <Line
                type="monotone"
                dataKey="QQQ"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
            )}
            {selectedBenchmarks.includes('SPY') && (
              <Line
                type="monotone"
                dataKey="SPY"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
