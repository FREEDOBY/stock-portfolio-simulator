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

const ETF_COLORS: Record<string, string> = {
  SCHD: '#00d4aa',
  VYM: '#a78bfa',
  VIG: '#f97316',
  DVY: '#f43f5e',
  SPY: '#06b6d4',
  QQQ: '#eab308',
  VTI: '#ec4899',
  VOO: '#84cc16',
};

const COLOR_PALETTE = [
  '#00d4aa',
  '#a78bfa',
  '#f97316',
  '#f43f5e',
  '#06b6d4',
  '#eab308',
  '#ec4899',
  '#84cc16',
  '#3b82f6',
  '#14b8a6',
  '#a855f7',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#6366f1',
  '#e11d48',
];

const dynamicColorMap = new Map<string, string>();
let colorIndex = 0;

const getEtfColor = (symbol: string): string => {
  if (ETF_COLORS[symbol]) return ETF_COLORS[symbol];
  if (dynamicColorMap.has(symbol)) return dynamicColorMap.get(symbol)!;

  const usedColors = new Set([...Object.values(ETF_COLORS), ...dynamicColorMap.values()]);
  for (let i = 0; i < COLOR_PALETTE.length; i++) {
    const color = COLOR_PALETTE[(colorIndex + i) % COLOR_PALETTE.length];
    if (!usedColors.has(color)) {
      dynamicColorMap.set(symbol, color);
      colorIndex = (colorIndex + i + 1) % COLOR_PALETTE.length;
      return color;
    }
  }

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

  const symbolToName = useMemo(() => {
    const map: Record<string, string> = {};
    portfolio.forEach((item) => {
      map[item.symbol] = item.name;
    });
    return map;
  }, [portfolio]);

  const getDisplayName = (symbol: string): string => {
    if (isKoreanSymbol(symbol) && symbolToName[symbol]) {
      return symbolToName[symbol];
    }
    return symbol;
  };

  const years = useMemo(() => {
    const yearSet = new Set<string>();
    dividendStats.monthly_data.forEach((d) => {
      const year = d.month.split('-')[0];
      yearSet.add(year);
    });
    return Array.from(yearSet).sort();
  }, [dividendStats.monthly_data]);

  const filteredData = useMemo(() => {
    if (selectedYear === 'all') return dividendStats.monthly_data;
    return dividendStats.monthly_data.filter((d) =>
      d.month.startsWith(selectedYear)
    );
  }, [dividendStats.monthly_data, selectedYear]);

  const periodStats = useMemo(() => {
    const total = filteredData.reduce((sum, d) => sum + d.amount, 0);
    const avg = filteredData.length > 0 ? total / filteredData.length : 0;

    const byEtf: Record<string, number> = {};
    filteredData.forEach((d) => {
      Object.entries(d.by_etf).forEach(([etf, amount]) => {
        byEtf[etf] = (byEtf[etf] || 0) + amount;
      });
    });

    const yieldRate = dividendStats.total_dividends > 0
      ? (total / dividendStats.total_dividends) * dividendStats.dividend_yield
      : 0;

    return { total, avg, byEtf, yieldRate };
  }, [filteredData, dividendStats.total_dividends, dividendStats.dividend_yield]);

  const etfList = useMemo(() => {
    return Object.keys(dividendStats.by_etf).filter(
      (k) => dividendStats.by_etf[k] > 0
    );
  }, [dividendStats.by_etf]);

  const chartData = useMemo(() => {
    if (selectedYear !== 'all') {
      return generateFullYearChartData(selectedYear, dividendStats.monthly_data, etfList);
    }
    return filteredData.map((d) => ({
      month: d.month.substring(5),
      fullMonth: d.month,
      amount: d.amount,
      ...d.by_etf,
    }));
  }, [filteredData, selectedYear, dividendStats.monthly_data, etfList]);

  if (dividendStats.total_dividends === 0) {
    return (
      <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">Dividends</h2>
        </div>
        <p className="text-slate-600 text-center py-8 text-sm font-mono">
          No dividend data for selected period
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">Dividends</h2>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[#0d1117] border border-emerald-500/20 rounded p-3">
          <p className="text-xs text-emerald-400/70 font-mono mb-1">TOTAL</p>
          <p className="text-lg font-bold text-emerald-400 font-mono">
            {formatCurrency(
              selectedYear === 'all'
                ? dividendStats.total_dividends
                : periodStats.total
            )}
          </p>
        </div>
        <div className="bg-[#0d1117] border border-cyan-500/20 rounded p-3">
          <p className="text-xs text-cyan-400/70 font-mono mb-1">YIELD</p>
          <p className="text-lg font-bold text-cyan-400 font-mono">
            {(selectedYear === 'all'
              ? dividendStats.dividend_yield
              : periodStats.yieldRate
            ).toFixed(2)}%
          </p>
        </div>
        <div className="bg-[#0d1117] border border-violet-500/20 rounded p-3">
          <p className="text-xs text-violet-400/70 font-mono mb-1">AVG/MO</p>
          <p className="text-lg font-bold text-violet-400 font-mono">
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
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setSelectedYear('all')}
            className={`px-2.5 py-1 text-xs rounded font-mono transition-all ${
              selectedYear === 'all'
                ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400'
                : 'bg-[#0a0e17] border border-slate-700/50 text-slate-500 hover:border-slate-600'
            }`}
          >
            ALL
          </button>
          {years.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-2.5 py-1 text-xs rounded font-mono transition-all ${
                selectedYear === year
                  ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400'
                  : 'bg-[#0a0e17] border border-slate-700/50 text-slate-500 hover:border-slate-600'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* 월별 차트 */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey={selectedYear === 'all' ? 'fullMonth' : 'month'}
              tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
              stroke="#1e293b"
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => `$${v}`}
              tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
              stroke="#1e293b"
              width={50}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrency(value),
                name === 'amount' ? 'Total' : name,
              ]}
              labelFormatter={(label) => `${label}`}
              contentStyle={{
                backgroundColor: '#1a1f2e',
                border: '1px solid rgba(100, 116, 139, 0.3)',
                borderRadius: '4px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '13px',
                color: '#e2e8f0',
              }}
            />
            {etfList.length > 1 ? (
              <>
                <Legend
                  wrapperStyle={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '12px',
                  }}
                />
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
              <Bar dataKey="amount" fill="#00d4aa" name="Dividend">
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={etfList[0] ? getEtfColor(etfList[0]) : '#00d4aa'}
                  />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ETF별 배당 비중 */}
      {etfList.length > 1 && (
        <div className="mt-4 pt-3 border-t border-slate-700/30">
          <h3 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider font-mono">
            By ETF {selectedYear !== 'all' && `(${selectedYear})`}
          </h3>
          <div className="flex flex-wrap gap-2">
            {etfList.map((etf) => {
              const amount = selectedYear === 'all'
                ? dividendStats.by_etf[etf]
                : (periodStats.byEtf[etf] || 0);
              return (
                <div
                  key={etf}
                  className="flex items-center gap-2 px-2.5 py-1 bg-[#0d1117] border border-slate-700/30 rounded"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getEtfColor(etf) }}
                  />
                  <span className="text-xs text-slate-400 font-mono">{getDisplayName(etf)}</span>
                  <span className="text-xs font-bold text-slate-300 font-mono">
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
