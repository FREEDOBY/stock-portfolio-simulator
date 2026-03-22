import { describe, it, expect } from 'vitest';
import {
  NBER_RECESSIONS,
  MARKET_CORRECTIONS,
  filterOverlaysByPeriod,
  type CrisisOverlay,
} from './crisisOverlayConfig';

describe('Crisis Overlay Config', () => {
  // UT-001: REQ-001 - NBER 경기침체 데이터 정의
  it('should define NBER recessions with start/end dates', () => {
    expect(NBER_RECESSIONS.length).toBeGreaterThanOrEqual(3);
    NBER_RECESSIONS.forEach((r) => {
      expect(r.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.type).toBe('recession');
      expect(r.label).toBeTruthy();
    });
  });

  // UT-002: REQ-002 - 비공식 조정장 데이터 정의
  it('should define market corrections with start/end dates', () => {
    expect(MARKET_CORRECTIONS.length).toBeGreaterThanOrEqual(2);
    MARKET_CORRECTIONS.forEach((c) => {
      expect(c.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.type).toBe('correction');
    });
  });

  // UT-003: REQ-007 - 기간 필터링 (3Y)
  it('should filter overlays by 3Y period', () => {
    const all = [...NBER_RECESSIONS, ...MARKET_CORRECTIONS];
    const filtered = filterOverlaysByPeriod(all, 36);
    // 3년 이내 구간만 포함
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 36);
    filtered.forEach((o) => {
      expect(new Date(o.end) >= cutoff).toBe(true);
    });
  });

  // UT-004: REQ-007 - 기간 필터링 (10Y)
  it('should include more overlays for 10Y', () => {
    const all = [...NBER_RECESSIONS, ...MARKET_CORRECTIONS];
    const filtered3y = filterOverlaysByPeriod(all, 36);
    const filtered10y = filterOverlaysByPeriod(all, 120);
    expect(filtered10y.length).toBeGreaterThanOrEqual(filtered3y.length);
  });

  // UT-005: REQ-001 - 2008 GFC 포함
  it('should include 2008 GFC in NBER recessions', () => {
    const gfc = NBER_RECESSIONS.find((r) => r.start.startsWith('2007'));
    expect(gfc).toBeDefined();
    expect(gfc!.end).toMatch(/^2009/);
  });

  // UT-006: REQ-002 - 2022 조정장 포함
  it('should include 2022 correction', () => {
    const c2022 = MARKET_CORRECTIONS.find((c) => c.start.startsWith('2022'));
    expect(c2022).toBeDefined();
  });
});
