/**
 * 백테스트 결과를 자체 완결형(self-contained) HTML 리포트로 내보내기
 *
 * 외부 의존성 없이 인라인 SVG 라인차트(크로스헤어 툴팁 포함) + 지표 비교표를 생성한다.
 * 시리즈 색은 다크 서피스(#111827) 기준 CVD(색각이상) 분리 검증을 통과한 고정 팔레트를
 * 순서대로 사용한다 — 시리즈 수가 바뀌어도 색을 재배치하지 않는다.
 */
import type { BacktestMetrics } from '../types';

/** 검증 통과 팔레트 (teal, orange, sky, yellow, violet, pink) — 최대 6 시리즈 */
export const COMPARE_COLORS = [
  '#0d9488',
  '#ea580c',
  '#0284c7',
  '#a16207',
  '#8b5cf6',
  '#ec4899',
] as const;

export const MAX_COMPARE = COMPARE_COLORS.length;

export interface ExportSeries {
  name: string;
  color: string;
  points: { date: string; value: number }[];
}

export interface ExportMetricsColumn {
  name: string;
  color: string;
  metrics: BacktestMetrics;
  invested: number;
  finalValue: number;
}

export interface ExportOptions {
  title: string;
  /** 'currency' = 절대 금액($), 'percent' = 시작점 대비 수익률(%) */
  mode: 'currency' | 'percent';
  /** true면 points.value가 이미 %값 — 시작점 대비 재정규화를 건너뛴다 */
  preNormalized?: boolean;
  series: ExportSeries[];
  metricsColumns: ExportMetricsColumn[];
  settingsSummary: string;
  filename: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const W = 960;
const H = 400;
const PAD = { top: 16, right: 90, bottom: 28, left: 64 };

function fmtValue(v: number, mode: 'currency' | 'percent'): string {
  if (mode === 'percent') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

/** 시리즈들을 날짜 합집합 기준으로 정렬·정규화 */
function alignSeries(series: ExportSeries[], mode: 'currency' | 'percent', preNormalized = false) {
  const dateSet = new Set<string>();
  for (const s of series) for (const p of s.points) dateSet.add(p.date);
  const dates = [...dateSet].sort();
  const idx = new Map(dates.map((d, i) => [d, i]));

  const rows: (number | null)[][] = series.map(() => dates.map(() => null));
  series.forEach((s, si) => {
    const base = s.points[0]?.value ?? 1;
    for (const p of s.points) {
      const i = idx.get(p.date);
      if (i === undefined) continue;
      rows[si][i] =
        mode === 'percent' && !preNormalized ? (p.value / base - 1) * 100 : p.value;
    }
  });
  return { dates, rows };
}

function buildChartSvg(
  dates: string[],
  rows: (number | null)[][],
  series: ExportSeries[],
  mode: 'currency' | 'percent',
): string {
  const all = rows.flat().filter((v): v is number => v !== null);
  if (all.length === 0 || dates.length < 2) return '<p class="muted">No chart data</p>';
  let yMin = Math.min(...all);
  let yMax = Math.max(...all);
  const padY = (yMax - yMin) * 0.06 || 1;
  yMin -= padY;
  yMax += padY;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (dates.length - 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  // Y 그리드 + 눈금 5개
  let grid = '';
  const yTicks = 5;
  for (let t = 0; t <= yTicks; t++) {
    const v = yMin + ((yMax - yMin) * t) / yTicks;
    const yy = y(v);
    grid += `<line x1="${PAD.left}" y1="${yy}" x2="${W - PAD.right}" y2="${yy}" class="grid"/>`;
    grid += `<text x="${PAD.left - 8}" y="${yy + 4}" class="tick" text-anchor="end">${esc(fmtValue(v, mode))}</text>`;
  }
  // X 눈금 ~6개
  const xTickCount = Math.min(6, dates.length);
  for (let t = 0; t < xTickCount; t++) {
    const i = Math.round((t / (xTickCount - 1)) * (dates.length - 1));
    grid += `<text x="${x(i)}" y="${H - 8}" class="tick" text-anchor="middle">${esc(dates[i].slice(0, 7))}</text>`;
  }
  if (mode === 'percent' && yMin < 0 && yMax > 0) {
    grid += `<line x1="${PAD.left}" y1="${y(0)}" x2="${W - PAD.right}" y2="${y(0)}" class="zero"/>`;
  }

  // 라인 (2px) — 결측 구간은 선을 끊는다
  let lines = '';
  series.forEach((s, si) => {
    let d = '';
    let pen = false;
    rows[si].forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    lines += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
  });

  // 라인 끝 직접 라벨 (4개 이하일 때만, 겹치면 세로로 밀어냄)
  let endLabels = '';
  if (series.length <= 4) {
    const ends = series
      .map((s, si) => {
        for (let i = rows[si].length - 1; i >= 0; i--) {
          if (rows[si][i] !== null) return { name: s.name, color: s.color, yy: y(rows[si][i] as number) };
        }
        return null;
      })
      .filter((e): e is { name: string; color: string; yy: number } => e !== null)
      .sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < ends.length; i++) {
      if (ends[i].yy - ends[i - 1].yy < 14) ends[i].yy = ends[i - 1].yy + 14;
    }
    for (const e of ends) {
      endLabels += `<text x="${W - PAD.right + 6}" y="${e.yy + 4}" class="endlabel" fill="${e.color}">${esc(e.name)}</text>`;
    }
  }

  return `<svg id="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Portfolio performance chart">
${grid}${lines}${endLabels}
<line id="xhair" x1="0" y1="${PAD.top}" x2="0" y2="${H - PAD.bottom}" class="xhair" visibility="hidden"/>
<rect id="hit" x="${PAD.left}" y="${PAD.top}" width="${plotW}" height="${plotH}" fill="transparent"/>
</svg>`;
}

function buildMetricsTable(cols: ExportMetricsColumn[]): string {
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const rowsDef: { label: string; get: (c: ExportMetricsColumn) => number; fmt: (v: number) => string; better: 1 | -1 }[] = [
    { label: 'CAGR', get: (c) => c.metrics.cagr, fmt: pct, better: 1 },
    { label: 'MDD', get: (c) => c.metrics.mdd, fmt: pct, better: -1 },
    { label: 'SHARPE', get: (c) => c.metrics.sharpe_ratio, fmt: (v) => v.toFixed(2), better: 1 },
    { label: 'VOLATILITY', get: (c) => c.metrics.volatility, fmt: pct, better: -1 },
    { label: 'INVESTED', get: (c) => c.invested, fmt: (v) => `$${Math.round(v).toLocaleString('en-US')}`, better: 1 },
    { label: 'FINAL VALUE', get: (c) => c.finalValue, fmt: (v) => `$${Math.round(v).toLocaleString('en-US')}`, better: 1 },
    { label: 'P&L %', get: (c) => (c.finalValue / c.invested - 1) * 100, fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, better: 1 },
  ];

  const head = cols
    .map((c) => `<th><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</th>`)
    .join('');
  const body = rowsDef
    .map((r) => {
      const values = cols.map(r.get);
      const best = r.better === 1 ? Math.max(...values) : Math.min(...values);
      const tds = values
        .map((v) => `<td class="${cols.length > 1 && v === best ? 'best' : ''}">${esc(r.fmt(v))}</td>`)
        .join('');
      return `<tr><th scope="row">${esc(r.label)}</th>${tds}</tr>`;
    })
    .join('\n');

  return `<table><thead><tr><th>METRIC</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function buildReportHtml(opts: ExportOptions): string {
  const { dates, rows } = alignSeries(opts.series, opts.mode, opts.preNormalized);
  const chart = buildChartSvg(dates, rows, opts.series, opts.mode);
  const legend = opts.series
    .map((s) => `<span class="chip"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>`)
    .join('');
  const table = buildMetricsTable(opts.metricsColumns);
  const generated = new Date().toLocaleString('ko-KR');

  const payload = JSON.stringify({
    dates,
    mode: opts.mode,
    series: opts.series.map((s, i) => ({ name: s.name, color: s.color, values: rows[i] })),
    pad: PAD,
    w: W,
    h: H,
  });

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  body { background: #0a0e17; color: #e2e8f0; font-family: 'JetBrains Mono', Consolas, monospace; padding: 24px; }
  .wrap { max-width: 1040px; margin: 0 auto; }
  h1 { font-size: 18px; letter-spacing: 0.08em; text-transform: uppercase; color: #f1f5f9; }
  .muted { color: #64748b; font-size: 12px; margin-top: 4px; }
  .card { background: #111827; border: 1px solid rgba(51,65,85,.5); border-radius: 8px; padding: 20px; margin-top: 16px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
  .chip { font-size: 12px; color: #cbd5e1; display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: #1e293b; stroke-width: 1; }
  .zero { stroke: #475569; stroke-width: 1; stroke-dasharray: 4 3; }
  .tick { fill: #64748b; font-size: 11px; font-family: inherit; }
  .endlabel { font-size: 11px; font-family: inherit; }
  .xhair { stroke: #94a3b8; stroke-width: 1; stroke-dasharray: 3 3; }
  #tip { position: fixed; pointer-events: none; background: #1a1f2e; border: 1px solid rgba(71,85,105,.6);
         border-radius: 6px; padding: 8px 10px; font-size: 12px; display: none; z-index: 10; box-shadow: 0 8px 24px rgba(0,0,0,.5); }
  #tip .d { color: #94a3b8; margin-bottom: 4px; }
  #tip .row { display: flex; align-items: center; gap: 6px; color: #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 12px; text-align: right; border-bottom: 1px solid rgba(30,41,59,.8); }
  thead th { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .06em; }
  thead th .dot { margin-right: 6px; }
  tbody th { text-align: left; color: #94a3b8; font-weight: 500; font-size: 12px; }
  td.best { color: #34d399; font-weight: 700; }
  footer { margin-top: 16px; color: #475569; font-size: 11px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(opts.title)}</h1>
  <p class="muted">${esc(opts.settingsSummary)} · Generated ${esc(generated)}</p>
  <div class="card">
    <div class="legend">${legend}</div>
    ${chart}
  </div>
  <div class="card">${table}</div>
  <footer>Stock Portfolio Simulator · 백테스트는 과거 데이터 기반 시뮬레이션이며 미래 수익을 보장하지 않습니다.</footer>
</div>
<div id="tip"></div>
<script>
(function () {
  var D = ${payload};
  var svg = document.getElementById('chart');
  var hit = document.getElementById('hit');
  var xhair = document.getElementById('xhair');
  var tip = document.getElementById('tip');
  if (!svg || !hit) return;
  var plotW = D.w - D.pad.left - D.pad.right;
  function fmt(v) {
    if (D.mode === 'percent') return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  hit.addEventListener('mousemove', function (e) {
    var r = svg.getBoundingClientRect();
    var sx = (e.clientX - r.left) * (D.w / r.width);
    var i = Math.round(((sx - D.pad.left) / plotW) * (D.dates.length - 1));
    i = Math.max(0, Math.min(D.dates.length - 1, i));
    var cx = D.pad.left + (i / (D.dates.length - 1)) * plotW;
    xhair.setAttribute('x1', cx); xhair.setAttribute('x2', cx);
    xhair.setAttribute('visibility', 'visible');
    var html = '<div class="d">' + D.dates[i] + '</div>';
    D.series.forEach(function (s) {
      var v = s.values[i];
      if (v === null || v === undefined) return;
      html += '<div class="row"><span class="dot" style="background:' + s.color + '"></span>' +
              '<span>' + s.name.replace(/</g, '&lt;') + '</span><span style="margin-left:auto;padding-left:12px">' + fmt(v) + '</span></div>';
    });
    tip.innerHTML = html;
    tip.style.display = 'block';
    var tx = e.clientX + 14, ty = e.clientY + 14;
    if (tx + tip.offsetWidth > window.innerWidth - 8) tx = e.clientX - tip.offsetWidth - 14;
    if (ty + tip.offsetHeight > window.innerHeight - 8) ty = e.clientY - tip.offsetHeight - 14;
    tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
  });
  hit.addEventListener('mouseleave', function () {
    xhair.setAttribute('visibility', 'hidden');
    tip.style.display = 'none';
  });
})();
</script>
</body>
</html>`;
}

export function downloadHtml(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReport(opts: ExportOptions): void {
  downloadHtml(opts.filename, buildReportHtml(opts));
}
