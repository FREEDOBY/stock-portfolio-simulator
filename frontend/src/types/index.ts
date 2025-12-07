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
  invested?: number;  // 해당 날짜까지의 누적 투자원금 (적립식일 때만 포함)
}

export interface MonthlyDividend {
  month: string;
  amount: number;
  by_etf: Record<string, number>;
}

export interface DividendStats {
  total_dividends: number;
  dividend_yield: number;
  monthly_average: number;
  monthly_data: MonthlyDividend[];
  by_etf: Record<string, number>;
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
  dividend_stats?: DividendStats;
}

export type BenchmarkType = 'QQQ' | 'SPY';

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

export interface SavedPortfolio {
  id: string;
  name: string;
  portfolio: PortfolioItem[];
  createdAt: string;
  updatedAt: string;
}
