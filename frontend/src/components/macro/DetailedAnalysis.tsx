import { useState, useEffect } from 'react';
import { fetchCategoryDetail } from '../../api/macro';
import { CATEGORY_CONFIG } from '../../types/macro';
import { BusinessCycleTab } from './tabs/BusinessCycleTab';
import { LiquidityTab } from './tabs/LiquidityTab';
import { TechnicalTab } from './tabs/TechnicalTab';
import { SentimentTab } from './tabs/SentimentTab';
import { ValuationTab } from './tabs/ValuationTab';

const TAB_IDS = ['business_cycle', 'liquidity', 'technical', 'sentiment', 'valuation'] as const;
type TabId = typeof TAB_IDS[number];

interface Props {
  initialTab?: string;
}

export function DetailedAnalysis({ initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(
    (initialTab as TabId) || 'business_cycle'
  );
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchCategoryDetail(activeTab);
        setData(result);
      } catch (err) {
        console.error('Failed to load category:', err);
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [activeTab]);

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
      {/* 탭 버튼 */}
      <div className="flex gap-1 bg-[#111827] border border-slate-700/50 rounded-lg p-1.5 overflow-x-auto">
        {TAB_IDS.map((tabId) => {
          const config = CATEGORY_CONFIG[tabId];
          const isActive = activeTab === tabId;
          return (
            <button
              key={tabId}
              data-testid={`tab-${tabId}`}
              onClick={() => setActiveTab(tabId)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-xs font-mono uppercase tracking-wider transition-all whitespace-nowrap ${
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

      {/* 탭 콘텐츠 */}
      <div data-testid="tab-content">
        {isLoading ? (
          <div data-testid="tab-loading" className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin h-6 w-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-xs font-mono text-slate-500">Loading {CATEGORY_CONFIG[activeTab]?.label}...</p>
            </div>
          </div>
        ) : (
          renderTabContent()
        )}
      </div>
    </div>
  );
}
