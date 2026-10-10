import { PortfolioSimulator } from '../components/PortfolioSimulator';
import { MacroDashboard } from '../components/macro/MacroDashboard';
import {
  BusinessCyclePage,
  LiquidityPage,
  TechnicalPage,
  SentimentPage,
  ValuationPage,
  LaborHouseholdPage,
} from '../components/macro/CategoryPages';
import { SemiconductorPage } from '../components/macro/SemiconductorPage';
import { RealEstateDashboard } from '../components/realestate/RealEstateDashboard';
import { BearRiskPage } from '../components/macro/BearRiskPage';
import { KospiBottomPage } from '../components/macro/KospiBottomPage';
import { NasdaqBottomPage } from '../components/macro/NasdaqBottomPage';
import { ChinaEtfPage } from '../components/macro/ChinaEtfPage';
import { CATEGORY_CONFIG } from '../types/macro';
import type { MenuItem } from '../types/navigation';

/**
 * @implements REQ-005
 * 사이드바 메뉴 config — section으로 그룹화.
 * 매크로 상세 6개는 CategoryDetail 독립 페이지(id = 카테고리 id, 대시보드 카드 클릭과 연결).
 */
export const menuItems: MenuItem[] = [
  // ── 개요 ──
  {
    id: 'macro-dashboard',
    label: 'Macro Dashboard',
    shortLabel: 'MCR',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    component: MacroDashboard,
    section: '개요',
  },
  // ── 매크로 상세 ──
  {
    id: 'business_cycle',
    label: CATEGORY_CONFIG.business_cycle.label,
    shortLabel: 'CYC',
    icon: CATEGORY_CONFIG.business_cycle.icon,
    component: BusinessCyclePage,
    section: '매크로 상세',
  },
  {
    id: 'liquidity',
    label: CATEGORY_CONFIG.liquidity.label,
    shortLabel: 'LIQ',
    icon: CATEGORY_CONFIG.liquidity.icon,
    component: LiquidityPage,
    section: '매크로 상세',
  },
  {
    id: 'technical',
    label: CATEGORY_CONFIG.technical.label,
    shortLabel: 'TEC',
    icon: CATEGORY_CONFIG.technical.icon,
    component: TechnicalPage,
    section: '매크로 상세',
  },
  {
    id: 'sentiment',
    label: CATEGORY_CONFIG.sentiment.label,
    shortLabel: 'SEN',
    icon: CATEGORY_CONFIG.sentiment.icon,
    component: SentimentPage,
    section: '매크로 상세',
  },
  {
    id: 'valuation',
    label: CATEGORY_CONFIG.valuation.label,
    shortLabel: 'VAL',
    icon: CATEGORY_CONFIG.valuation.icon,
    component: ValuationPage,
    section: '매크로 상세',
  },
  {
    id: 'labor_household',
    label: CATEGORY_CONFIG.labor_household.label,
    shortLabel: 'LAB',
    icon: CATEGORY_CONFIG.labor_household.icon,
    component: LaborHouseholdPage,
    section: '매크로 상세',
  },
  // ── 사이클 · 저점 ──
  {
    id: 'bear-risk',
    label: 'Bear Market Risk',
    shortLabel: 'BEAR',
    icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6',
    component: BearRiskPage,
    section: '사이클 · 저점',
  },
  {
    id: 'semiconductor',
    label: 'Semiconductor Regime',
    shortLabel: 'SEMI',
    icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
    component: SemiconductorPage,
    section: '사이클 · 저점',
  },
  {
    id: 'kospi-bottom',
    label: 'KOSPI Bottom',
    shortLabel: 'KBOT',
    icon: 'M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6',
    component: KospiBottomPage,
    section: '사이클 · 저점',
  },
  {
    id: 'nasdaq-bottom',
    label: 'NASDAQ Bottom',
    shortLabel: 'NBOT',
    icon: 'M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6',
    component: NasdaqBottomPage,
    section: '사이클 · 저점',
  },
  {
    id: 'china-etf',
    label: 'China ETF',
    shortLabel: 'CHN',
    icon: 'M3 12h18M3 12c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9-9-4.03-9-9zm9-9c2.5 2.5 3.75 5.63 3.75 9S14.5 18.5 12 21m0-18C9.5 5.5 8.25 8.63 8.25 12S9.5 18.5 12 21',
    component: ChinaEtfPage,
    section: '사이클 · 저점',
  },
  // ── 부동산 ──
  {
    id: 'realestate',
    label: '부동산 시장분석',
    shortLabel: 'APT',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    component: RealEstateDashboard,
    section: '부동산',
  },
  // ── 도구 ──
  {
    id: 'simulator',
    label: 'Portfolio Simulator',
    shortLabel: 'SIM',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    component: PortfolioSimulator,
    section: '도구',
  },
];
