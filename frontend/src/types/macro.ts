/** 매크로 대시보드 타입 정의 */

export type SignalStatus = 'buy' | 'sell' | 'wait';
export type SignalVerdict = 'aggressive_buy' | 'buy' | 'hold' | 'caution' | 'sell';
export type CategoryStatus = 'bullish' | 'bearish' | 'neutral' | 'fear' | 'overvalued';

export interface SignalResult {
  signal_id: number;
  name: string;
  score: number;
  weight: number;
  status: SignalStatus;
  reason: string;
}

export interface SignalHistoryEntry {
  date: string;
  signal_id: number;
  prev_status: SignalStatus;
  new_status: SignalStatus;
  reason: string;
}

export interface CategorySummary {
  status: CategoryStatus;
  key_values: Record<string, number | string | null>;
}

export interface OverallResult {
  score: number;
  verdict: SignalVerdict;
  signals: SignalResult[];
  history: SignalHistoryEntry[];
  updated_at: string;
}

export interface RecessionCheck {
  id: string;
  name: string;
  triggered: boolean;
  weight: number;
  value: number | null;
  detail: string;
}

export interface RecessionWarning {
  score: number;
  level: 'normal' | 'caution' | 'warning' | 'danger';
  triggered_count: number;
  total_checks: number;
  checks: RecessionCheck[];
}

export interface KostolanyData {
  phase: 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3';
  name: string;
  desc: string;
  action: string;
  color: string;
  inputs: {
    monetary: 'tight' | 'loose';
    fed_rate: number | null;
    vix: number | null;
    sentiment: 'fear' | 'neutral' | 'greed';
  };
}

export interface DashboardData {
  overall: OverallResult;
  categories: Record<string, CategorySummary>;
  recession_warning?: RecessionWarning;
  kostolany?: KostolanyData;
}

export const WARNING_LEVEL_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  normal: { label: 'NORMAL', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.1)' },
  caution: { label: 'CAUTION', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
  warning: { label: 'WARNING', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.1)' },
  danger: { label: 'DANGER', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' },
};

export const VERDICT_CONFIG: Record<SignalVerdict, { label: string; color: string; bgColor: string }> = {
  aggressive_buy: { label: '적극 매수', color: '#00d4aa', bgColor: 'rgba(0, 212, 170, 0.15)' },
  buy: { label: '매수', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.15)' },
  hold: { label: '관망', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)' },
  caution: { label: '주의', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.15)' },
  sell: { label: '매도', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)' },
};

export const SIGNAL_STATUS_CONFIG: Record<SignalStatus, { label: string; color: string }> = {
  buy: { label: '매수', color: '#10b981' },
  sell: { label: '매도', color: '#ef4444' },
  wait: { label: '대기', color: '#64748b' },
};

export const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  business_cycle: { label: '경기 사이클', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  liquidity: { label: '유동성 & 금리', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  technical: { label: '기술적 시그널', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  sentiment: { label: '시장 심리', icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  valuation: { label: '밸류에이션', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  labor_household: { label: '노동시장 & 가계', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
};
