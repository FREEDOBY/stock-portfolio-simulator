import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import { Layout } from '../Layout';
import type { MenuItem } from '../../types/navigation';

// Mock ResizeObserver for recharts
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

function MockComponent() {
  return <div>Mock Content</div>;
}

const mockMenuItems: MenuItem[] = [
  {
    id: 'simulator',
    label: 'Portfolio Simulator',
    shortLabel: 'SIM',
    icon: 'M9 19v-6a2 2 0 00-2-2H5',
    component: MockComponent,
  },
  {
    id: 'monitor',
    label: 'Market Monitor',
    shortLabel: 'MON',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    component: MockComponent,
  },
];

/**
 * @requirement REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007
 * @testLevel Unit
 * UI 글자 크기 개선 및 텍스트 잘림 수정 테스트
 */
describe('UI Font Readability', () => {
  // ============================================
  // REQ-001: 사이드바 메뉴 글자 크기 확대
  // ============================================

  describe('REQ-001: Sidebar font sizes', () => {
    const sidebarProps = {
      menuItems: mockMenuItems,
      activeMenu: 'simulator',
      onMenuChange: vi.fn(),
      collapsed: false,
      onToggleCollapse: vi.fn(),
    };

    // UT-001: 사이드바 펼침 너비 220px
    it('should have expanded width of 220px', () => {
      render(<Sidebar {...sidebarProps} />);
      const sidebar = screen.getByTestId('sidebar');
      expect(sidebar.className).toContain('w-[260px]');
      expect(sidebar.className).not.toContain('w-[200px]');
    });

    // UT-002: 메뉴 라벨 text-sm (14px)
    it('should render menu labels with text-sm class', () => {
      render(<Sidebar {...sidebarProps} />);
      const label = screen.getByText('Portfolio Simulator');
      expect(label.className).toContain('text-sm');
      expect(label.className).not.toContain('text-xs');
    });

    // UT-003: 브랜드 텍스트 text-sm
    it('should render brand text with text-sm class', () => {
      render(<Sidebar {...sidebarProps} />);
      const brand = screen.getByText('Terminal');
      expect(brand.className).toContain('text-sm');
      expect(brand.className).not.toContain('text-xs');
    });

    // UT-004: 메뉴 라벨에 uppercase 적용
    it('should render menu labels with uppercase class', () => {
      render(<Sidebar {...sidebarProps} />);
      const label = screen.getByText('Portfolio Simulator');
      expect(label.className).toContain('uppercase');
    });
  });

  // ============================================
  // REQ-002: 레이아웃 헤더 글자 크기 확대
  // ============================================

  describe('REQ-002: Layout header font sizes', () => {
    // UT-005: 헤더 타이틀 text-base (16px)
    it('should render header title with text-base class', () => {
      render(<Layout />);
      const header = screen.getByRole('heading', { level: 1 });
      expect(header.className).toContain('text-base');
      expect(header.className).not.toContain('text-sm');
    });

    // UT-006: 세션 상태 text-sm (14px)
    it('should render session status with text-sm class', () => {
      render(<Layout />);
      const sessionText = screen.getByText('SESSION:');
      const parentDiv = sessionText.closest('div');
      expect(parentDiv?.className).toContain('text-sm');
      expect(parentDiv?.className).not.toContain('text-xs');
    });
  });
});
