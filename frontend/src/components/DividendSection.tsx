import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { DividendStats } from '../types';

interface Props {
  dividendStats: DividendStats;
}

// ETF별 색상
const ETF_COLORS: Record<string, string> = {
  SCHD: '#3b82f6',
  VYM: '#22c55e',
  VIG: '#f59e0b',
  DVY: '#ef4444',
  SPY: '#8b5cf6',
  QQQ: '#ec4899',
  VTI: '#06b6d4',
  VOO: '#84cc16',
};

const getEtfColor = (symbol: string): string => {
  return ETF_COLORS[symbol] || '#6b7280';
};

const formatCurrency = (value: number): string => {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function DividendSection({ dividendStats }: Props) {
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // 연도 목록 추출
  const years = useMemo(() => {
    const yearSet = new Set<string>();
    dividendStats.monthly_data.forEach((d) => {
      const year = d.month.split('-')[0];
      yearSet.add(year);
    });
    return Array.from(yearSet).sort();
  }, [dividendStats.monthly_data]);

  // 선택된 연도의 데이터 필터링
  const filteredData = useMemo(() => {
    if (selectedYear === 'all') {
      return dividendStats.monthly_data;
    }
    return dividendStats.monthly_data.filter((d) =>
      d.month.startsWith(selectedYear)
    );
  }, [dividendStats.monthly_data, selectedYear]);

  // 선택된 기간의 통계 계산
  const periodStats = useMemo(() => {
    const total = filteredData.reduce((sum, d) => sum + d.amount, 0);
    const avg = filteredData.length > 0 ? total / filteredData.length : 0;
    return { total, avg };
  }, [filteredData]);

  // 차트 데이터 변환
  const chartData = useMemo(() => {
    return filteredData.map((d) => ({
      month: d.month.substring(5), // "MM" 형태로 변환
      fullMonth: d.month,
      amount: d.amount,
      ...d.by_etf,
    }));
  }, [filteredData]);

  // ETF 목록 (by_etf에서 추출)
  const etfList = useMemo(() => {
    return Object.keys(dividendStats.by_etf).filter(
      (k) => dividendStats.by_etf[k] > 0
    );
  }, [dividendStats.by_etf]);

  // 배당이 없으면 표시하지 않음
  if (dividendStats.total_dividends === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">배당 통계</h2>
        <p className="text-gray-500 text-center py-8">
          선택한 기간 동안 배당 데이터가 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">배당 통계</h2>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-600 mb-1">총 배당금</p>
          <p className="text-2xl font-bold text-blue-700">
            {formatCurrency(
              selectedYear === 'all'
                ? dividendStats.total_dividends
                : periodStats.total
            )}
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-green-600 mb-1">배당 수익률</p>
          <p className="text-2xl font-bold text-green-700">
            {dividendStats.dividend_yield.toFixed(2)}%
          </p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-purple-600 mb-1">월평균 배당</p>
          <p className="text-2xl font-bold text-purple-700">
            {formatCurrency(
              selectedYear === 'all'
                ? dividendStats.monthly_average
                : periodStats.avg
            )}
          </p>
        </div>
      </div>

      {/* 연도 탭 */}
      {years.length > 1 && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSelectedYear('all')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
              selectedYear === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체
          </button>
          {years.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                selectedYear === year
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* 월별 차트 */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis
              dataKey={selectedYear === 'all' ? 'fullMonth' : 'month'}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => `$${v}`}
              tick={{ fontSize: 11 }}
              width={50}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === 'amount' ? '총 배당' : name,
              ]}
              labelFormatter={(label) => `${label}`}
            />
            {etfList.length > 1 ? (
              <>
                <Legend />
                {etfList.map((etf) => (
                  <Bar
                    key={etf}
                    dataKey={etf}
                    stackId="a"
                    fill={getEtfColor(etf)}
                    name={etf}
                  />
                ))}
              </>
            ) : (
              <Bar dataKey="amount" fill="#3b82f6" name="배당금">
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={etfList[0] ? getEtfColor(etfList[0]) : '#3b82f6'}
                  />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ETF별 배당 비중 */}
      {etfList.length > 1 && (
        <div className="mt-4 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">
            ETF별 총 배당
          </h3>
          <div className="flex flex-wrap gap-3">
            {etfList.map((etf) => (
              <div
                key={etf}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg"
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getEtfColor(etf) }}
                />
                <span className="text-sm text-gray-700">{etf}</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(dividendStats.by_etf[etf])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
