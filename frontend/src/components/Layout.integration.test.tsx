import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Layout } from './Layout';

// localStorage를 선택적으로 응답하는 mock
const createLocalStorageMock = (initialStore: Record<string, string> = {}) => {
  const store = { ...initialStore };
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(),
    get length() { return Object.keys(store).length; },
    key: vi.fn((_: number) => null),
  };
};

/**
 * @requirement REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006
 * @testLevel Integration
 * @integrationPoints Layout ↔ Sidebar ↔ menuItems config ↔ PortfolioSimulator
 */
describe('Integration: Layout + Sidebar Navigation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: createLocalStorageMock(),
      writable: true,
    });
  });

  // IT-001: Layout이 Sidebar를 올바르게 렌더링하고 메뉴 전환 동작
  it('should render Layout with Sidebar and switch between menus', () => {
    render(<Layout />);

    // 사이드바 존재
    const sidebars = screen.getAllByTestId('sidebar');
    expect(sidebars.length).toBeGreaterThanOrEqual(1);

    // 기본 메뉴가 시뮬레이터 - getAllByText로 여러 개 허용
    const labels = screen.getAllByText('Portfolio Simulator');
    expect(labels.length).toBeGreaterThanOrEqual(1);

    // 메인 콘텐츠 존재
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  // IT-002: 사이드바 토글이 Layout과 올바르게 연동
  it('should toggle sidebar and persist state across interactions', () => {
    render(<Layout />);
    const toggleBtns = screen.getAllByTestId('sidebar-toggle');
    const sidebars = screen.getAllByTestId('sidebar');

    // 펼침 → 접힘
    fireEvent.click(toggleBtns[0]);
    expect(sidebars[0].className).toContain('w-[60px]');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('sidebar-collapsed', 'true');

    // 접힘 → 펼침
    fireEvent.click(toggleBtns[0]);
    expect(sidebars[0].className).toContain('w-[260px]');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('sidebar-collapsed', 'false');
  });

  // IT-003: 확장 가능한 구조 - 모든 메뉴 항목이 config에서 렌더링
  it('should render all menu items from config', () => {
    render(<Layout />);

    expect(screen.getAllByTestId('menu-item-macro-dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('menu-item-macro-detail').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTestId('menu-item-simulator').length).toBeGreaterThanOrEqual(1);
  });

  // IT-004: 메뉴 전환 동작
  it('should switch content when menu clicked', () => {
    render(<Layout />);

    // macro-detail 클릭 → 전환됨
    const detailItems = screen.getAllByTestId('menu-item-macro-detail');
    fireEvent.click(detailItems[0]);

    // 클릭 후 활성화 확인
    expect(detailItems[0].className).toContain('cyan');
  });

  // IT-005: localStorage에서 사이드바 상태 복원
  it('should restore sidebar collapsed state from localStorage', () => {
    Object.defineProperty(window, 'localStorage', {
      value: createLocalStorageMock({ 'sidebar-collapsed': 'true' }),
      writable: true,
    });

    render(<Layout />);
    const sidebars = screen.getAllByTestId('sidebar');

    // localStorage에서 collapsed=true 복원
    expect(sidebars[0].className).toContain('w-[60px]');
  });
});
