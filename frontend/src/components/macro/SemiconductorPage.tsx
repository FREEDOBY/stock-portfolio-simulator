/** 반도체 레짐 전용 페이지 (사이드바 메뉴)
 *
 * 대시보드에서 분리한 반도체 레짐 판정기를 단독 페이지로 제공.
 * 이후 코스피 저점 판정기와 함께 "반도체/메모리 사이클" 축을 형성.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchDashboard } from '../../api/macro';
import { SemiconductorRegime } from './SemiconductorRegime';
import type { DashboardData } from '../../types/macro';

export function SemiconductorPage() {
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
      setError(err instanceof Error ? err.message : 'Failed to load regime data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <div data-testid="loading-state" className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm font-mono text-slate-500">Loading semiconductor regime...</p>
          <p className="text-sm font-mono text-slate-700 mt-1">Fetching memory & logic equities</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="error-state" className="bg-[#111827] border border-red-500/30 rounded-lg p-6 text-center">
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

  if (!data?.semiconductor) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <SemiconductorRegime data={data.semiconductor} onUpdate={load} />
    </div>
  );
}
