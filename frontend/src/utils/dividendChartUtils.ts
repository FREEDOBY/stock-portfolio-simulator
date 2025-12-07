import type { MonthlyDividend } from '../types';

export const ALL_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

export interface DividendChartDataItem {
  month: string;
  fullMonth: string;
  amount: number;
  [etf: string]: string | number;
}

/**
 * 선택한 연도의 12개월 전체 차트 데이터를 생성합니다.
 * 배당이 없는 월은 0으로 채워집니다.
 */
export function generateFullYearChartData(
  year: string,
  monthlyData: MonthlyDividend[],
  etfList: string[]
): DividendChartDataItem[] {
  return ALL_MONTHS.map((month) => {
    const fullMonth = `${year}-${month}`;
    const existing = monthlyData.find((d) => d.month === fullMonth);

    if (existing) {
      return {
        month,
        fullMonth,
        amount: existing.amount,
        ...existing.by_etf,
      };
    }

    // 배당 없는 월은 0으로 채움
    const emptyByEtf = Object.fromEntries(etfList.map((etf) => [etf, 0]));
    return {
      month,
      fullMonth,
      amount: 0,
      ...emptyByEtf,
    };
  });
}
