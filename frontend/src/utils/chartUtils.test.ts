import { describe, it, expect } from 'vitest';
import {
  calculateReturns,
  calculateExcessReturns,
  findUnderperformanceRanges,
  transformToEnhancedChartData,
  formatReturnValue,
} from './chartUtils';
import type { PortfolioValue } from '../types';

describe('chartUtils', () => {
  describe('calculateReturns', () => {
    it('should calculate returns as percentage from initial value', () => {
      const values: PortfolioValue[] = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 10500 },
        { date: '2024-01-03', value: 11000 },
      ];

      const returns = calculateReturns(values);

      expect(returns).toHaveLength(3);
      expect(returns[0]).toBe(0); // 시작점은 0%
      expect(returns[1]).toBeCloseTo(5); // 5% 상승
      expect(returns[2]).toBeCloseTo(10); // 10% 상승
    });

    it('should handle negative returns', () => {
      const values: PortfolioValue[] = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 9500 },
        { date: '2024-01-03', value: 9000 },
      ];

      const returns = calculateReturns(values);

      expect(returns[1]).toBeCloseTo(-5); // -5%
      expect(returns[2]).toBeCloseTo(-10); // -10%
    });

    it('should return empty array for empty input', () => {
      const returns = calculateReturns([]);
      expect(returns).toEqual([]);
    });

    it('should return [0] for single value', () => {
      const values: PortfolioValue[] = [{ date: '2024-01-01', value: 10000 }];
      const returns = calculateReturns(values);
      expect(returns).toEqual([0]);
    });

    it('should handle zero initial value gracefully', () => {
      const values: PortfolioValue[] = [
        { date: '2024-01-01', value: 0 },
        { date: '2024-01-02', value: 100 },
      ];

      const returns = calculateReturns(values);

      expect(returns[0]).toBe(0);
      expect(returns[1]).toBe(0); // 0으로 나누기 방지
    });
  });

  describe('calculateExcessReturns', () => {
    it('should calculate excess returns (portfolio - benchmark)', () => {
      const portfolioReturns = [0, 5, 10, 8];
      const benchmarkReturns = [0, 3, 12, 6];

      const excessReturns = calculateExcessReturns(
        portfolioReturns,
        benchmarkReturns
      );

      expect(excessReturns).toHaveLength(4);
      expect(excessReturns[0]).toBe(0);
      expect(excessReturns[1]).toBeCloseTo(2); // 5 - 3
      expect(excessReturns[2]).toBeCloseTo(-2); // 10 - 12 (underperformance)
      expect(excessReturns[3]).toBeCloseTo(2); // 8 - 6
    });

    it('should return empty array if inputs have different lengths', () => {
      const portfolioReturns = [0, 5, 10];
      const benchmarkReturns = [0, 3];

      const excessReturns = calculateExcessReturns(
        portfolioReturns,
        benchmarkReturns
      );

      expect(excessReturns).toEqual([]);
    });

    it('should return empty array for empty inputs', () => {
      const excessReturns = calculateExcessReturns([], []);
      expect(excessReturns).toEqual([]);
    });
  });

  describe('findUnderperformanceRanges', () => {
    it('should find continuous underperformance ranges', () => {
      // 인덱스: 0  1   2   3   4   5   6
      // 초과:   0  2  -1  -3  -2   5  -1
      const excessReturns = [0, 2, -1, -3, -2, 5, -1];

      const ranges = findUnderperformanceRanges(excessReturns);

      expect(ranges).toHaveLength(2);
      expect(ranges[0]).toEqual({ start: 2, end: 4 }); // 인덱스 2-4
      expect(ranges[1]).toEqual({ start: 6, end: 6 }); // 인덱스 6
    });

    it('should return empty array when no underperformance', () => {
      const excessReturns = [0, 2, 3, 5, 1];
      const ranges = findUnderperformanceRanges(excessReturns);
      expect(ranges).toEqual([]);
    });

    it('should handle all underperformance', () => {
      const excessReturns = [-1, -2, -3, -4];
      const ranges = findUnderperformanceRanges(excessReturns);
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, end: 3 });
    });

    it('should handle empty array', () => {
      const ranges = findUnderperformanceRanges([]);
      expect(ranges).toEqual([]);
    });

    it('should handle single underperformance point', () => {
      const excessReturns = [2, 3, -1, 4, 5];
      const ranges = findUnderperformanceRanges(excessReturns);
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 2, end: 2 });
    });

    it('should treat zero as not underperforming', () => {
      const excessReturns = [0, 0, -1, 0, 0];
      const ranges = findUnderperformanceRanges(excessReturns);
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 2, end: 2 });
    });
  });

  describe('transformToEnhancedChartData', () => {
    it('should transform data with returns and excess returns', () => {
      const portfolioValues: PortfolioValue[] = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 10500 },
        { date: '2024-01-03', value: 11000 },
      ];

      const benchmarks = {
        QQQ: [
          { date: '2024-01-01', value: 10000 },
          { date: '2024-01-02', value: 10300 },
          { date: '2024-01-03', value: 10800 },
        ],
        SPY: [
          { date: '2024-01-01', value: 10000 },
          { date: '2024-01-02', value: 10200 },
          { date: '2024-01-03', value: 10600 },
        ],
      };

      const result = transformToEnhancedChartData(
        portfolioValues,
        benchmarks,
        ['QQQ', 'SPY']
      );

      expect(result).toHaveLength(3);

      // 첫 번째 데이터 포인트
      expect(result[0].date).toBe('2024-01-01');
      expect(result[0].portfolioReturn).toBe(0);
      expect(result[0].QQQReturn).toBe(0);
      expect(result[0].SPYReturn).toBe(0);
      expect(result[0].excessReturnQQQ).toBe(0);
      expect(result[0].excessReturnSPY).toBe(0);

      // 두 번째 데이터 포인트 (포트폴리오가 벤치마크보다 좋음)
      expect(result[1].portfolioReturn).toBeCloseTo(5);
      expect(result[1].QQQReturn).toBeCloseTo(3);
      expect(result[1].excessReturnQQQ).toBeCloseTo(2); // 초과 성과

      // 세 번째 데이터 포인트
      expect(result[2].portfolioReturn).toBeCloseTo(10);
      expect(result[2].QQQReturn).toBeCloseTo(8);
      expect(result[2].excessReturnQQQ).toBeCloseTo(2);
    });

    it('should handle missing benchmark selection', () => {
      const portfolioValues: PortfolioValue[] = [
        { date: '2024-01-01', value: 10000 },
        { date: '2024-01-02', value: 10500 },
      ];

      const benchmarks = {
        QQQ: [
          { date: '2024-01-01', value: 10000 },
          { date: '2024-01-02', value: 10300 },
        ],
        SPY: [
          { date: '2024-01-01', value: 10000 },
          { date: '2024-01-02', value: 10200 },
        ],
      };

      // QQQ만 선택
      const result = transformToEnhancedChartData(portfolioValues, benchmarks, [
        'QQQ',
      ]);

      expect(result[0].QQQReturn).toBeDefined();
      expect(result[0].SPYReturn).toBeUndefined();
      expect(result[0].excessReturnQQQ).toBeDefined();
      expect(result[0].excessReturnSPY).toBeUndefined();
    });
  });

  describe('formatReturnValue', () => {
    it('should format positive returns with + sign', () => {
      expect(formatReturnValue(5.5)).toBe('+5.50%');
      expect(formatReturnValue(0.1)).toBe('+0.10%');
    });

    it('should format negative returns with - sign', () => {
      expect(formatReturnValue(-3.25)).toBe('-3.25%');
    });

    it('should format zero as +0.00%', () => {
      expect(formatReturnValue(0)).toBe('+0.00%');
    });

    it('should handle very small numbers', () => {
      expect(formatReturnValue(0.001)).toBe('+0.00%');
      expect(formatReturnValue(-0.001)).toBe('-0.00%');
    });
  });
});
