/** 베어장 위험 전용 페이지 (사이드바 메뉴)
 *
 * 유형별 4축(긴축·버블·신용·쇼크) 판정 + 30년 소급 검증 차트.
 * 대시보드 응답의 bear_market_risk 키를 사용 (별도 API 없음).
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchDashboard } from '../../api/macro';
import { BearRiskPanel } from './BearRiskPanel';
import type { DashboardData } from '../../types/macro';

export function BearRiskPage() {
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
      setError(err instanceof Error ? err.message : 'Failed to load bear risk data');
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
          <p className="text-sm font-mono text-slate-500">Loading bear market risk...</p>
          <p className="text-sm font-mono text-slate-700 mt-1">Computing 30-year axis history</p>
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

  if (!data?.bear_market_risk?.available) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <BearRiskPanel data={data.bear_market_risk} />
    </div>
  );
}
