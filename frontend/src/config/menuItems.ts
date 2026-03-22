import { PortfolioSimulator } from '../components/PortfolioSimulator';
import { MacroDashboard } from '../components/macro/MacroDashboard';
import { DetailedAnalysis } from '../components/macro/DetailedAnalysis';
import { ComingSoon } from '../components/ComingSoon';
import type { MenuItem } from '../types/navigation';

/**
 * @implements REQ-005
 * 메뉴 항목 config - 새 기능 추가 시 이 배열에 항목만 추가하면 됩니다.
 */
export const menuItems: MenuItem[] = [
  {
    id: 'simulator',
    label: 'Portfolio Simulator',
    shortLabel: 'SIM',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    component: PortfolioSimulator,
  },
  {
    id: 'macro-dashboard',
    label: 'Macro Dashboard',
    shortLabel: 'MCR',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    component: MacroDashboard,
    badge: 'NEW',
  },
  {
    id: 'macro-detail',
    label: 'Detailed Analysis',
    shortLabel: 'DTL',
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    component: DetailedAnalysis,
    badge: 'NEW',
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'SET',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    component: ComingSoon,
    disabled: true,
    badge: 'SOON',
  },
];
