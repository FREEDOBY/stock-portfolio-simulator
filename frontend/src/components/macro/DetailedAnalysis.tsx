import { useState, useEffect, useMemo } from 'react';
import { fetchCategoryDetail } from '../../api/macro';
import { CATEGORY_CONFIG } from '../../types/macro';
import { BusinessCycleTab } from './tabs/BusinessCycleTab';
import { LiquidityTab } from './tabs/LiquidityTab';
import { TechnicalTab } from './tabs/TechnicalTab';
import { SentimentTab } from './tabs/SentimentTab';
import { ValuationTab } from './tabs/ValuationTab';

const TAB_IDS = ['business_cycle', 'liquidity', 'technical', 'sentiment', 'valuation'] as const;
type TabId = typeof TAB_IDS[number];

const PERIOD_OPTIONS = [
  { id: '3y', label: '3Y', months: 36 },
  { id: '5y', label: '5Y', months: 60 },
  { id: '10y', label: '10Y', months: 120 },
] as const;
type PeriodId = typeof PERIOD_OPTIONS[number]['id'];

/** 날짜 문자열 배열에서 months개월 이내 데이터만 필터 */
function filterByPeriod<T extends { date: string; value: number }>(
  data: T[],
  months: number,
): T[] {
  if (!data || data.length === 0) return data;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  return data.filter((d) => d.date >= cutoffStr);
}

/** 전체 데이터 객체의 모든 시리즈를 기간 필터링 */
function filterAllSeries(
  data: Record<string, unknown>,
  months: number,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === 'object' &&
      'data' in value &&
      Array.isArray((value as Record<string, unknown>).data)
    ) {
      // FRED 시리즈 형태: { series_id, name, data: [{date, value}], status }
      const series = value as Record<string, unknown>;
      filtered[key] = {
        ...series,
        data: filterByPeriod(
          series.data as Array<{ date: string; value: number }>,
          months,
        ),
      };
    } else if (Array.isArray(value) && value.length > 0 && value[0]?.date !== undefined) {
      // 배열 형태: [{date, value}]
      filtered[key] = filterByPeriod(value as Array<{ date: string; value: number }>, months);
    } else if (
      value &&
      typeof value === 'object' &&
      'line' in value
    ) {
      // MACD 형태: { line: [], signal: [], histogram: [] }
      const macd = value as Record<string, Array<{ date: string; value: number }>>;
      filtered[key] = {
        line: filterByPeriod(macd.line || [], months),
        signal: filterByPeriod(macd.signal || [], months),
        histogram: filterByPeriod(macd.histogram || [], months),
      };
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

interface Props {
  initialTab?: string;
  [key: string]: unknown;
}

export function DetailedAnalysis({ initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(
    (initialTab as TabId) || 'business_cycle'
  );
  const [period, setPeriod] = useState<PeriodId>('10y');
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchCategoryDetail(activeTab);
        setRawData(result);
      } catch (err) {
        console.error('Failed to load category:', err);
        setRawData(null);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [activeTab]);

  // 기간 필터링 적용
  const selectedMonths = PERIOD_OPTIONS.find((p) => p.id === period)?.months ?? 120;
  const data = useMemo(() => {
    if (!rawData) return null;
    return filterAllSeries(rawData, selectedMonths);
  }, [rawData, selectedMonths]);

  const renderTabContent = () => {
    if (!data) return null;

    switch (activeTab) {
      case 'business_cycle':
        return <BusinessCycleTab data={data as Record<string, { data: Array<{ date: string; value: number }> }>} />;
      case 'liquidity':
        return <LiquidityTab data={data as Record<string, { data: Array<{ date: string; value: number }> }>} />;
      case 'technical':
        return <TechnicalTab data={data} />;
      case 'sentiment':
        return <SentimentTab data={data as Record<string, { data: Array<{ date: string; value: number }> }>} />;
      case 'valuation':
        return <ValuationTab data={data as Record<string, { data: Array<{ date: string; value: number }> }>} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* 탭 버튼 + 기간 선택 */}
      <div className="flex items-center justify-between bg-[#111827] border border-slate-700/50 rounded-lg p-1.5">
        <div className="flex gap-1 overflow-x-auto">
          {TAB_IDS.map((tabId) => {
            const config = CATEGORY_CONFIG[tabId];
            const isActive = activeTab === tabId;
            return (
              <button
                key={tabId}
                data-testid={`tab-${tabId}`}
                onClick={() => setActiveTab(tabId)}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-mono uppercase tracking-wider transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-400'
                    : 'text-slate-500 hover:text-slate-400 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={config?.icon || ''} />
                </svg>
                {config?.label || tabId}
              </button>
            );
          })}
        </div>

        {/* 기간 선택 */}
        <div className="flex gap-0.5 ml-3 flex-shrink-0 bg-[#0a0e17] rounded p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${
                period === opt.id
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                  : 'text-slate-600 hover:text-slate-400 border border-transparent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div data-testid="tab-content">
        {isLoading ? (
          <div data-testid="tab-loading" className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin h-6 w-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm font-mono text-slate-500">Loading {CATEGORY_CONFIG[activeTab]?.label}...</p>
            </div>
          </div>
        ) : (
          renderTabContent()
        )}
      </div>
    </div>
  );
}
