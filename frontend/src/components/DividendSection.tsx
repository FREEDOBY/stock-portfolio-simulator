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
import type { DividendStats, PortfolioItem } from '../types';
import { generateFullYearChartData } from '../utils/dividendChartUtils';
import { isKoreanSymbol } from '../utils/stockUtils';

interface Props {
  dividendStats: DividendStats;
  portfolio?: PortfolioItem[];
}

// ETF별 고정 색상 (자주 사용되는 ETF)
const ETF_COLORS: Record<string, string> = {
  SCHD: '#3b82f6',  // 파랑
  VYM: '#22c55e',   // 초록
  VIG: '#f59e0b',   // 노랑
  DVY: '#ef4444',   // 빨강
  SPY: '#8b5cf6',   // 보라
  QQQ: '#ec4899',   // 핑크
  VTI: '#06b6d4',   // 청록
  VOO: '#84cc16',   // 라임
};

// 동적 할당용 색상 팔레트 (충분히 구분되는 색상들)
const COLOR_PALETTE = [
  '#3b82f6',  // blue
  '#22c55e',  // green
  '#f59e0b',  // amber
  '#ef4444',  // red
  '#8b5cf6',  // violet
  '#ec4899',  // pink
  '#06b6d4',  // cyan
  '#84cc16',  // lime
  '#f97316',  // orange
  '#14b8a6',  // teal
  '#a855f7',  // purple
  '#eab308',  // yellow
  '#0ea5e9',  // sky
  '#10b981',  // emerald
  '#f43f5e',  // rose
  '#6366f1',  // indigo
];

// 동적 색상 맵 (컴포넌트 레벨에서 관리)
const dynamicColorMap = new Map<string, string>();
let colorIndex = 0;

const getEtfColor = (symbol: string): string => {
  // 1. 고정 색상이 있으면 사용
  if (ETF_COLORS[symbol]) {
    return ETF_COLORS[symbol];
  }

  // 2. 이미 할당된 동적 색상이 있으면 사용
  if (dynamicColorMap.has(symbol)) {
    return dynamicColorMap.get(symbol)!;
  }

  // 3. 새로운 색상 할당 (고정 색상과 겹치지 않는 색상 선택)
  const usedColors = new Set([...Object.values(ETF_COLORS), ...dynamicColorMap.values()]);
  for (let i = 0; i < COLOR_PALETTE.length; i++) {
    const color = COLOR_PALETTE[(colorIndex + i) % COLOR_PALETTE.length];
    if (!usedColors.has(color)) {
      dynamicColorMap.set(symbol, color);
      colorIndex = (colorIndex + i + 1) % COLOR_PALETTE.length;
      return color;
    }
  }

  // 4. 모든 색상이 사용 중이면 순환
  const fallbackColor = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
  dynamicColorMap.set(symbol, fallbackColor);
  colorIndex = (colorIndex + 1) % COLOR_PALETTE.length;
  return fallbackColor;
};

const formatCurrency = (value: number): string => {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function DividendSection({ dividendStats, portfolio = [] }: Props) {
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // symbol → name 매핑 (한국 종목 이름 표시용)
  const symbolToName = useMemo(() => {
    const map: Record<string, string> = {};
    portfolio.forEach((item) => {
      map[item.symbol] = item.name;
    });
    return map;
  }, [portfolio]);

  // 종목 표시명 반환 (한국 종목은 이름, 해외는 심볼)
  const getDisplayName = (symbol: string): string => {
    if (isKoreanSymbol(symbol) && symbolToName[symbol]) {
      return symbolToName[symbol];
    }
    return symbol;
  };

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

  // 선택된 기간의 통계 계산 (총 배당, 평균, ETF별 배당, 수익률)
  const periodStats = useMemo(() => {
    const total = filteredData.reduce((sum, d) => sum + d.amount, 0);
    const avg = filteredData.length > 0 ? total / filteredData.length : 0;

    // ETF별 배당 합계 (선택된 기간)
    const byEtf: Record<string, number> = {};
    filteredData.forEach((d) => {
      Object.entries(d.by_etf).forEach(([etf, amount]) => {
        byEtf[etf] = (byEtf[etf] || 0) + amount;
      });
    });

    // 배당 수익률 (전체 배당금 대비 비율로 계산)
    const yieldRate = dividendStats.total_dividends > 0
      ? (total / dividendStats.total_dividends) * dividendStats.dividend_yield
      : 0;

    return { total, avg, byEtf, yieldRate };
  }, [filteredData, dividendStats.total_dividends, dividendStats.dividend_yield]);

  // ETF 목록 (by_etf에서 추출) - chartData보다 먼저 정의
  const etfList = useMemo(() => {
    return Object.keys(dividendStats.by_etf).filter(
      (k) => dividendStats.by_etf[k] > 0
    );
  }, [dividendStats.by_etf]);

  // 차트 데이터 변환 (연도 선택 시 12개월 전체 표시)
  const chartData = useMemo(() => {
    if (selectedYear !== 'all') {
      // 특정 연도 선택: 12개월 전체 표시 (배당 없는 월도 0으로)
      return generateFullYearChartData(selectedYear, dividendStats.monthly_data, etfList);
    }
    // 전체 선택: 기존 방식 (실제 데이터만)
    return filteredData.map((d) => ({
      month: d.month.substring(5), // "MM" 형태로 변환
      fullMonth: d.month,
      amount: d.amount,
      ...d.by_etf,
    }));
  }, [filteredData, selectedYear, dividendStats.monthly_data, etfList]);

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
            {(selectedYear === 'all'
              ? dividendStats.dividend_yield
              : periodStats.yieldRate
            ).toFixed(2)}%
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
                    name={getDisplayName(etf)}
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
            ETF별 배당 {selectedYear !== 'all' && `(${selectedYear}년)`}
          </h3>
          <div className="flex flex-wrap gap-3">
            {etfList.map((etf) => {
              const amount = selectedYear === 'all'
                ? dividendStats.by_etf[etf]
                : (periodStats.byEtf[etf] || 0);
              return (
                <div
                  key={etf}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg"
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getEtfColor(etf) }}
                  />
                  <span className="text-sm text-gray-700">{getDisplayName(etf)}</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
