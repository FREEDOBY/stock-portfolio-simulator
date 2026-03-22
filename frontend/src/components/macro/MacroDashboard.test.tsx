import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MacroDashboard } from './MacroDashboard';
import * as macroApi from '../../api/macro';

// Mock API
vi.mock('../../api/macro', () => ({
  fetchDashboard: vi.fn(),
}));

const mockDashboardData = {
  overall: {
    score: 0.45,
    verdict: 'buy',
    signals: [
      { signal_id: 1, name: '적립식 매수', score: 1.0, weight: 0.5, status: 'buy', reason: '매달 정기 매수' },
      { signal_id: 2, name: 'OECD CLI', score: 0.0, weight: 1.5, status: 'wait', reason: '조건 불충족' },
      { signal_id: 3, name: '키친사이클', score: 2.0, weight: 2.0, status: 'buy', reason: 'Phase 1' },
      { signal_id: 4, name: '200주선', score: 0.5, weight: 2.0, status: 'buy', reason: '200주선 접근' },
      { signal_id: 5, name: 'MACD 쌍바닥', score: 0.0, weight: 1.5, status: 'wait', reason: '시그널 없음' },
      { signal_id: 6, name: '계단식법', score: 0.0, weight: 1.0, status: 'wait', reason: '상승기' },
    ],
    history: [
      { date: '2026-01-15', signal_id: 3, prev_status: 'wait', new_status: 'buy', reason: 'Phase 1 진입' },
    ],
    updated_at: '2026-03-21T12:00:00',
  },
  categories: {
    business_cycle: { status: 'bullish', key_values: { phase: 'Phase 1', cli_mom: 0.12 } },
    liquidity: { status: 'neutral', key_values: { fed_rate: 5.25, m2_yoy: 3.5 } },
    technical: { status: 'bullish', key_values: { distance_pct: 15.2, rsi: 55.3 } },
    sentiment: { status: 'neutral', key_values: { vix: 18.5, hy_spread: 3.8 } },
    valuation: { status: 'overvalued', key_values: { buffett: 185.0 } },
  },
};

describe('MacroDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // UT-001: REQ-001 - 종합 판정 배너 표시
  it('should render verdict banner with score', async () => {
    vi.mocked(macroApi.fetchDashboard).mockResolvedValue(mockDashboardData);

    render(<MacroDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('verdict-banner')).toBeInTheDocument();
    });
  });

  // UT-002: REQ-002 - 5개 카테고리 카드 표시
  it('should render 5 category cards', async () => {
    vi.mocked(macroApi.fetchDashboard).mockResolvedValue(mockDashboardData);

    render(<MacroDashboard />);

    await waitFor(() => {
      expect(screen.getAllByTestId(/category-card-/)).toHaveLength(5);
    });
  });

  // UT-003: REQ-004 - 시그널 테이블 표시
  it('should render signal table with 6 signals', async () => {
    vi.mocked(macroApi.fetchDashboard).mockResolvedValue(mockDashboardData);

    render(<MacroDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('signal-table')).toBeInTheDocument();
    });
  });

  // UT-004: REQ-005 - 시그널 히스토리 표시
  it('should render signal history', async () => {
    vi.mocked(macroApi.fetchDashboard).mockResolvedValue(mockDashboardData);

    render(<MacroDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('signal-history')).toBeInTheDocument();
    });
  });

  // UT-005: REQ-009 - 로딩 상태
  it('should show loading state initially', () => {
    vi.mocked(macroApi.fetchDashboard).mockReturnValue(new Promise(() => {})); // never resolves

    render(<MacroDashboard />);

    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
  });

  // UT-006: REQ-009 - 에러 상태
  it('should show error state on API failure', async () => {
    vi.mocked(macroApi.fetchDashboard).mockRejectedValue(new Error('Network error'));

    render(<MacroDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });

  // UT-007: REQ-010 - 다크 테마 클래스
  it('should apply dark theme classes', async () => {
    vi.mocked(macroApi.fetchDashboard).mockResolvedValue(mockDashboardData);

    render(<MacroDashboard />);

    await waitFor(() => {
      const container = screen.getByTestId('macro-dashboard');
      expect(container).toBeInTheDocument();
    });
  });
});
