import { describe, it, expect } from 'vitest';
import {
  generateFullYearChartData,
  ALL_MONTHS,
} from './dividendChartUtils';
import type { MonthlyDividend } from '../types';

describe('dividendChartUtils', () => {
  describe('generateFullYearChartData', () => {
    const etfList = ['SCHD', 'VYM'];

    it('should generate all 12 months for a year', () => {
      const monthlyData: MonthlyDividend[] = [
        { month: '2024-03', amount: 100, by_etf: { SCHD: 60, VYM: 40 } },
        { month: '2024-06', amount: 150, by_etf: { SCHD: 90, VYM: 60 } },
      ];

      const result = generateFullYearChartData('2024', monthlyData, etfList);

      expect(result).toHaveLength(12);
      expect(result[0].month).toBe('01'); // 1월
      expect(result[11].month).toBe('12'); // 12월
    });

    it('should include months with no dividends as zero', () => {
      const monthlyData: MonthlyDividend[] = [
        { month: '2024-03', amount: 100, by_etf: { SCHD: 60, VYM: 40 } },
      ];

      const result = generateFullYearChartData('2024', monthlyData, etfList);

      // 1월은 배당 없음 -> 0
      expect(result[0].amount).toBe(0);
      expect(result[0].SCHD).toBe(0);
      expect(result[0].VYM).toBe(0);

      // 3월은 배당 있음
      expect(result[2].amount).toBe(100);
      expect(result[2].SCHD).toBe(60);
      expect(result[2].VYM).toBe(40);
    });

    it('should fill empty months with all ETF values as zero', () => {
      const monthlyData: MonthlyDividend[] = [
        { month: '2024-06', amount: 200, by_etf: { SCHD: 120, VYM: 80 } },
      ];

      const result = generateFullYearChartData('2024', monthlyData, etfList);

      // 5월 (배당 없음)
      expect(result[4].month).toBe('05');
      expect(result[4].fullMonth).toBe('2024-05');
      expect(result[4].amount).toBe(0);
      expect(result[4].SCHD).toBe(0);
      expect(result[4].VYM).toBe(0);
    });

    it('should preserve existing dividend data', () => {
      const monthlyData: MonthlyDividend[] = [
        { month: '2024-01', amount: 50, by_etf: { SCHD: 30, VYM: 20 } },
        { month: '2024-04', amount: 75, by_etf: { SCHD: 45, VYM: 30 } },
        { month: '2024-07', amount: 100, by_etf: { SCHD: 60, VYM: 40 } },
        { month: '2024-10', amount: 125, by_etf: { SCHD: 75, VYM: 50 } },
      ];

      const result = generateFullYearChartData('2024', monthlyData, etfList);

      // 1월
      expect(result[0].amount).toBe(50);
      expect(result[0].SCHD).toBe(30);

      // 4월
      expect(result[3].amount).toBe(75);

      // 7월
      expect(result[6].amount).toBe(100);

      // 10월
      expect(result[9].amount).toBe(125);
    });

    it('should handle single ETF portfolio', () => {
      const singleEtfList = ['SCHD'];
      const monthlyData: MonthlyDividend[] = [
        { month: '2024-03', amount: 100, by_etf: { SCHD: 100 } },
      ];

      const result = generateFullYearChartData('2024', monthlyData, singleEtfList);

      expect(result).toHaveLength(12);
      expect(result[2].SCHD).toBe(100);
      expect(result[0].SCHD).toBe(0); // 배당 없는 월
    });

    it('should handle empty monthly data', () => {
      const result = generateFullYearChartData('2024', [], etfList);

      expect(result).toHaveLength(12);
      result.forEach((item) => {
        expect(item.amount).toBe(0);
        expect(item.SCHD).toBe(0);
        expect(item.VYM).toBe(0);
      });
    });

    it('should correctly format fullMonth as YYYY-MM', () => {
      const result = generateFullYearChartData('2024', [], ['SCHD']);

      expect(result[0].fullMonth).toBe('2024-01');
      expect(result[5].fullMonth).toBe('2024-06');
      expect(result[11].fullMonth).toBe('2024-12');
    });
  });

  describe('ALL_MONTHS constant', () => {
    it('should have 12 months', () => {
      expect(ALL_MONTHS).toHaveLength(12);
    });

    it('should be in order from 01 to 12', () => {
      expect(ALL_MONTHS[0]).toBe('01');
      expect(ALL_MONTHS[11]).toBe('12');
    });
  });
});
