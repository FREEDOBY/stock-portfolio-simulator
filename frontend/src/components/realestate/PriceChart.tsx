/**
 * 매매가 추이 · 거래량 차트 (트레이딩뷰식 2단 패널).
 * RealEstate(Flask) templates/index.html의 renderPrice + 커스텀 플러그인 4종(evt/phz/pvt/sep) 이식.
 */

import { useEffect, useRef } from 'react';
import {
  Chart, LineController, ScatterController, BarController,
  LinearScale, PointElement, LineElement, BarElement, Legend, Tooltip,
} from 'chart.js';
import type { ChartDataset, Plugin } from 'chart.js';
import type { CycleRow, Deal, LineSeries } from '../../lib/realestate/types';
import { SIGNAL_STYLE, THEME, decYear, eokTxt, fmtEok, ymIdx } from '../../lib/realestate/utils';

Chart.register(
  LineController, ScatterController, BarController,
  LinearScale, PointElement, LineElement, BarElement, Legend, Tooltip
);
Chart.defaults.font.family =
  'Inter, system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif';
Chart.defaults.font.size = 12;

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ── 차트 플러그인: 이벤트 세로선 ───────────────────────────── */
const evtPlugin: Plugin = {
  id: 'evt',
  afterDraw(chart) {
    const o = (chart.options.plugins as any).evt;
    if (!o || !o.items || !o.items.length) return;
    const { ctx, chartArea: a, scales: { x } } = chart;
    const vis = o.items
      .filter((e: any) => e.x >= (x.min as number) && e.x <= (x.max as number))
      .sort((p: any, q: any) => p.x - q.x);
    ctx.save();
    ctx.font = '10.5px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const rowRight: number[] = []; // 줄별로 마지막 라벨의 오른쪽 끝 픽셀
    vis.forEach((e: any) => {
      const px = x.getPixelForValue(e.x);
      ctx.strokeStyle = o.line;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
      const w = ctx.measureText(e.label).width;
      const tx = Math.min(Math.max(px, a.left + w / 2), a.right - w / 2);
      let r = rowRight.findIndex((right) => tx - w / 2 > right + 8);
      if (r === -1) {
        if (rowRight.length < 4) r = rowRight.length;
        else r = rowRight.indexOf(Math.min(...rowRight)); // 자리 없으면 가장 여유 있는 줄
      }
      rowRight[r] = Math.max(rowRight[r] ?? -1e9, tx + w / 2);
      ctx.fillStyle = o.text;
      ctx.fillText(e.label, tx, a.top - 5 - r * 12);
    });
    ctx.restore();
  },
};

/* 국면 배경 음영: 모델 판정(상승/고점/하락/저점)을 가격 패널 배경색으로 */
const phasePlugin: Plugin = {
  id: 'phz',
  beforeDatasetsDraw(chart) {
    const o = (chart.options.plugins as any).phz;
    if (!o || !o.segs || !o.segs.length) return;
    const { ctx, chartArea: a, scales: { x, y } } = chart;
    const bottom = y ? y.bottom : a.bottom;
    ctx.save();
    o.segs.forEach((s: any) => {
      const x0 = Math.max(x.getPixelForValue(s.x0), a.left);
      const x1 = Math.min(x.getPixelForValue(s.x1), a.right);
      if (x1 <= x0) return;
      ctx.fillStyle = s.color;
      ctx.fillRect(x0, a.top, x1 - x0, bottom - a.top);
    });
    ctx.restore();
  },
};

/* 패널 구분선: 가격 패널과 거래량 패널 사이 */
const sepPlugin: Plugin = {
  id: 'sep',
  afterDraw(chart) {
    const yv = chart.scales.yVol;
    if (!yv) return;
    const { ctx, chartArea: a } = chart;
    ctx.save();
    ctx.strokeStyle = THEME.baseline;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.left, yv.top - 0.5); ctx.lineTo(a.right, yv.top - 0.5); ctx.stroke();
    ctx.font = '10.5px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.muted;
    ctx.fillText('거래량', a.left + 6, yv.top + 13);
    ctx.restore();
  },
};

/* 고저점 지그재그 라벨 */
const pvtPlugin: Plugin = {
  id: 'pvt',
  afterDatasetsDraw(chart) {
    const o = (chart.options.plugins as any).pvt;
    if (!o || !o.series) return;
    const { ctx, chartArea: a, scales: { x, y } } = chart;
    ctx.save();
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    o.series.forEach((s: any) => s.pivots.forEach((p: any) => {
      const px = x.getPixelForValue(p.x);
      const py = y.getPixelForValue(p.y);
      if (px < a.left - 2 || px > a.right + 2) return;
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 7);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = o.surface; ctx.stroke();
      const txt = p.pct == null ? eokTxt(p.y)
        : `${eokTxt(p.y)} (${p.pct > 0 ? '+' : ''}${Math.round(p.pct)}%)`;
      const tx = Math.min(Math.max(px, a.left + 30), a.right - 34);
      const ty = p.type === 'H' ? py - 10 : py + 19;
      ctx.lineWidth = 3; ctx.strokeStyle = o.surface; ctx.strokeText(txt, tx, ty);
      ctx.fillStyle = o.text; ctx.fillText(txt, tx, ty);
    }));
    ctx.restore();
  },
};

interface Props {
  data: Deal[];              // 필터 적용된 거래 (해제 포함 여부는 상위에서 결정)
  lineSeries: LineSeries[];  // 평형별 월 중앙값 + 고저점 (상위에서 계산)
  selected: number[];
  showPoints: boolean;
  showAnno: boolean;
  events: { x: number; label: string }[];
  phaseRows: CycleRow[];
  colorOf: Record<number, string>;
  gLabel: (g: number) => string;
}

export function PriceChart({
  data, lineSeries, selected, showPoints, showAnno,
  events, phaseRows, colorOf, gLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const datasets: ChartDataset<any>[] = [];
    lineSeries.forEach((s) => {
      datasets.push({
        type: 'line', label: s.label, data: s.avgs, yAxisID: 'y',
        borderColor: s.color, backgroundColor: s.color,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 5,
        pointHoverBackgroundColor: s.color, pointHoverBorderColor: THEME.surface,
        pointHoverBorderWidth: 2, borderJoinStyle: 'round', order: 1,
      });
      if (showPoints) {
        const deals = data.filter((d) => Math.floor(d.ar) === s.g);
        datasets.push({
          type: 'scatter', label: '__pt' + s.g, yAxisID: 'y',
          data: deals.map((d) => ({ x: decYear(d.date), y: d.amt / 10000, _d: d })),
          backgroundColor: s.color + '55',
          borderColor: 'transparent', pointRadius: 2.5, pointHoverRadius: 6,
          pointHoverBackgroundColor: s.color, pointHoverBorderColor: THEME.surface,
          pointHoverBorderWidth: 2, order: 2,
        });
      }
    });

    const xs = datasets.flatMap((ds: any) => ds.data.map((p: any) => p.x));
    if (!xs.length) { chartRef.current?.destroy(); chartRef.current = null; return; }
    const xmin = Math.min(...xs);
    const xmax = Math.max(...xs);

    // 하단 거래량 패널: 기간에 따라 월/분기/연 단위로 묶는다
    const valid = data.filter((d) => d.cdeal !== '해제');
    const unit = xmax - xmin > 10 ? 12 : xmax - xmin > 3 ? 3 : 1; // 버킷 크기(개월)
    const bucketX = (ym: string) => {
      const y = +ym.slice(0, 4);
      const b = Math.floor((+ym.slice(4) - 1) / unit);
      return y + (b * unit + unit / 2) / 12;
    };
    const bucketLabel = (ym: string) => {
      const y = ym.slice(0, 4);
      const m = +ym.slice(4);
      return unit === 12 ? y + '년' : unit === 3 ? `${y}년 ${Math.ceil(m / 3)}분기` : `${y}.${ym.slice(4)}`;
    };
    if (valid.length) {
      const t0 = ymIdx(valid[0].ym);
      const t1 = ymIdx(valid[valid.length - 1].ym);
      const buckets = new Map<number, string>(); // x(중심) → 기간 라벨
      for (let t = t0; t <= t1; t++) {
        const y = Math.floor((t - 1) / 12);
        const m = ((t - 1) % 12) + 1;
        const ym = `${y}${String(m).padStart(2, '0')}`;
        buckets.set(bucketX(ym), bucketLabel(ym));
      }
      [...selected].sort((a, b) => a - b).forEach((g) => {
        const cnt = new Map<number, number>();
        valid.filter((d) => Math.floor(d.ar) === g).forEach((d) => {
          const x = bucketX(d.ym);
          cnt.set(x, (cnt.get(x) || 0) + 1);
        });
        if (!cnt.size) return;
        datasets.push({
          type: 'bar', label: '__vol' + g, yAxisID: 'yVol', stack: 'vol',
          data: [...buckets.entries()].map(([x, label]) => ({ x, y: cnt.get(x) || 0, _p: label })),
          backgroundColor: colorOf[g] + 'CC', borderColor: THEME.surface, borderWidth: 1,
          barThickness: 'flex', maxBarThickness: 20, order: 3,
        });
      });
    }

    const opts: any = {
      responsive: true, maintainAspectRatio: false, animation: false,
      layout: { padding: { top: showAnno ? 56 : 4 } },
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: {
          type: 'linear', min: Math.floor(xmin * 12) / 12 - 0.04, max: xmax + 0.06,
          grid: { color: THEME.grid, drawTicks: false }, border: { color: THEME.baseline },
          ticks: {
            color: THEME.muted, maxTicksLimit: 12,
            callback: (v: number) => {
              const span = xmax - xmin;
              if (span > 4) return Number.isInteger(v) ? v : '';
              const y = Math.floor(v);
              const m = Math.round((v - y) * 12) + 1;
              return m > 12 ? (y + 1) + '.01' : y + '.' + String(m).padStart(2, '0');
            },
          },
        },
        yVol: {
          stack: 'panes', stackWeight: 1, position: 'left', beginAtZero: true, grace: '18%',
          grid: { display: false }, border: { display: false },
          // 패널 경계의 가격축 눈금과 겹치지 않게 상단 눈금은 숨긴다
          afterBuildTicks: (ax: any) => { ax.ticks = ax.ticks.filter((t: any) => t.value <= ax.max * 0.75); },
          ticks: { color: THEME.muted, maxTicksLimit: 3, precision: 0, callback: (v: number) => v + '건' },
        },
        y: {
          stack: 'panes', stackWeight: 3.4, position: 'left', grace: '6%',
          grid: { color: THEME.grid, drawTicks: false }, border: { display: false },
          ticks: { color: THEME.muted, callback: (v: number) => v + '억' },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: THEME.secondary, usePointStyle: true, pointStyle: 'line',
            filter: (it: any) => !it.text.startsWith('__'),
          },
        },
        tooltip: {
          backgroundColor: '#1a2234',
          titleColor: THEME.ink, bodyColor: THEME.ink,
          borderColor: THEME.border, borderWidth: 1,
          padding: 10, displayColors: true, boxWidth: 8, boxHeight: 2, usePointStyle: false,
          callbacks: {
            title: (items: any[]) => {
              const it = items[0];
              if (it.raw._p) return it.raw._p + ' 거래량';
              const d = it.raw._d;
              if (d) return d.date;
              const v = it.parsed.x;
              const y = Math.floor(v);
              return y + '년 ' + Math.round((v - y) * 12 + 0.5) + '월 중앙값';
            },
            label: (it: any) => {
              if (it.dataset.label.startsWith('__vol'))
                return ` ${gLabel(+it.dataset.label.slice(5))} ${it.parsed.y}건`;
              const d = it.raw._d;
              if (d)
                return ` ${fmtEok(d.amt)} · ${gLabel(Math.floor(d.ar))} ${d.fl}층` +
                  (d.dong ? ` ${d.dong}동` : '') + (d.cdeal === '해제' ? ' (해제)' : '');
              return ` ${it.dataset.label} ${+it.parsed.y.toFixed(2)}억`;
            },
          },
        },
      },
    };

    // 국면 배경 음영: 같은 국면의 연속 월을 하나의 밴드로 병합
    if (showAnno && phaseRows.length) {
      const alpha = '26'; // ~15%
      const segs: { x0: number; x1: number; color: string }[] = [];
      phaseRows.forEach((r) => {
        const x0 = +r.ym.slice(0, 4) + (+r.ym.slice(4) - 1) / 12;
        const x1 = x0 + 1 / 12;
        if (x1 < xmin || x0 > xmax) return;
        const color = (SIGNAL_STYLE[r.phase] || { dot: '#999' }).dot + alpha;
        const prev = segs[segs.length - 1];
        if (prev && prev.color === color && Math.abs(prev.x1 - x0) < 0.001) prev.x1 = x1;
        else segs.push({ x0, x1, color });
      });
      // 3개월 미만의 짧은 조각(모델 노이즈)은 생략하되, 마지막 구간(현재 국면)은 항상 표시
      opts.plugins.phz = {
        segs: segs.filter((s, i) => s.x1 - s.x0 >= 3 / 12 - 0.001 || i === segs.length - 1),
      };
    } else opts.plugins.phz = {};
    opts.plugins.evt = showAnno ? { items: events, line: THEME.baseline, text: THEME.muted } : {};
    opts.plugins.pvt = showAnno
      ? { series: lineSeries.slice(0, 3), surface: THEME.surface, text: THEME.secondary } : {};

    if (chartRef.current) {
      chartRef.current.data.datasets = datasets;
      chartRef.current.options = opts;
      chartRef.current.update();
    } else if (canvasRef.current) {
      chartRef.current = new Chart(canvasRef.current, {
        data: { datasets },
        options: opts,
        plugins: [phasePlugin, evtPlugin, pvtPlugin, sepPlugin],
      });
    }
  }, [data, lineSeries, selected, showPoints, showAnno, events, phaseRows, colorOf, gLabel]);

  useEffect(() => () => { chartRef.current?.destroy(); chartRef.current = null; }, []);

  return (
    <div className="relative h-[500px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
