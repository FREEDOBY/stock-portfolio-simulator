/** 부동산 대시보드 공용 유틸 — RealEstate(Flask) templates/index.html에서 1:1 이식 (다크 고정) */

import type { Deal, Pivot, PricePoint } from './types';

/* ── 다크 고정 팔레트 (앱 다크 톤 #0a0e17에 맞춤) ─────────────── */
export const SERIES = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
];

export const THEME = {
  surface: '#111827',   // 카드
  ink: '#f8fafc',
  secondary: '#cbd5e1',
  muted: '#94a3b8',
  grid: '#1f2937',
  baseline: '#475569',
  border: '#1f2937',
  accent: '#3987e5',
  up: '#4ade80',
  down: '#f87171',
};

export const SIGNAL_STYLE: Record<string, { dot: string; txt: string }> = {
  상승: { dot: '#0ca30c', txt: '▲ 상승' },
  고점: { dot: '#fab219', txt: '◆ 고점' },
  하락: { dot: '#d03b3b', txt: '▼ 하락' },
  저점: { dot: '#2a78d6', txt: '● 저점' },
};
export const TREND_ARROW: Record<string, string> = { up: '↑', down: '↓', flat: '→' };
export const PHASE_ORDER = ['상승', '고점', '하락', '저점'];

/* ── 포맷터 ──────────────────────────────────────────────────── */
export const fmtEok = (m: number) => {
  const e = m / 10000;
  return (Number.isInteger(e) ? e : +e.toFixed(2)) + '억';
};
export const eokTxt = (v: number) => +v.toFixed(1) + '억';
export const decYear = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return y + (m - 1 + (dd - 1) / 31) / 12;
};
export const ymIdx = (ym: string) => +ym.slice(0, 4) * 12 + +ym.slice(4);

export const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/* 이상치 필터: 주변 ±6개월 중앙값의 70% 미만 거래(지분거래·가족 간 특수거래 등)는
   추이선/통계에서 제외 (산점도와 거래 내역에는 그대로 표시된다). */
export function dropOutliers(deals: Deal[]): Deal[] {
  const byYm = new Map<string, number[]>();
  deals.forEach((d) => {
    const v = byYm.get(d.ym);
    if (v) v.push(d.amt);
    else byYm.set(d.ym, [d.amt]);
  });
  const yms = [...byYm.keys()];
  const localMed = new Map<string, number>();
  yms.forEach((ym) => {
    const t = ymIdx(ym);
    const vals: number[] = [];
    yms.forEach((y2) => {
      if (Math.abs(ymIdx(y2) - t) <= 6) vals.push(...byYm.get(y2)!);
    });
    localMed.set(ym, median(vals));
  });
  return deals.filter((d) => d.amt >= 0.7 * localMed.get(d.ym)!);
}

/* 월별 중앙값 — 지분거래 등 이상치에 왜곡되지 않도록 평균 대신 중앙값 */
export function monthlyMedian(deals: Deal[]): Map<string, number> {
  const m = new Map<string, number[]>();
  deals.forEach((d) => {
    const v = m.get(d.ym);
    if (v) v.push(d.amt);
    else m.set(d.ym, [d.amt]);
  });
  return new Map(
    [...m.entries()].sort().map(([k, v]) => [k, median(v)])
  );
}

/* ── 고점·저점 감지 (지그재그) ──────────────────────────────── */
export function zigzag(pts: PricePoint[], th: number): Pivot[] {
  if (pts.length < 4) return [];
  const piv: Pivot[] = [];
  let dir = 0;
  let ext = pts[0];
  let lo = pts[0];
  let hi = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (dir === 0) {
      if (p.y > hi.y) hi = p;
      if (p.y < lo.y) lo = p;
      if (p.y <= hi.y * (1 - th)) { piv.push({ ...hi, type: 'H', pct: null }); dir = -1; ext = p; }
      else if (p.y >= lo.y * (1 + th)) { piv.push({ ...lo, type: 'L', pct: null }); dir = 1; ext = p; }
    } else if (dir === 1) {
      if (p.y > ext.y) ext = p;
      else if (p.y <= ext.y * (1 - th)) { piv.push({ ...ext, type: 'H', pct: null }); dir = -1; ext = p; }
    } else {
      if (p.y < ext.y) ext = p;
      else if (p.y >= ext.y * (1 + th)) { piv.push({ ...ext, type: 'L', pct: null }); dir = 1; ext = p; }
    }
  }
  if (dir !== 0) piv.push({ ...ext, type: dir === 1 ? 'H' : 'L', open: true, pct: null });
  piv.forEach((p, i) => { p.pct = i ? (p.y / piv[i - 1].y - 1) * 100 : null; });
  return piv;
}

/* 기간에 맞는 진폭 임계값을 골라 고저점이 8개 이하가 되게 한다 */
export function autoPivots(pts: PricePoint[]): Pivot[] {
  for (const th of [0.08, 0.12, 0.15, 0.2, 0.25]) {
    const piv = zigzag(pts, th);
    if (piv.length <= 8) return piv;
  }
  return zigzag(pts, 0.3);
}
