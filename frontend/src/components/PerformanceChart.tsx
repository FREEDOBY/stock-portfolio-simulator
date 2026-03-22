import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { BacktestResult, BenchmarkType } from '../types';
import {
  calculateReturns,
  calculateExcessReturns,
  findUnderperformanceRanges,
  formatReturnValue,
  formatCurrency,
  formatYAxisCurrency,
  formatYAxisReturn,
  formatDate,
  type UnderperformanceRange,
} from '../utils/chartUtils';

interface Props {
  result: BacktestResult;
  selectedBenchmarks: BenchmarkType[];
  onBenchmarkChange: (benchmarks: BenchmarkType[]) => void;
}

type ViewMode = 'absolute' | 'returns';

const BENCHMARK_CONFIG: Record<
  BenchmarkType,
  { color: string; label: string; areaColor: string }
> = {
  QQQ: {
    color: '#f97316',
    label: 'QQQ (NASDAQ 100)',
    areaColor: 'rgba(249, 115, 22, 0.1)',
  },
  SPY: {
    color: '#a78bfa',
    label: 'SPY (S&P 500)',
    areaColor: 'rgba(167, 139, 250, 0.1)',
  },
};

const PORTFOLIO_COLOR = '#00d4aa';

// 줌 설정
const ZOOM_CONFIG = {
  MIN_VISIBLE_POINTS: 10,
  ZOOM_FACTOR: 0.1,
  THROTTLE_MS: 16,
} as const;

function throttle(
  func: (e: WheelEvent) => void,
  limit: number
): (e: WheelEvent) => void {
  let inThrottle = false;
  return (e: WheelEvent) => {
    if (!inThrottle) {
      func(e);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

interface ZoomState {
  startIndex: number;
  endIndex: number;
}

interface ChartDataPoint {
  date: string;
  포트폴리오: number;
  portfolioReturn: number;
  QQQ?: number;
  SPY?: number;
  QQQReturn?: number;
  SPYReturn?: number;
  excessReturnQQQ?: number;
  excessReturnSPY?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string; payload: ChartDataPoint }>;
  label?: string;
  viewMode: ViewMode;
  selectedBenchmarks: BenchmarkType[];
}

function CustomTooltip({
  active,
  payload,
  label,
  viewMode,
  selectedBenchmarks,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload as ChartDataPoint;
  if (!data) return null;

  return (
    <div className="bg-[#1a1f2e] border border-slate-600/50 rounded p-3 text-sm shadow-xl shadow-black/50">
      <p className="font-mono text-slate-400 mb-2 border-b border-slate-700/50 pb-1 text-xs">{label}</p>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center gap-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded" style={{ backgroundColor: PORTFOLIO_COLOR }} />
            <span className="text-slate-400 text-xs font-mono">PORTFOLIO</span>
          </span>
          <span className="font-mono font-bold text-emerald-400">
            {viewMode === 'absolute'
              ? formatCurrency(data.포트폴리오)
              : formatReturnValue(data.portfolioReturn)}
          </span>
        </div>

        {selectedBenchmarks.map((benchmark) => {
          const value = data[benchmark];
          const returnValue = data[
            `${benchmark}Return` as keyof ChartDataPoint
          ] as number | undefined;
          const excessReturn = data[
            `excessReturn${benchmark}` as keyof ChartDataPoint
          ] as number | undefined;

          if (value === undefined) return null;

          const isUnderperforming = (excessReturn ?? 0) < 0;

          return (
            <div key={benchmark}>
              <div className="flex justify-between items-center gap-6">
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-0.5 rounded"
                    style={{ backgroundColor: BENCHMARK_CONFIG[benchmark].color }}
                  />
                  <span className="text-slate-400 text-xs font-mono">{benchmark}</span>
                </span>
                <span
                  className="font-mono font-bold"
                  style={{ color: BENCHMARK_CONFIG[benchmark].color }}
                >
                  {viewMode === 'absolute'
                    ? formatCurrency(value)
                    : formatReturnValue(returnValue ?? 0)}
                </span>
              </div>
              {excessReturn !== undefined && (
                <div
                  className={`text-xs ml-4 font-mono ${isUnderperforming ? 'text-red-400' : 'text-emerald-400'}`}
                >
                  {isUnderperforming ? '- ' : '+ '}
                  vs {benchmark}: {formatReturnValue(excessReturn)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PerformanceChart({
  result,
  selectedBenchmarks,
  onBenchmarkChange,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('absolute');
  const [showRelativeChart, setShowRelativeChart] = useState(false);
  const [zoomState, setZoomState] = useState<ZoomState>({
    startIndex: 0,
    endIndex: -1,
  });
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const toggleBenchmark = (benchmark: BenchmarkType) => {
    onBenchmarkChange(
      selectedBenchmarks.includes(benchmark)
        ? selectedBenchmarks.filter((b) => b !== benchmark)
        : [...selectedBenchmarks, benchmark]
    );
  };

  const { chartData, underperformanceRanges, relativeChartData } =
    useMemo(() => {
      const portfolioReturns = calculateReturns(result.portfolio_values);

      const benchmarkReturns: Record<BenchmarkType, number[]> = {
        QQQ: calculateReturns(result.benchmarks.QQQ),
        SPY: calculateReturns(result.benchmarks.SPY),
      };

      const excessReturns: Partial<Record<BenchmarkType, number[]>> = {};
      const ranges: Partial<Record<BenchmarkType, UnderperformanceRange[]>> = {};

      selectedBenchmarks.forEach((benchmark) => {
        const excess = calculateExcessReturns(
          portfolioReturns,
          benchmarkReturns[benchmark]
        );
        excessReturns[benchmark] = excess;
        ranges[benchmark] = findUnderperformanceRanges(excess);
      });

      const data: ChartDataPoint[] = result.portfolio_values.map((pv, index) => {
        const point: ChartDataPoint = {
          date: pv.date,
          포트폴리오: pv.value,
          portfolioReturn: portfolioReturns[index],
        };

        if (selectedBenchmarks.includes('QQQ')) {
          point.QQQ = result.benchmarks.QQQ[index]?.value;
          point.QQQReturn = benchmarkReturns.QQQ[index];
          point.excessReturnQQQ = excessReturns.QQQ?.[index];
        }

        if (selectedBenchmarks.includes('SPY')) {
          point.SPY = result.benchmarks.SPY[index]?.value;
          point.SPYReturn = benchmarkReturns.SPY[index];
          point.excessReturnSPY = excessReturns.SPY?.[index];
        }

        return point;
      });

      const relativeData: Array<{
        date: string;
        excessQQQ?: number;
        excessSPY?: number;
      }> = [];

      let lastMonth = '';
      data.forEach((point) => {
        const month = point.date.substring(0, 7);
        if (month !== lastMonth) {
          lastMonth = month;
          relativeData.push({
            date: point.date,
            excessQQQ: point.excessReturnQQQ,
            excessSPY: point.excessReturnSPY,
          });
        }
      });

      return {
        chartData: data,
        underperformanceRanges: ranges,
        relativeChartData: relativeData,
      };
    }, [result, selectedBenchmarks]);

  const yAxisConfig = useMemo(() => {
    if (viewMode === 'absolute') {
      return {
        dataKeys: {
          portfolio: '포트폴리오',
          QQQ: 'QQQ',
          SPY: 'SPY',
        },
        formatter: formatYAxisCurrency,
        tooltipFormatter: formatCurrency,
      };
    } else {
      return {
        dataKeys: {
          portfolio: 'portfolioReturn',
          QQQ: 'QQQReturn',
          SPY: 'SPYReturn',
        },
        formatter: formatYAxisReturn,
        tooltipFormatter: formatReturnValue,
      };
    }
  }, [viewMode]);

  const underperformanceAreas = useMemo(() => {
    const areas: Array<{
      benchmark: BenchmarkType;
      startDate: string;
      endDate: string;
    }> = [];

    selectedBenchmarks.forEach((benchmark) => {
      const ranges = underperformanceRanges[benchmark] || [];
      ranges.forEach((range) => {
        if (chartData[range.start] && chartData[range.end]) {
          areas.push({
            benchmark,
            startDate: chartData[range.start].date,
            endDate: chartData[range.end].date,
          });
        }
      });
    });

    return areas;
  }, [selectedBenchmarks, underperformanceRanges, chartData]);

  const { displayData, isZoomed, zoomPercentage } = useMemo(() => {
    const total = chartData.length;
    if (total === 0) {
      return { displayData: chartData, isZoomed: false, zoomPercentage: 100 };
    }
    const end = zoomState.endIndex === -1 ? total - 1 : zoomState.endIndex;
    const start = zoomState.startIndex;
    const validStart = Math.max(0, Math.min(start, total - 1));
    const validEnd = Math.max(validStart, Math.min(end, total - 1));
    const sliced = chartData.slice(validStart, validEnd + 1);
    return {
      displayData: sliced,
      isZoomed: sliced.length < total,
      zoomPercentage: Math.round((sliced.length / total) * 100),
    };
  }, [chartData, zoomState]);

  const resetZoom = useCallback(() => {
    setZoomState({ startIndex: 0, endIndex: -1 });
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const container = chartContainerRef.current;
      if (!container || chartData.length === 0) return;

      const rect = container.getBoundingClientRect();
      const relativePos = (e.clientX - rect.left) / rect.width;

      const total = chartData.length;
      const end = zoomState.endIndex === -1 ? total - 1 : zoomState.endIndex;
      const start = zoomState.startIndex;
      const range = end - start + 1;

      const zoomIn = e.deltaY < 0;
      const amount = Math.ceil(range * ZOOM_CONFIG.ZOOM_FACTOR);

      let newStart = start;
      let newEnd = end;

      if (zoomIn && range > ZOOM_CONFIG.MIN_VISIBLE_POINTS) {
        const leftShrink = Math.floor(amount * relativePos);
        const rightShrink = amount - leftShrink;
        newStart = Math.min(start + leftShrink, end - ZOOM_CONFIG.MIN_VISIBLE_POINTS + 1);
        newEnd = Math.max(end - rightShrink, newStart + ZOOM_CONFIG.MIN_VISIBLE_POINTS - 1);
      } else if (!zoomIn && range < total) {
        const leftExpand = Math.floor(amount * relativePos);
        const rightExpand = amount - leftExpand;
        newStart = Math.max(0, start - leftExpand);
        newEnd = Math.min(total - 1, end + rightExpand);
      }

      setZoomState({ startIndex: newStart, endIndex: newEnd });
    },
    [chartData.length, zoomState]
  );

  const throttledHandleWheel = useMemo(
    () => throttle(handleWheel, ZOOM_CONFIG.THROTTLE_MS),
    [handleWheel]
  );

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    container.addEventListener('wheel', throttledHandleWheel, { passive: false });
    return () => container.removeEventListener('wheel', throttledHandleWheel);
  }, [throttledHandleWheel]);

  useEffect(() => {
    resetZoom();
  }, [result, resetZoom]);

  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      {/* 헤더 */}
      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">Performance</h2>
          </div>
          {isZoomed && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono">{zoomPercentage}%</span>
              <button
                onClick={resetZoom}
                className="px-2 py-0.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-600/50 transition-colors font-mono"
                title="Reset zoom"
              >
                RESET
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {/* 뷰 모드 전환 */}
          <div className="flex rounded overflow-hidden border border-slate-600/50">
            <button
              onClick={() => setViewMode('absolute')}
              className={`px-3 py-1 text-xs font-mono transition-all ${
                viewMode === 'absolute'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'bg-[#0a0e17] text-slate-500 hover:text-slate-400'
              }`}
            >
              $
            </button>
            <button
              onClick={() => setViewMode('returns')}
              className={`px-3 py-1 text-xs font-mono transition-all ${
                viewMode === 'returns'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'bg-[#0a0e17] text-slate-500 hover:text-slate-400'
              }`}
            >
              %
            </button>
          </div>

          {/* 벤치마크 선택 */}
          {(Object.keys(BENCHMARK_CONFIG) as BenchmarkType[]).map(
            (benchmark) => (
              <button
                key={benchmark}
                onClick={() => toggleBenchmark(benchmark)}
                className={`px-2.5 py-1 text-xs rounded border font-mono transition-all ${
                  selectedBenchmarks.includes(benchmark)
                    ? 'font-bold'
                    : 'border-slate-700 text-slate-600 hover:border-slate-500'
                }`}
                style={{
                  color: selectedBenchmarks.includes(benchmark)
                    ? BENCHMARK_CONFIG[benchmark].color
                    : undefined,
                  borderColor: selectedBenchmarks.includes(benchmark)
                    ? BENCHMARK_CONFIG[benchmark].color + '80'
                    : undefined,
                  backgroundColor: selectedBenchmarks.includes(benchmark)
                    ? BENCHMARK_CONFIG[benchmark].color + '15'
                    : undefined,
                }}
              >
                {benchmark}
              </button>
            )
          )}
        </div>
      </div>

      {/* Underperformance 범례 */}
      {selectedBenchmarks.length > 0 && underperformanceAreas.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {selectedBenchmarks.map((benchmark) => {
            const count =
              underperformanceRanges[benchmark]?.length || 0;
            if (count === 0) return null;
            return (
              <div
                key={benchmark}
                className="flex items-center gap-1 px-2 py-1 rounded font-mono"
                style={{
                  backgroundColor: BENCHMARK_CONFIG[benchmark].areaColor,
                }}
              >
                <span
                  className="w-2 h-2 rounded"
                  style={{ backgroundColor: BENCHMARK_CONFIG[benchmark].color }}
                />
                <span style={{ color: BENCHMARK_CONFIG[benchmark].color }}>
                  Underperform {benchmark}: {count}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 메인 차트 */}
      <div
        ref={chartContainerRef}
        className="h-80"
        title={isZoomed ? 'Scroll: zoom' : 'Mouse wheel to zoom'}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={displayData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <defs>
              {selectedBenchmarks.map((benchmark) => (
                <linearGradient
                  key={`gradient-${benchmark}`}
                  id={`underperformGradient-${benchmark}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={BENCHMARK_CONFIG[benchmark].color}
                    stopOpacity={0.2}
                  />
                  <stop
                    offset="100%"
                    stopColor={BENCHMARK_CONFIG[benchmark].color}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
              stroke="#1e293b"
              interval="preserveStartEnd"
            />

            <YAxis
              tickFormatter={yAxisConfig.formatter}
              tick={{ fontSize: 12, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
              stroke="#1e293b"
              width={60}
            />

            <Tooltip
              content={
                <CustomTooltip
                  viewMode={viewMode}
                  selectedBenchmarks={selectedBenchmarks}
                />
              }
            />

            <Legend
              formatter={(value) => {
                if (value === '포트폴리오' || value === 'portfolioReturn')
                  return 'PORTFOLIO';
                if (value === 'QQQ' || value === 'QQQReturn') return 'QQQ';
                if (value === 'SPY' || value === 'SPYReturn') return 'SPY';
                return value;
              }}
              wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}
            />

            {viewMode === 'returns' && (
              <ReferenceLine
                y={0}
                stroke="#475569"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}

            {selectedBenchmarks.map((benchmark) => {
              const underperformKey =
                `excessReturn${benchmark}` as keyof ChartDataPoint;

              return (
                <Area
                  key={`underperform-${benchmark}`}
                  type="monotone"
                  dataKey={(data: ChartDataPoint) => {
                    const excess = data[underperformKey] as number | undefined;
                    if (excess !== undefined && excess < 0) {
                      return viewMode === 'absolute'
                        ? data.포트폴리오
                        : data.portfolioReturn;
                    }
                    return null;
                  }}
                  fill={`url(#underperformGradient-${benchmark})`}
                  stroke="none"
                  legendType="none"
                  isAnimationActive={false}
                />
              );
            })}

            <Line
              type="monotone"
              dataKey={yAxisConfig.dataKeys.portfolio}
              stroke={PORTFOLIO_COLOR}
              strokeWidth={2}
              dot={false}
              name="포트폴리오"
            />

            {selectedBenchmarks.includes('QQQ') && (
              <Line
                type="monotone"
                dataKey={yAxisConfig.dataKeys.QQQ}
                stroke={BENCHMARK_CONFIG.QQQ.color}
                strokeWidth={1.5}
                dot={false}
                name="QQQ"
                strokeDasharray="4 4"
              />
            )}

            {selectedBenchmarks.includes('SPY') && (
              <Line
                type="monotone"
                dataKey={yAxisConfig.dataKeys.SPY}
                stroke={BENCHMARK_CONFIG.SPY.color}
                strokeWidth={1.5}
                dot={false}
                name="SPY"
                strokeDasharray="4 4"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {!isZoomed && (
        <p className="text-xs text-slate-600 text-center mt-1 font-mono">
          scroll to zoom
        </p>
      )}

      {/* 상대 성과 차트 토글 */}
      {selectedBenchmarks.length > 0 && (
        <div className="mt-4 border-t border-slate-700/30 pt-4">
          <button
            onClick={() => setShowRelativeChart(!showRelativeChart)}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-cyan-400 transition-colors font-mono"
          >
            <span
              className={`transform transition-transform ${showRelativeChart ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
            RELATIVE PERFORMANCE (EXCESS/SHORTFALL)
          </button>

          {showRelativeChart && (
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={relativeChartData}
                  margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
                    stroke="#1e293b"
                    interval="preserveStartEnd"
                  />

                  <YAxis
                    tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                    tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
                    stroke="#1e293b"
                    width={50}
                  />

                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatReturnValue(value),
                      name === 'excessQQQ' ? 'vs QQQ' : 'vs SPY',
                    ]}
                    labelFormatter={(label) => label}
                    contentStyle={{
                      backgroundColor: '#1a1f2e',
                      border: '1px solid rgba(100, 116, 139, 0.3)',
                      borderRadius: '4px',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '13px',
                      color: '#e2e8f0',
                    }}
                  />

                  <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />

                  {selectedBenchmarks.includes('QQQ') && (
                    <Bar
                      dataKey="excessQQQ"
                      name="excessQQQ"
                      fill={BENCHMARK_CONFIG.QQQ.color}
                      opacity={0.7}
                    />
                  )}

                  {selectedBenchmarks.includes('SPY') && (
                    <Bar
                      dataKey="excessSPY"
                      name="excessSPY"
                      fill={BENCHMARK_CONFIG.SPY.color}
                      opacity={0.7}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              <div className="flex justify-center gap-6 text-xs text-slate-600 mt-2 font-mono">
                <span>
                  + <span className="text-emerald-400">OUTPERFORM</span>
                </span>
                <span>
                  - <span className="text-red-400">UNDERPERFORM</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
