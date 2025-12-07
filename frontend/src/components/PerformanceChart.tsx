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
    color: '#ef4444',
    label: 'QQQ (나스닥 100)',
    areaColor: 'rgba(239, 68, 68, 0.15)',
  },
  SPY: {
    color: '#22c55e',
    label: 'SPY (S&P 500)',
    areaColor: 'rgba(34, 197, 94, 0.15)',
  },
};

const PORTFOLIO_COLOR = '#3b82f6';

// 줌 설정
const ZOOM_CONFIG = {
  MIN_VISIBLE_POINTS: 10,  // 최소 표시 데이터 포인트
  ZOOM_FACTOR: 0.1,        // 휠 1회에 10% 확대/축소
  THROTTLE_MS: 16,         // ~60fps 제한
} as const;

// 성능 최적화를 위한 throttle 함수
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
  endIndex: number; // -1은 전체 데이터
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
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2 border-b pb-1">{label}</p>

      <div className="space-y-1">
        <div className="flex justify-between items-center gap-4">
          <span className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: PORTFOLIO_COLOR }}
            />
            <span className="text-gray-600">포트폴리오</span>
          </span>
          <span className="font-medium text-blue-600">
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
              <div className="flex justify-between items-center gap-4">
                <span className="flex items-center gap-1">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: BENCHMARK_CONFIG[benchmark].color }}
                  />
                  <span className="text-gray-600">{benchmark}</span>
                </span>
                <span
                  className="font-medium"
                  style={{ color: BENCHMARK_CONFIG[benchmark].color }}
                >
                  {viewMode === 'absolute'
                    ? formatCurrency(value)
                    : formatReturnValue(returnValue ?? 0)}
                </span>
              </div>
              {excessReturn !== undefined && (
                <div
                  className={`text-xs ml-4 ${isUnderperforming ? 'text-red-500' : 'text-green-500'}`}
                >
                  {isUnderperforming ? '▼ ' : '▲ '}
                  {benchmark} 대비 {formatReturnValue(excessReturn)}
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

  // 차트 데이터 생성
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

      // 상대 성과 차트 데이터 (매월 첫 데이터만)
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

  // 메인 차트의 Y축 데이터 키와 포맷 결정
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

  // Underperformance 영역 렌더링을 위한 데이터 생성
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

  // 줌 데이터 계산
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

  // 줌 리셋
  const resetZoom = useCallback(() => {
    setZoomState({ startIndex: 0, endIndex: -1 });
  }, []);

  // 휠 이벤트 핸들러
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
        // 확대
        const leftShrink = Math.floor(amount * relativePos);
        const rightShrink = amount - leftShrink;
        newStart = Math.min(start + leftShrink, end - ZOOM_CONFIG.MIN_VISIBLE_POINTS + 1);
        newEnd = Math.max(end - rightShrink, newStart + ZOOM_CONFIG.MIN_VISIBLE_POINTS - 1);
      } else if (!zoomIn && range < total) {
        // 축소
        const leftExpand = Math.floor(amount * relativePos);
        const rightExpand = amount - leftExpand;
        newStart = Math.max(0, start - leftExpand);
        newEnd = Math.min(total - 1, end + rightExpand);
      }

      setZoomState({ startIndex: newStart, endIndex: newEnd });
    },
    [chartData.length, zoomState]
  );

  // throttle된 휠 핸들러
  const throttledHandleWheel = useMemo(
    () => throttle(handleWheel, ZOOM_CONFIG.THROTTLE_MS),
    [handleWheel]
  );

  // 휠 이벤트 리스너 등록
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    container.addEventListener('wheel', throttledHandleWheel, { passive: false });
    return () => container.removeEventListener('wheel', throttledHandleWheel);
  }, [throttledHandleWheel]);

  // 데이터 변경 시 줌 리셋
  useEffect(() => {
    resetZoom();
  }, [result, resetZoom]);

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      {/* 헤더 */}
      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800">성과 차트</h2>
          {/* 줌 상태 표시 */}
          {isZoomed && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{zoomPercentage}% 표시</span>
              <button
                onClick={resetZoom}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded border border-gray-300 transition-colors flex items-center gap-1"
                title="전체 보기"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                리셋
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* 뷰 모드 전환 */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            <button
              onClick={() => setViewMode('absolute')}
              className={`px-3 py-1.5 text-sm transition-all ${
                viewMode === 'absolute'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              금액
            </button>
            <button
              onClick={() => setViewMode('returns')}
              className={`px-3 py-1.5 text-sm transition-all ${
                viewMode === 'returns'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              수익률 %
            </button>
          </div>

          {/* 벤치마크 선택 */}
          {(Object.keys(BENCHMARK_CONFIG) as BenchmarkType[]).map(
            (benchmark) => (
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
                className="flex items-center gap-1 px-2 py-1 rounded"
                style={{
                  backgroundColor: BENCHMARK_CONFIG[benchmark].areaColor,
                }}
              >
                <span
                  className="w-2 h-2 rounded"
                  style={{ backgroundColor: BENCHMARK_CONFIG[benchmark].color }}
                />
                <span style={{ color: BENCHMARK_CONFIG[benchmark].color }}>
                  {benchmark} 대비 저조 구간: {count}개
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
        title={isZoomed ? '휠: 확대/축소' : '마우스 휠로 확대/축소'}
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
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={BENCHMARK_CONFIG[benchmark].color}
                    stopOpacity={0.05}
                  />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />

            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />

            <YAxis
              tickFormatter={yAxisConfig.formatter}
              tick={{ fontSize: 11 }}
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
                  return '포트폴리오';
                if (value === 'QQQ' || value === 'QQQReturn') return 'QQQ';
                if (value === 'SPY' || value === 'SPYReturn') return 'SPY';
                return value;
              }}
            />

            {/* 수익률 모드에서 0% 기준선 */}
            {viewMode === 'returns' && (
              <ReferenceLine
                y={0}
                stroke="#666"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            )}

            {/* Underperformance 영역 - Area로 표시 */}
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

            {/* 포트폴리오 라인 */}
            <Line
              type="monotone"
              dataKey={yAxisConfig.dataKeys.portfolio}
              stroke={PORTFOLIO_COLOR}
              strokeWidth={2.5}
              dot={false}
              name="포트폴리오"
            />

            {/* 벤치마크 라인 */}
            {selectedBenchmarks.includes('QQQ') && (
              <Line
                type="monotone"
                dataKey={yAxisConfig.dataKeys.QQQ}
                stroke={BENCHMARK_CONFIG.QQQ.color}
                strokeWidth={2}
                dot={false}
                name="QQQ"
                strokeDasharray="5 5"
              />
            )}

            {selectedBenchmarks.includes('SPY') && (
              <Line
                type="monotone"
                dataKey={yAxisConfig.dataKeys.SPY}
                stroke={BENCHMARK_CONFIG.SPY.color}
                strokeWidth={2}
                dot={false}
                name="SPY"
                strokeDasharray="5 5"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 줌 힌트 */}
      {!isZoomed && (
        <p className="text-xs text-gray-400 text-center mt-1">
          마우스 휠로 확대/축소
        </p>
      )}

      {/* 상대 성과 차트 토글 */}
      {selectedBenchmarks.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <button
            onClick={() => setShowRelativeChart(!showRelativeChart)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
          >
            <span
              className={`transform transition-transform ${showRelativeChart ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
            상대 성과 차트 (초과/미달 수익률)
          </button>

          {showRelativeChart && (
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={relativeChartData}
                  margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />

                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />

                  <YAxis
                    tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                    tick={{ fontSize: 10 }}
                    width={50}
                  />

                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatReturnValue(value),
                      name === 'excessQQQ' ? 'QQQ 대비' : 'SPY 대비',
                    ]}
                    labelFormatter={(label) => `날짜: ${label}`}
                  />

                  <ReferenceLine y={0} stroke="#666" strokeWidth={1} />

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

              <div className="flex justify-center gap-6 text-xs text-gray-500 mt-2">
                <span>
                  ▲ 양수 = 벤치마크 대비 <span className="text-green-600 font-medium">초과 성과</span>
                </span>
                <span>
                  ▼ 음수 = 벤치마크 대비 <span className="text-red-600 font-medium">저조한 성과</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
