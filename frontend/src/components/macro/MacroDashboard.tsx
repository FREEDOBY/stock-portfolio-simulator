import { useState, useEffect, useCallback } from 'react';
import { fetchDashboard } from '../../api/macro';
import { VerdictBanner } from './VerdictBanner';
import { RecessionWarningBanner } from './RecessionWarningBanner';
import { KostolanyEgg } from './charts/KostolanyEgg';
import { CategoryCard } from './CategoryCard';
import { SignalTable } from './SignalTable';
import { SignalHistory } from './SignalHistory';
import type { DashboardData } from '../../types/macro';
import { CATEGORY_CONFIG } from '../../types/macro';

interface Props {
  onNavigateToDetail?: (tab: string) => void;
  [key: string]: unknown;
}

export function MacroDashboard({ onNavigateToDetail }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchDashboard();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load macro data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 로딩
  if (isLoading) {
    return (
      <div data-testid="loading-state" className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm font-mono text-slate-500">Loading macro data...</p>
          <p className="text-sm font-mono text-slate-700 mt-1">Fetching FRED + Yahoo Finance</p>
        </div>
      </div>
    );
  }

  // 에러
  if (error) {
    return (
      <div data-testid="error-state" className="bg-[#111827] border border-red-500/30 rounded-lg p-6 text-center">
        <div className="text-red-400 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-sm font-mono text-red-400 mb-1">[ERROR] {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 px-4 py-1.5 text-sm font-mono bg-red-500/10 border border-red-500/30 text-red-400 rounded hover:bg-red-500/20 transition-colors"
        >
          RETRY
        </button>
      </div>
    );
  }

  if (!data) return null;

  const categoryIds = Object.keys(CATEGORY_CONFIG);

  return (
    <div data-testid="macro-dashboard" className="max-w-6xl mx-auto space-y-4">
      {/* 종합 판정 + 침체 경고 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VerdictBanner overall={data.overall} />
        {data.recession_warning && (
          <RecessionWarningBanner warning={data.recession_warning} />
        )}
      </div>

      {/* 코스톨라니 달걀모델 */}
      {data.kostolany && <KostolanyEgg data={data.kostolany} />}

      {/* 카테고리 요약 카드 5개 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {categoryIds.map((catId) => {
          const summary = data.categories[catId];
          if (!summary) return null;
          return (
            <CategoryCard
              key={catId}
              categoryId={catId}
              summary={summary}
              onClick={() => onNavigateToDetail?.(catId)}
            />
          );
        })}
      </div>

      {/* 시그널 상태 테이블 + 히스토리 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SignalTable signals={data.overall.signals} />
        <SignalHistory history={data.overall.history} />
      </div>
    </div>
  );
}
