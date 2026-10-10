import { useState, useEffect } from 'react';
import { PortfolioBuilder } from './PortfolioBuilder';
import { SimulationSettings, type Settings } from './SimulationSettings';
import { PerformanceChart } from './PerformanceChart';
import { MetricsTable } from './MetricsTable';
import { PortfolioPieChart } from './PortfolioPieChart';
import { SavedPortfolioList } from './SavedPortfolioList';
import { DividendSection } from './DividendSection';
import { ComparisonPanel } from './ComparisonPanel';
import { runBacktest } from '../api';
import { COMPARE_COLORS, exportReport } from '../utils/htmlExport';
import type {
  PortfolioItem,
  BacktestResult,
  BacktestRequest,
  BenchmarkType,
  SavedPortfolio,
  ComparisonEntry,
} from '../types';

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
  const [comparison, setComparison] = useState<ComparisonEntry[] | null>(null);
  const [isComparing, setIsComparing] = useState(false);

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

  const buildRequest = (items: PortfolioItem[], s: Settings): BacktestRequest => ({
    portfolio: items.map((p) => ({
      symbol: p.symbol,
      weight: p.weight / 100,
    })),
    start_date: s.startDate,
    end_date: s.endDate,
    initial_amount: s.initialAmount,
    rebalance: s.rebalance,
    investment_type: s.investmentType,
    dca_settings:
      s.investmentType === 'dca'
        ? { frequency: s.dcaFrequency, amount: s.dcaAmount }
        : undefined,
    ma_dca_settings:
      s.investmentType === 'ma_dca'
        ? {
            frequency: s.dcaFrequency,
            amount: s.dcaAmount,
            ma_period: s.maPeriod,
            multiplier: s.maMultiplier,
          }
        : undefined,
  });

  const toErrorMessage = (err: unknown) =>
    err instanceof Error && err.message ? err.message : '백테스트 실행 중 오류가 발생했습니다';

  const handleRun = async () => {
    if (!canRun) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await runBacktest(buildRequest(portfolio, settings));
      setResult(response);
      setComparison(null); // 단일 실행 시 비교 뷰 해제
    } catch (err: unknown) {
      console.error('Backtest failed:', err);
      setError(toErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  /** 저장된 포트폴리오들을 동시 백테스트해 비교 뷰 표시
   *
   * 기간(시작·종료일)은 공정 비교를 위해 현재 설정으로 통일하고,
   * 매수방식·금액·리밸런싱은 각 저장본의 설정을 따른다 (미저장 구버전은 현재 설정).
   */
  const handleCompare = async (selected: SavedPortfolio[]) => {
    if (selected.length < 2) return;
    setIsComparing(true);
    setError(null);

    try {
      const results = await Promise.all(
        selected.map((sp) => {
          const effective: Settings = {
            ...settings,
            ...(sp.settings ?? {}),
            startDate: settings.startDate,
            endDate: settings.endDate,
          };
          return runBacktest(buildRequest(sp.portfolio, effective));
        }),
      );
      const nameCount = new Map<string, number>();
      setComparison(
        selected.map((sp, i) => {
          const n = (nameCount.get(sp.name) ?? 0) + 1;
          nameCount.set(sp.name, n);
          return {
            saved: sp,
            result: results[i],
            color: COMPARE_COLORS[i],
            label: n > 1 ? `${sp.name} (${n})` : sp.name,
          };
        }),
      );
    } catch (err: unknown) {
      console.error('Comparison failed:', err);
      setError(toErrorMessage(err));
    } finally {
      setIsComparing(false);
    }
  };

  /** 단일 백테스트 결과를 HTML 리포트로 다운로드 */
  const handleExportSingle = () => {
    if (!result) return;
    const last = result.portfolio_values[result.portfolio_values.length - 1]?.value ?? 0;
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    exportReport({
      title: 'Portfolio Backtest Report',
      mode: 'currency',
      series: [
        {
          name: 'PORTFOLIO',
          color: COMPARE_COLORS[0],
          points: result.portfolio_values.map((p) => ({ date: p.date, value: p.value })),
        },
        ...selectedBenchmarks.map((b, i) => ({
          name: b,
          color: COMPARE_COLORS[i + 1],
          points: result.benchmarks[b].map((p) => ({ date: p.date, value: p.value })),
        })),
      ],
      metricsColumns: [
        {
          name: 'PORTFOLIO',
          color: COMPARE_COLORS[0],
          metrics: result.metrics,
          invested: result.total_invested,
          finalValue: last,
        },
        ...selectedBenchmarks.map((b, i) => ({
          name: b,
          color: COMPARE_COLORS[i + 1],
          metrics: result.benchmark_metrics[b],
          invested: result.total_invested,
          finalValue: result.benchmarks[b][result.benchmarks[b].length - 1]?.value ?? 0,
        })),
      ],
      settingsSummary: `${portfolio.map((p) => `${p.symbol} ${p.weight}%`).join(' · ')} | ${settings.startDate} ~ ${settings.endDate} · Initial $${settings.initialAmount.toLocaleString()} · Rebalance: ${settings.rebalance}`,
      filename: `portfolio-report-${stamp}.html`,
    });
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
            currentSettings={settings}
            onLoad={(p, s) => {
              setPortfolio(p);
              if (s) setSettings({ ...getDefaultSettings(), ...s });
            }}
            onCompare={handleCompare}
            isComparing={isComparing}
          />
          <SimulationSettings
            settings={settings}
            setSettings={setSettings}
            onRun={handleRun}
            isLoading={isLoading}
            canRun={canRun}
          />
        </div>

        {/* 오른쪽: 결과 (비교 뷰 우선) */}
        <div className="lg:col-span-2 space-y-4">
          {comparison ? (
            <ComparisonPanel
              entries={comparison}
              settings={settings}
              onClose={() => setComparison(null)}
            />
          ) : result ? (
            <>
              <div className="flex justify-end">
                <button
                  onClick={handleExportSingle}
                  className="px-3 py-1 text-sm font-mono rounded bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  EXPORT HTML
                </button>
              </div>
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
