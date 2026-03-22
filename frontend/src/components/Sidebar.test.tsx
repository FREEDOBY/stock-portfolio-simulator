import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import type { MenuItem } from '../types/navigation';

// Mock component for testing
function MockComponent() {
  return <div>Mock</div>;
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
    disabled: true,
    badge: 'SOON',
  },
];

/**
 * @requirement REQ-001, REQ-002, REQ-003, REQ-005, REQ-009
 * @testLevel Unit
 */
describe('Sidebar', () => {
  const defaultProps = {
    menuItems: mockMenuItems,
    activeMenu: 'simulator',
    onMenuChange: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
  };

  // UT-001: REQ-001 - 사이드바 렌더링
  it('should render sidebar with menu items', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Portfolio Simulator')).toBeInTheDocument();
    expect(screen.getByText('Market Monitor')).toBeInTheDocument();
  });

  // UT-002: REQ-003 - 활성 메뉴 표시
  it('should highlight active menu item', () => {
    render(<Sidebar {...defaultProps} />);
    const activeItem = screen.getByTestId('menu-item-simulator');
    expect(activeItem.className).toContain('border-l');
  });

  // UT-003: REQ-002 - 토글 버튼 클릭
  it('should call onToggleCollapse when toggle button clicked', () => {
    const onToggle = vi.fn();
    render(<Sidebar {...defaultProps} onToggleCollapse={onToggle} />);
    const toggleBtn = screen.getByTestId('sidebar-toggle');
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // UT-004: REQ-002 - 접힌 상태에서 라벨 숨김
  it('should hide labels when collapsed', () => {
    render(<Sidebar {...defaultProps} collapsed={true} />);
    const label = screen.queryByText('Portfolio Simulator');
    // 접힌 상태에서는 라벨이 보이지 않아야 함 (hidden or not rendered)
    expect(label).toBeNull();
  });

  // UT-005: REQ-006 - 메뉴 클릭 시 onMenuChange 호출
  it('should call onMenuChange with menu id when clicked', () => {
    const onChange = vi.fn();
    render(<Sidebar {...defaultProps} onMenuChange={onChange} />);
    const menuItem = screen.getByTestId('menu-item-simulator');
    fireEvent.click(menuItem);
    expect(onChange).toHaveBeenCalledWith('simulator');
  });

  // UT-006: REQ-005 - disabled 메뉴 클릭 시 onMenuChange 미호출
  it('should not call onMenuChange for disabled menu items', () => {
    const onChange = vi.fn();
    render(<Sidebar {...defaultProps} onMenuChange={onChange} />);
    const disabledItem = screen.getByTestId('menu-item-monitor');
    fireEvent.click(disabledItem);
    expect(onChange).not.toHaveBeenCalled();
  });

  // UT-007: REQ-005 - 배지 표시
  it('should display badge on menu items that have one', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('SOON')).toBeInTheDocument();
  });

  // UT-008: REQ-009 - 다크 테마 클래스 적용
  it('should apply dark theme classes', () => {
    render(<Sidebar {...defaultProps} />);
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar.className).toContain('bg-[#0d1117]');
  });
});
