import { useState, useEffect } from 'react';
import { PortfolioBuilder } from './PortfolioBuilder';
import { SimulationSettings, type Settings } from './SimulationSettings';
import { PerformanceChart } from './PerformanceChart';
import { MetricsTable } from './MetricsTable';
import { PortfolioPieChart } from './PortfolioPieChart';
import { SavedPortfolioList } from './SavedPortfolioList';
import { DividendSection } from './DividendSection';
import { runBacktest } from '../api';
import type { PortfolioItem, BacktestResult, BenchmarkType } from '../types';

const STORAGE_KEY = 'portfolio-simulator';

const getDefaultSettings = (): Settings => {
  const today = new Date();
  const fiveYearsAgo = new Date(today);
  fiveYearsAgo.setFullYear(today.getFullYear() - 5);

  return {
    startDate: fiveYearsAgo.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
    initialAmount: 10000,
    rebalance: 'quarterly',
    investmentType: 'lump_sum',
    dcaFrequency: 'monthly',
    dcaAmount: 500,
    maPeriod: 120,
    maMultiplier: 2.0,
  };
};

/**
 * @implements REQ-004
 * 기존 App.tsx에서 추출한 포트폴리오 시뮬레이터 뷰
 */
export function PortfolioSimulator() {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [settings, setSettings] = useState(getDefaultSettings());
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<BenchmarkType[]>(['SPY']);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.portfolio) setPortfolio(data.portfolio);
        if (data.settings) setSettings({ ...getDefaultSettings(), ...data.settings });
      } catch (e) {
        console.error('Failed to restore portfolio:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ portfolio, settings })
    );
  }, [portfolio, settings]);

  const totalWeight = portfolio.reduce((sum, item) => sum + item.weight, 0);
  const canRun = portfolio.length > 0 && totalWeight > 0;

  const handleRun = async () => {
    if (!canRun) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await runBacktest({
        portfolio: portfolio.map((p) => ({
          symbol: p.symbol,
          weight: p.weight / 100,
        })),
        start_date: settings.startDate,
        end_date: settings.endDate,
        initial_amount: settings.initialAmount,
        rebalance: settings.rebalance,
        investment_type: settings.investmentType,
        dca_settings:
          settings.investmentType === 'dca'
            ? { frequency: settings.dcaFrequency, amount: settings.dcaAmount }
            : undefined,
        ma_dca_settings:
          settings.investmentType === 'ma_dca'
            ? {
                frequency: settings.dcaFrequency,
                amount: settings.dcaAmount,
                ma_period: settings.maPeriod,
                multiplier: settings.maMultiplier,
              }
            : undefined,
      });

      setResult(response);
    } catch (err: unknown) {
      console.error('Backtest failed:', err);
      if (err instanceof Error) {
        setError(err.message || '백테스트 실행 중 오류가 발생했습니다');
      } else {
        setError('백테스트 실행 중 오류가 발생했습니다');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* 에러 메시지 */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-400 font-mono text-sm">
          <span className="text-red-500 font-bold">[ERROR]</span> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 왼쪽: 포트폴리오 및 설정 */}
        <div className="space-y-4">
          <PortfolioBuilder
            portfolio={portfolio}
            setPortfolio={setPortfolio}
          />
          {portfolio.length > 0 && (
            <PortfolioPieChart portfolio={portfolio} />
          )}
          <SavedPortfolioList
            currentPortfolio={portfolio}
            onLoad={setPortfolio}
          />
          <SimulationSettings
            settings={settings}
            setSettings={setSettings}
            onRun={handleRun}
            isLoading={isLoading}
            canRun={canRun}
          />
        </div>

        {/* 오른쪽: 결과 */}
        <div className="lg:col-span-2 space-y-4">
          {result ? (
            <>
              <PerformanceChart
                result={result}
                selectedBenchmarks={selectedBenchmarks}
                onBenchmarkChange={setSelectedBenchmarks}
              />
              <MetricsTable
                result={result}
                selectedBenchmarks={selectedBenchmarks}
              />
              {result.dividend_stats && (
                <DividendSection dividendStats={result.dividend_stats} portfolio={portfolio} />
              )}
            </>
          ) : (
            <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-12 text-center">
              <div className="text-slate-600 mb-4">
                <svg
                  className="w-16 h-16 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-mono text-slate-500 mb-2">
                AWAITING SIMULATION
              </h3>
              <p className="text-slate-600 text-sm font-mono">
                Configure portfolio & execute backtest
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
