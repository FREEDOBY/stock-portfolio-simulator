import type { PortfolioValue, BenchmarkType } from '../types';

/**
 * 포트폴리오 값 배열에서 누적 수익률(%) 계산
 * @param values - 일별 포트폴리오 값 배열
 * @returns 누적 수익률 배열 (첫 번째 값은 0%)
 */
export function calculateReturns(values: PortfolioValue[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [0];

  const initial = values[0].value;

  // 초기값이 0이면 모든 수익률을 0으로 반환
  if (initial === 0) {
    return values.map(() => 0);
  }

  return values.map((v) => ((v.value - initial) / initial) * 100);
}

/**
 * 초과 수익률 계산 (포트폴리오 - 벤치마크)
 * @param portfolioReturns - 포트폴리오 수익률 배열
 * @param benchmarkReturns - 벤치마크 수익률 배열
 * @returns 초과 수익률 배열 (양수: 초과, 음수: 미달)
 */
export function calculateExcessReturns(
  portfolioReturns: number[],
  benchmarkReturns: number[]
): number[] {
  if (portfolioReturns.length !== benchmarkReturns.length) {
    return [];
  }

  if (portfolioReturns.length === 0) {
    return [];
  }

  return portfolioReturns.map((pr, i) => pr - benchmarkReturns[i]);
}

/**
 * Underperformance 구간 (연속적인 음수 초과 수익률 구간) 찾기
 */
export interface UnderperformanceRange {
  start: number;
  end: number;
}

export function findUnderperformanceRanges(
  excessReturns: number[]
): UnderperformanceRange[] {
  if (excessReturns.length === 0) {
    return [];
  }

  const ranges: UnderperformanceRange[] = [];
  let currentRange: UnderperformanceRange | null = null;

  excessReturns.forEach((excess, index) => {
    const isUnderperforming = excess < 0;

    if (isUnderperforming && !currentRange) {
      // 새로운 underperformance 구간 시작
      currentRange = { start: index, end: index };
    } else if (isUnderperforming && currentRange) {
      // 기존 구간 확장
      currentRange.end = index;
    } else if (!isUnderperforming && currentRange) {
      // 구간 종료
      ranges.push(currentRange);
      currentRange = null;
    }
  });

  // 마지막 구간 처리
  if (currentRange) {
    ranges.push(currentRange);
  }

  return ranges;
}

/**
 * 확장된 차트 데이터 타입
 */
export interface EnhancedChartDataPoint {
  date: string;
  포트폴리오: number;
  QQQ?: number;
  SPY?: number;
  portfolioReturn: number;
  QQQReturn?: number;
  SPYReturn?: number;
  excessReturnQQQ?: number;
  excessReturnSPY?: number;
  underperformQQQ?: boolean;
  underperformSPY?: boolean;
}

/**
 * 원본 데이터를 확장된 차트 데이터로 변환
 */
export function transformToEnhancedChartData(
  portfolioValues: PortfolioValue[],
  benchmarks: { QQQ: PortfolioValue[]; SPY: PortfolioValue[] },
  selectedBenchmarks: BenchmarkType[]
): EnhancedChartDataPoint[] {
  const portfolioReturns = calculateReturns(portfolioValues);

  // 벤치마크 수익률 계산
  const benchmarkReturns: Record<BenchmarkType, number[]> = {
    QQQ: calculateReturns(benchmarks.QQQ),
    SPY: calculateReturns(benchmarks.SPY),
  };

  // 초과 수익률 계산
  const excessReturns: Partial<Record<BenchmarkType, number[]>> = {};
  selectedBenchmarks.forEach((benchmark) => {
    excessReturns[benchmark] = calculateExcessReturns(
      portfolioReturns,
      benchmarkReturns[benchmark]
    );
  });

  return portfolioValues.map((pv, index) => {
    const dataPoint: EnhancedChartDataPoint = {
      date: pv.date,
      포트폴리오: pv.value,
      portfolioReturn: portfolioReturns[index],
    };

    // 선택된 벤치마크에 대한 데이터 추가
    selectedBenchmarks.forEach((benchmark) => {
      dataPoint[benchmark] = benchmarks[benchmark][index]?.value;
      dataPoint[`${benchmark}Return` as keyof EnhancedChartDataPoint] =
        benchmarkReturns[benchmark][index] as never;
      dataPoint[`excessReturn${benchmark}` as keyof EnhancedChartDataPoint] =
        excessReturns[benchmark]?.[index] as never;
      dataPoint[`underperform${benchmark}` as keyof EnhancedChartDataPoint] = (
        excessReturns[benchmark]?.[index] ?? 0
      ) < 0 as never;
    });

    return dataPoint;
  });
}

/**
 * 수익률 값 포맷팅
 * @param value - 수익률 값 (%)
 * @returns 포맷된 문자열 (예: "+5.50%", "-3.25%")
 */
export function formatReturnValue(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * 금액 포맷팅
 * @param value - 금액
 * @returns 포맷된 문자열 (예: "$10,000")
 */
export function formatCurrency(value: number): string {
  return `$${value.toLocaleString()}`;
}

/**
 * Y축 틱 포맷팅 (금액)
 * @param value - 금액
 * @returns 축약된 금액 (예: "$10k")
 */
export function formatYAxisCurrency(value: number): string {
  return `$${(value / 1000).toFixed(0)}k`;
}

/**
 * Y축 틱 포맷팅 (수익률)
 * @param value - 수익률 (%)
 * @returns 포맷된 수익률 (예: "10%")
 */
export function formatYAxisReturn(value: number): string {
  return `${value.toFixed(0)}%`;
}

/**
 * 날짜 포맷팅
 * @param date - ISO 날짜 문자열
 * @returns 포맷된 날짜 (예: "2024-01")
 */
export function formatDate(date: string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
