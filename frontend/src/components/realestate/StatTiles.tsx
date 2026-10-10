/** 평형별 스탯 타일 (최근 실거래 · 전년 대비 · 신고가 · 24개월 스파크라인) */

import { useMemo } from 'react';
import type { Deal } from '../../lib/realestate/types';
import { THEME, dropOutliers, fmtEok, median, monthlyMedian } from '../../lib/realestate/utils';

function Sparkline({ deals, color }: { deals: Deal[]; color: string }) {
  const avgs = [...monthlyMedian(deals).entries()].slice(-24);
  const W = 200, H = 36;
  if (avgs.length < 2) return <svg width={W} height={H} />;
  const vs = avgs.map((a) => a[1]);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const x = (i: number) => (i / (avgs.length - 1)) * (W - 8) + 4;
  const y = (v: number) => (max === min ? H / 2 : H - 5 - ((v - min) / (max - min)) * (H - 10));
  const d = vs.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
  return (
    <svg width={W} height={H} className="mt-2.5 block">
      <path d={d} fill="none" stroke={THEME.muted} strokeWidth={1.5} strokeLinejoin="round" />
      <circle
        cx={x(vs.length - 1)} cy={y(vs[vs.length - 1])} r={3.5}
        fill={color} stroke={THEME.surface} strokeWidth={2}
      />
    </svg>
  );
}

const ymAdd = (ym: string, k: number) => {
  const t = +ym.slice(0, 4) * 12 + (+ym.slice(4) - 1) + k;
  return `${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, '0')}`;
};

interface Props {
  all: Deal[];
  selected: number[];
  colorOf: Record<number, string>;
  gLabel: (g: number) => string;
}

export function StatTiles({ all, selected, colorOf, gLabel }: Props) {
  const tiles = useMemo(() => {
    const valid = all.filter((d) => d.cdeal !== '해제');
    return [...selected].sort((a, b) => a - b).map((g) => {
      const deals = dropOutliers(valid.filter((d) => Math.floor(d.ar) === g));
      if (!deals.length) return null;
      const latest = deals[deals.length - 1];
      const ymNow = latest.ym;
      const inWin = (d: Deal, from: string, to: string) => d.ym > from && d.ym <= to;
      const win = deals.filter((d) => inWin(d, ymAdd(ymNow, -3), ymNow));
      const winPrev = deals.filter((d) => inWin(d, ymAdd(ymNow, -15), ymAdd(ymNow, -12)));
      const avg = (a: Deal[]) => (a.length ? median(a.map((d) => d.amt)) : null);
      const cur = avg(win);
      const prev = avg(winPrev);
      const peak = deals.reduce((p, d) => (d.amt > p.amt ? d : p));
      const pct = cur && prev ? (cur / prev - 1) * 100 : null;
      return { g, deals, latest, cur, pct, peak };
    }).filter(Boolean) as {
      g: number; deals: Deal[]; latest: Deal; cur: number | null; pct: number | null; peak: Deal;
    }[];
  }, [all, selected]);

  return (
    <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      {tiles.map((t) => (
        <div key={t.g} className="bg-gray-900 border border-gray-800 rounded-xl px-[18px] py-4">
          <div className="text-[13px] text-slate-300 flex items-center gap-[7px]">
            <span className="w-2.5 h-2.5 rounded-[3px] inline-block" style={{ background: colorOf[t.g] }} />
            {gLabel(t.g)}
          </div>
          <div className="text-3xl font-semibold mt-1 text-slate-100">
            {fmtEok(t.latest.amt)}
            <small className="text-[15px] font-medium text-slate-300"> 최근 실거래 · {t.latest.date}</small>
          </div>
          {t.pct != null && (
            <div className={`text-[13px] mt-0.5 ${t.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {t.pct >= 0 ? '▲' : '▼'} {Math.abs(t.pct).toFixed(1)}% 전년 동기 3개월 중앙값 대비
            </div>
          )}
          <div className="text-xs text-slate-400 mt-1.5">
            3개월 중앙값 {t.cur ? fmtEok(Math.round(t.cur)) : '-'} · 신고가 {fmtEok(t.peak.amt)} ({t.peak.date.slice(0, 7)})
          </div>
          <Sparkline deals={t.deals} color={colorOf[t.g]} />
        </div>
      ))}
    </div>
  );
}
