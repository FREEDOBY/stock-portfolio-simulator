/** 단일 매크로 카테고리 상세 (사이드바 독립 페이지용)
 *
 * 기존 DetailedAnalysis의 탭 하나를 독립 페이지로. 탭 바 제거, categoryId 고정.
 * 기간·오버레이 컨트롤은 localStorage에 저장 → 카테고리 페이지를 넘나들어도 유지(공유).
 */
import { useState, useEffect, useMemo } from 'react';
import { fetchCategoryDetail, fetchSignalHistory } from '../../api/macro';
import { CATEGORY_CONFIG } from '../../types/macro';
import { BusinessCycleTab } from './tabs/BusinessCycleTab';
import { LiquidityTab } from './tabs/LiquidityTab';
import { TechnicalTab } from './tabs/TechnicalTab';
import { SentimentTab } from './tabs/SentimentTab';
import { ValuationTab } from './tabs/ValuationTab';
import { LaborHouseholdTab } from './tabs/LaborHouseholdTab';
import {
  NBER_RECESSIONS,
  MARKET_CORRECTIONS,
  filterOverlaysByPeriod,
  type CrisisOverlay,
  type SignalMarker,
} from './charts/crisisOverlayConfig';

const PERIOD_OPTIONS = [
  { id: '3y', label: '3Y', months: 36 },
  { id: '5y', label: '5Y', months: 60 },
  { id: '10y', label: '10Y', months: 120 },
  { id: '20y', label: '20Y', months: 240 },
  { id: '30y', label: '30Y', months: 360 },
] as const;
type PeriodId = typeof PERIOD_OPTIONS[number]['id'];

/** localStorage 유지 상태 */
function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s !== null ? (JSON.parse(s) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };
  return [value, set];
}

function filterByPeriod<T extends { date: string; value: number }>(data: T[], months: number): T[] {
  if (!data || data.length === 0) return data;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().substring(0, 10);
  return data.filter((d) => d.date >= cutoffStr);
}

function filterAllSeries(data: Record<string, unknown>, months: number): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'data' in value && Array.isArray((value as Record<string, unknown>).data)) {
      const series = value as Record<string, unknown>;
      filtered[key] = { ...series, data: filterByPeriod(series.data as Array<{ date: string; value: number }>, months) };
    } else if (Array.isArray(value) && value.length > 0 && value[0]?.date !== undefined) {
      filtered[key] = filterByPeriod(value as Array<{ date: string; value: number }>, months);
    } else if (value && typeof value === 'object' && 'line' in value) {
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
  categoryId: string;
  [key: string]: unknown;
}

export function CategoryDetail({ categoryId }: Props) {
  const [period, setPeriod] = usePersisted<PeriodId>('macro-detail-period', '10y');
  const [showRecessions, setShowRecessions] = usePersisted('macro-detail-ov-recession', true);
  const [showCorrections, setShowCorrections] = usePersisted('macro-detail-ov-correction', true);
  const [showMarkers, setShowMarkers] = usePersisted('macro-detail-ov-markers', true);
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [signalMarkers, setSignalMarkers] = useState<SignalMarker[]>([]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        setRawData(await fetchCategoryDetail(categoryId));
      } catch {
        setRawData(null);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [categoryId]);

  useEffect(() => {
    fetchSignalHistory()
      .then((history: Array<{ date: string; signal_id: number; new_status: string; reason: string }>) => {
        setSignalMarkers(
          history
            .filter((h) => h.new_status === 'buy' || h.new_status === 'sell')
            .map((h) => ({ date: h.date, type: h.new_status as 'buy' | 'sell', signal_id: h.signal_id, reason: h.reason })),
        );
      })
      .catch(() => setSignalMarkers([]));
  }, []);

  const selectedMonths = PERIOD_OPTIONS.find((p) => p.id === period)?.months ?? 120;
  const data = useMemo(() => (rawData ? filterAllSeries(rawData, selectedMonths) : null), [rawData, selectedMonths]);
  const filteredOverlays = useMemo(() => {
    const overlays: CrisisOverlay[] = [];
    if (showRecessions) overlays.push(...filterOverlaysByPeriod(NBER_RECESSIONS, selectedMonths));
    if (showCorrections) overlays.push(...filterOverlaysByPeriod(MARKET_CORRECTIONS, selectedMonths));
    return overlays;
  }, [showRecessions, showCorrections, selectedMonths]);

  const activeMarkers = showMarkers ? signalMarkers : [];
  type TabData = Record<string, { data: Array<{ date: string; value: number }> }>;

  const renderContent = () => {
    if (!data) return null;
    const op = { crisisOverlays: filteredOverlays, signalMarkers: activeMarkers };
    switch (categoryId) {
      case 'business_cycle': return <BusinessCycleTab data={data as TabData} {...op} />;
      case 'liquidity': return <LiquidityTab data={data as TabData} {...op} />;
      case 'technical': return <TechnicalTab data={data} {...op} />;
      case 'sentiment': return <SentimentTab data={data as TabData} {...op} />;
      case 'valuation': return <ValuationTab data={data as TabData} {...op} />;
      case 'labor_household': return <LaborHouseholdTab data={data as TabData} {...op} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* 컨트롤: 오버레이 토글 + 기간 (탭 바 없음) */}
      <div className="flex items-center justify-between bg-[#111827] border border-slate-700/50 rounded-lg p-1.5">
        <div className="flex gap-0.5 bg-[#0a0e17] rounded p-0.5">
          <button onClick={() => setShowRecessions(!showRecessions)}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${showRecessions ? 'bg-slate-500/20 border border-slate-500/40 text-slate-300' : 'text-slate-700 border border-transparent'}`}
            title="NBER 경기침체 구간">Recession</button>
          <button onClick={() => setShowCorrections(!showCorrections)}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${showCorrections ? 'bg-red-500/15 border border-red-500/30 text-red-400' : 'text-slate-700 border border-transparent'}`}
            title="비공식 조정장">Correction</button>
          <button onClick={() => setShowMarkers(!showMarkers)}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${showMarkers ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'text-slate-700 border border-transparent'}`}
            title="시그널 매수/매도 마커">Signals</button>
        </div>
        <div className="flex gap-0.5 bg-[#0a0e17] rounded p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button key={opt.id} onClick={() => setPeriod(opt.id)}
              className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${period === opt.id ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400' : 'text-slate-600 hover:text-slate-400 border border-transparent'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div data-testid="tab-content">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin h-6 w-6 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm font-mono text-slate-500">Loading {CATEGORY_CONFIG[categoryId]?.label}...</p>
            </div>
          </div>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  );
}
