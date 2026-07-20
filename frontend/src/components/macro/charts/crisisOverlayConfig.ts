/**
 * 경제위기 오버레이 데이터 + 유틸
 * @implements REQ-001, REQ-002, REQ-007
 */

export interface CrisisOverlay {
  start: string;   // YYYY-MM-DD
  end: string;
  label: string;
  type: 'recession' | 'correction' | 'volatility';
}

export interface SignalMarker {
  date: string;
  type: 'buy' | 'sell';
  signal_id: number;
  reason: string;
}

/** NBER 공식 경기침체 구간 */
export const NBER_RECESSIONS: CrisisOverlay[] = [
  { start: '2001-03-01', end: '2001-11-30', label: 'Dot-com Recession', type: 'recession' },
  { start: '2007-12-01', end: '2009-06-30', label: 'Great Financial Crisis', type: 'recession' },
  { start: '2020-02-01', end: '2020-04-30', label: 'COVID-19 Recession', type: 'recession' },
];

/** 비공식 조정장/약세장 (나스닥 -15% 이상) */
export const MARKET_CORRECTIONS: CrisisOverlay[] = [
  { start: '2011-04-01', end: '2011-10-31', label: 'EU Debt Crisis (-19%)', type: 'correction' },
  { start: '2015-08-01', end: '2016-02-28', label: 'China Slowdown (-18%)', type: 'correction' },
  { start: '2018-10-01', end: '2018-12-24', label: 'Q4 Selloff (-24%)', type: 'correction' },
  { start: '2022-01-01', end: '2022-12-28', label: 'Fed Hike Bear Market (-35%)', type: 'correction' },
  { start: '2025-02-19', end: '2025-04-08', label: 'Tariff Shock (-20%)', type: 'correction' },
];

/** 기간에 맞는 오버레이만 필터 */
export function filterOverlaysByPeriod(
  overlays: CrisisOverlay[],
  months: number,
): CrisisOverlay[] {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  return overlays.filter((o) => o.end >= cutoffStr);
}

/** 오버레이 색상 */
export const OVERLAY_COLORS = {
  recession: { fill: '#64748b', opacity: 0.12, stroke: '#64748b' },
  correction: { fill: '#ef4444', opacity: 0.08, stroke: '#ef4444' },
  volatility: { fill: '#f59e0b', opacity: 0.12, stroke: '#f59e0b' },
};

/** 시그널 마커 색상 */
export const MARKER_COLORS = {
  buy: '#10b981',
  sell: '#ef4444',
};
