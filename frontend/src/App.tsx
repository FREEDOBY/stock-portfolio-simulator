import { useState, useEffect } from 'react';
import { PortfolioBuilder } from './components/PortfolioBuilder';
import { SimulationSettings, type Settings } from './components/SimulationSettings';
import { PerformanceChart } from './components/PerformanceChart';
import { MetricsTable } from './components/MetricsTable';
import { PortfolioPieChart } from './components/PortfolioPieChart';
import { SavedPortfolioList } from './components/SavedPortfolioList';
import { DividendSection } from './components/DividendSection';
import { runBacktest } from './api';
import type { PortfolioItem, BacktestResult, BenchmarkType } from './types';

const STORAGE_KEY = 'portfolio-simulator';

// 기본 설정
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
  };
};

function App() {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [settings, setSettings] = useState(getDefaultSettings());
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<BenchmarkType[]>(['SPY']);

  // localStorage에서 포트폴리오 복원
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

  // localStorage에 포트폴리오 저장
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
          weight: p.weight / 100, // % -> 소수점
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* 헤더 */}
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">
            주식 포트폴리오 시뮬레이터
          </h1>
          <p className="text-gray-600 mt-2">
            ETF 포트폴리오를 구성하고 QQQ, SPY와 성과를 비교해보세요
          </p>
        </header>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 왼쪽: 포트폴리오 및 설정 */}
          <div className="space-y-6">
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
          <div className="lg:col-span-2 space-y-6">
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
                  <DividendSection dividendStats={result.dividend_stats} />
                )}
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <div className="text-gray-400 mb-4">
                  <svg
                    className="w-16 h-16 mx-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-600 mb-2">
                  시뮬레이션 결과가 없습니다
                </h3>
                <p className="text-gray-500">
                  포트폴리오를 구성하고 시뮬레이션을 실행하세요
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
