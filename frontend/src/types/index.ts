export interface PortfolioItem {
  symbol: string;
  name: string;
  weight: number;
}

export interface ETFInfo {
  symbol: string;
  name: string;
  expense_ratio?: number;
}

export interface BacktestMetrics {
  cagr: number;
  mdd: number;
  sharpe_ratio: number;
  volatility: number;
}

export interface PortfolioValue {
  date: string;
  value: number;
}

export interface BacktestResult {
  portfolio_values: PortfolioValue[];
  benchmarks: {
    QQQ: PortfolioValue[];
    SPY: PortfolioValue[];
  };
  metrics: BacktestMetrics;
  benchmark_metrics: {
    QQQ: BacktestMetrics;
    SPY: BacktestMetrics;
  };
  total_invested: number;
}

export type InvestmentType = 'lump_sum' | 'dca';
export type DCAFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface DCASettings {
  frequency: DCAFrequency;
  amount: number;
}

export interface BacktestRequest {
  portfolio: { symbol: string; weight: number }[];
  start_date: string;
  end_date: string;
  initial_amount: number;
  rebalance: string;
  investment_type: InvestmentType;
  dca_settings?: DCASettings;
}
