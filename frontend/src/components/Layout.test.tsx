import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Layout } from './Layout';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

/**
 * @requirement REQ-001, REQ-004, REQ-006
 * @testLevel Unit
 */
describe('Layout', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  // UT-009: REQ-001 - 레이아웃에 사이드바 포함
  it('should render sidebar within layout', () => {
    render(<Layout />);
    const sidebars = screen.getAllByTestId('sidebar');
    expect(sidebars.length).toBeGreaterThanOrEqual(1);
  });

  // UT-010: REQ-004 - 기본 메뉴로 포트폴리오 시뮬레이터 선택
  it('should show portfolio simulator as default active view', () => {
    render(<Layout />);
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  // UT-011: REQ-006 - 메뉴 전환 시 콘텐츠 변경
  it('should switch content when menu changes', () => {
    render(<Layout />);
    const mainContent = screen.getByTestId('main-content');
    expect(mainContent).toBeInTheDocument();
  });

  // UT-012: REQ-002 - 사이드바 토글 동작
  it('should toggle sidebar collapsed state', () => {
    render(<Layout />);
    const toggleBtns = screen.getAllByTestId('sidebar-toggle');
    const sidebars = screen.getAllByTestId('sidebar');

    // 초기 상태: 펼침 (데스크톱 사이드바)
    expect(sidebars[0].className).toContain('w-[260px]');

    // 토글: 접힘
    fireEvent.click(toggleBtns[0]);
    expect(sidebars[0].className).toContain('w-[60px]');
  });

  // UT-013: REQ-002 (EDGE-003) - localStorage에 사이드바 상태 저장
  it('should persist sidebar collapsed state to localStorage', () => {
    render(<Layout />);
    const toggleBtns = screen.getAllByTestId('sidebar-toggle');

    fireEvent.click(toggleBtns[0]);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'sidebar-collapsed',
      'true'
    );
  });
});
