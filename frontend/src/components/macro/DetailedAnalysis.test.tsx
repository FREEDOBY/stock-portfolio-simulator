import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DetailedAnalysis } from './DetailedAnalysis';
import * as macroApi from '../../api/macro';

vi.mock('../../api/macro', () => ({
  fetchCategoryDetail: vi.fn(),
}));

const mockCategoryData = {
  FEDFUNDS: { series_id: 'FEDFUNDS', name: 'Fed 기준금리', data: [{ date: '2025-01-01', value: 5.25 }], status: 'live' },
};

describe('DetailedAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(macroApi.fetchCategoryDetail).mockResolvedValue(mockCategoryData);
  });

  // UT-001: REQ-001 - 5개 탭 버튼 렌더링
  it('should render 5 tab buttons', () => {
    render(<DetailedAnalysis />);
    expect(screen.getByTestId('tab-business_cycle')).toBeInTheDocument();
    expect(screen.getByTestId('tab-liquidity')).toBeInTheDocument();
    expect(screen.getByTestId('tab-technical')).toBeInTheDocument();
    expect(screen.getByTestId('tab-sentiment')).toBeInTheDocument();
    expect(screen.getByTestId('tab-valuation')).toBeInTheDocument();
  });

  // UT-002: REQ-001 - 탭 클릭 시 전환
  it('should switch tab on click', async () => {
    render(<DetailedAnalysis />);

    const liquidityTab = screen.getByTestId('tab-liquidity');
    fireEvent.click(liquidityTab);

    await waitFor(() => {
      expect(screen.getByTestId('tab-content')).toBeInTheDocument();
    });
  });

  // UT-003: REQ-001 - 기본 탭은 경기 사이클
  it('should default to business_cycle tab', () => {
    render(<DetailedAnalysis />);
    const activeTab = screen.getByTestId('tab-business_cycle');
    expect(activeTab.className).toContain('cyan');
  });

  // UT-004: REQ-009 - initialTab prop으로 시작 탭 지정
  it('should accept initialTab prop', () => {
    render(<DetailedAnalysis initialTab="sentiment" />);
    const activeTab = screen.getByTestId('tab-sentiment');
    expect(activeTab.className).toContain('cyan');
  });

  // UT-005: REQ-001 - 로딩 상태
  it('should show loading during data fetch', () => {
    vi.mocked(macroApi.fetchCategoryDetail).mockReturnValue(new Promise(() => {}));
    render(<DetailedAnalysis />);
    expect(screen.getByTestId('tab-loading')).toBeInTheDocument();
  });
});
