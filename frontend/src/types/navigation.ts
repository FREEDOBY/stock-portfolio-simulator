import type { ComponentType } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  shortLabel: string;
  icon: string; // SVG path data
  component: ComponentType<Record<string, unknown>>;
  description?: string;
  section?: string; // 사이드바 그룹 헤더
}

export interface SidebarProps {
  menuItems: MenuItem[];
  activeMenu: string;
  onMenuChange: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}
