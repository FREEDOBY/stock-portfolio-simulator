/**
 * 올림픽훼밀리타운 실거래가 대시보드 — RealEstate(Flask) 프로젝트 이식.
 * 데이터: /api/realestate/* (FastAPI) → backend/realestate/deals.db
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CycleRow, Deal, DealsResponse, LineSeries, ListingsResponse, REConfig, RegionRow,
  WaveResponse,
} from '../../lib/realestate/types';
import {
  SERIES, autoPivots, decYear, dropOutliers, monthlyMedian,
} from '../../lib/realestate/utils';
import { PriceChart } from './PriceChart';
import { StatTiles } from './StatTiles';
import { CycleCard } from './CycleCard';
import { BuyBandsCard } from './BuyBandsCard';
import { ComplexCards } from './ComplexCards';
import { ComplexSelector } from './ComplexSelector';
import { FundsCard } from './FundsCard';
import { ListingsCard } from './ListingsCard';
import { MacroCard } from './MacroCard';
import { DealsTable } from './DealsTable';

const RANGES = [
  { key: '1', label: '1년' },
  { key: '3', label: '3년' },
  { key: '5', label: '5년' },
  { key: '10', label: '10년' },
  { key: 'all', label: '전체' },
] as const;

export function RealEstateDashboard() {
  const [cfg, setCfg] = useState<REConfig | null>(null);
  const [all, setAll] = useState<Deal[]>([]);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  const [phaseRows, setPhaseRows] = useState<CycleRow[]>([]);
  const [wave, setWave] = useState<WaveResponse | null>(null);
  const [regions, setRegions] = useState<RegionRow[] | null>(null);
  const [listings, setListings] = useState<ListingsResponse | null>(null);
  const [loadError, setLoadError] = useState('');

  const [sel, setSel] = useState<Set<number>>(new Set());
  const [rangeYears, setRangeYears] = useState<string>('3');
  const [showPoints, setShowPoints] = useState(true);
  const [showAnno, setShowAnno] = useState(true);
  const [incCancel, setIncCancel] = useState(false);
  const [tableLimit, setTableLimit] = useState(30);
  const [statusMsg, setStatusMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshed = useRef(false);

  const complexRef = useRef<number | null>(null);

  const loadCore = useCallback(async () => {
    const [c, d] = await Promise.all([
      fetch('/api/realestate/config').then((r) => r.json()) as Promise<REConfig>,
      fetch('/api/realestate/deals').then((r) => r.json()) as Promise<DealsResponse>,
    ]);
    setCfg(c);
    setAll(d.deals);
    setLastFetched(d.lastFetched);
    // 단지가 바뀌었으면 평형 선택을 새 단지의 평형 구성으로 재초기화
    // (이전 단지 평형이 남아 있으면 차트·통계가 빈 화면이 된다)
    const no = c.complex?.complexNo ?? null;
    if (complexRef.current !== null && complexRef.current !== no) {
      const gs = [...new Set(d.deals.map((x) => Math.floor(x.ar)))].sort((a, b) => a - b);
      const labeled = gs.filter((g) => c.areaLabels && c.areaLabels[g]);
      setSel(new Set(labeled.length ? labeled : gs.slice(0, 2)));
    }
    complexRef.current = no;
    return { c, d };
  }, []);

  const loadDerived = useCallback(async (forceListings = false) => {
    try {
      const [cy, wv, rg] = await Promise.all([
        fetch('/api/realestate/cycle').then((r) => r.json()),
        fetch('/api/realestate/wave').then((r) => r.json()),
        fetch('/api/realestate/region').then((r) => r.json()),
      ]);
      // 실패 시 비워야 한다 — 단지를 바꿨는데 이전 단지 값이 남으면 오해를 부른다
      setPhaseRows(cy.ok ? cy.rows : []);
      if (wv.ok && wv.rows?.length) setWave(wv);
      if (rg.ok && rg.regions?.length) setRegions(rg.regions);
    } catch {
      /* 자동 지표 실패는 치명적이지 않음 */
    }
    // 네이버 매물 호가 (비공식 API). 단지번호 미연결·차단 시 ok=false → 이전 단지
    // 매물이 그대로 남지 않도록 null로 비운다. 갱신 버튼은 캐시 무시하고 재수집.
    try {
      const ls = await fetch(
        '/api/realestate/listings' + (forceListings ? '?force=1' : '')
      ).then((r) => r.json());
      setListings(ls.ok ? ls : null);
    } catch {
      setListings(null);
    }
  }, []);

  const doRefresh = useCallback(async (auto: boolean) => {
    setRefreshing(true);
    setStatusMsg(auto ? '데이터가 오래되어 자동 갱신 중… (3개 구 수집)' : '3개 구 실거래 수집 중…');
    try {
      const r = await (await fetch('/api/realestate/refresh', { method: 'POST' })).json();
      if (r.ok) {
        setStatusMsg('재계산 중… (매물 호가 재수집 포함)');
        await loadCore();
        await loadDerived(true);
        setStatusMsg(`갱신 완료 — ${r.months}개월 × 3개 구 + 매물 호가 재수집됨`);
      } else setStatusMsg('실패: ' + r.msg);
    } catch (err) {
      setStatusMsg('오류: ' + (err instanceof Error ? err.message : String(err)));
    }
    setRefreshing(false);
    setTimeout(() => setStatusMsg(''), 8000);
  }, [loadCore, loadDerived]);

  /* boot */
  useEffect(() => {
    (async () => {
      try {
        const { c, d } = await loadCore();
        // 기본 선택: config에 라벨을 지정한 평형
        const groups = [...new Set(d.deals.map((x) => Math.floor(x.ar)))].sort((a, b) => a - b);
        const labeled = groups.filter((g) => c.areaLabels && c.areaLabels[g]);
        const init = new Set(labeled.length ? labeled : groups.slice(0, 2));
        setSel(init);
        loadDerived();
        // 마지막 수집이 20시간 넘었으면 열자마자 자동 갱신
        if (c.hasKey && !autoRefreshed.current) {
          const age = d.lastFetched
            ? Date.now() - new Date(d.lastFetched.replace(' ', 'T')).getTime()
            : Infinity;
          if (age > 20 * 3600 * 1000) {
            autoRefreshed.current = true;
            doRefresh(true);
          }
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 파생 상태 */
  const groups = useMemo(
    () => [...new Set(all.map((d) => Math.floor(d.ar)))].sort((a, b) => a - b),
    [all]
  );
  const colorOf = useMemo(() => {
    const m: Record<number, string> = {};
    groups.forEach((g, i) => { m[g] = SERIES[i % SERIES.length]; });
    return m;
  }, [groups]);
  const gLabel = useCallback(
    (g: number) => (cfg?.areaLabels && cfg.areaLabels[g]) ? cfg.areaLabels[g] : `전용 ${g}㎡`,
    [cfg]
  );
  const events = useMemo(
    () => (cfg?.events || []).map((e) => ({ x: decYear(e.date), label: e.label })),
    [cfg]
  );

  const filtered = useMemo(() => {
    if (!all.length) return [];
    const last = all[all.length - 1].date;
    let minDate = '0000-00-00';
    if (rangeYears !== 'all') {
      const y = +last.slice(0, 4) - +rangeYears;
      minDate = y + last.slice(4);
    }
    return all.filter(
      (d) => sel.has(Math.floor(d.ar)) && d.date >= minDate && (incCancel || d.cdeal !== '해제')
    );
  }, [all, sel, rangeYears, incCancel]);

  /* 평형별 월 중앙값 추이선 + 지그재그 고저점 */
  const lineSeries = useMemo<LineSeries[]>(() => {
    return [...sel].sort((a, b) => a - b).flatMap((g) => {
      const deals = filtered.filter((d) => Math.floor(d.ar) === g);
      if (!deals.length) return [];
      const avgs = [...monthlyMedian(dropOutliers(deals.filter((d) => d.cdeal !== '해제'))).entries()]
        .map(([ym, v]) => ({ x: +ym.slice(0, 4) + (+ym.slice(4) - 0.5) / 12, y: v / 10000, ym }));
      return [{ g, label: gLabel(g), color: colorOf[g], avgs, pivots: autoPivots(avgs) }];
    });
  }, [filtered, sel, colorOf, gLabel]);

  const selectedArr = useMemo(() => [...sel].sort((a, b) => a - b), [sel]);

  const names = useMemo(() => [...new Set(all.map((d) => d.apt))], [all]);

  if (loadError) {
    return (
      <div className="p-6">
        <div className="bg-gray-900 border border-red-900 rounded-xl p-5 text-red-300">
          데이터 로딩 실패: {loadError}
          <p className="text-slate-400 text-sm mt-2">
            백엔드(8000)가 켜져 있는지, backend/realestate/deals.db가 존재하는지 확인하세요.
          </p>
        </div>
      </div>
    );
  }

  if (!cfg || !all.length) {
    return (
      <div className="p-4 md:p-6 max-w-[1240px] mx-auto">
        {cfg && (
          <div className="mb-6">
            <ComplexCards
              current={cfg.complex}
              onSwitched={async () => { await loadCore(); await loadDerived(); }}
            />
            <ComplexSelector
              current={cfg.complex}
              backfill={cfg.backfill}
              onSwitched={async () => { await loadCore(); await loadDerived(true); }}
            />
          </div>
        )}
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm font-mono text-slate-500">
              {cfg?.backfill?.running
                ? `${cfg.complex?.name ?? ''} 실거래 수집 중 — 완료되면 자동 표시됩니다`
                : '실거래 데이터 로딩 중…'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1240px] mx-auto text-sm leading-normal">
      {/* 관심 단지 카드 — 클릭 시 해당 단지 대시보드로 전환 */}
      <ComplexCards
        current={cfg.complex}
        onSwitched={async () => { await loadCore(); await loadDerived(); }}
      />

      {/* Header */}
      <header className="mb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-xl md:text-2xl font-bold text-slate-100">
            {cfg.complex?.name ?? cfg.aptKeyword} 실거래가 대시보드
          </h1>
          <ComplexSelector
            current={cfg.complex}
            backfill={cfg.backfill}
            onSwitched={async () => { await loadCore(); await loadDerived(true); }}
          />
        </div>
        <p className="text-sm text-slate-500 mt-1">
          {cfg.regionName} {all[0]?.umd} · {names.join(', ')} · 거래 {all.length.toLocaleString()}건 ·
          마지막 수집 {lastFetched || '-'}
        </p>
      </header>

      {/* 필터 */}
      <div className="flex flex-wrap gap-x-[18px] gap-y-2.5 items-center mt-[18px]">
        <div className="inline-flex border border-gray-700 rounded-lg overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => { setRangeYears(r.key); setTableLimit(30); }}
              className={`px-3 py-1.5 text-[13px] ${
                rangeYears === r.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-gray-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="inline-flex gap-3.5 flex-wrap">
          {groups.map((g) => (
            <label key={g} className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer text-[13px]">
              <input
                type="checkbox"
                checked={sel.has(g)}
                onChange={(e) => {
                  const next = new Set(sel);
                  if (e.target.checked) next.add(g); else next.delete(g);
                  setSel(next);
                }}
              />
              <span className="w-3 h-3 rounded-[3px] inline-block" style={{ background: colorOf[g] }} />
              {gLabel(g)}
            </label>
          ))}
        </span>
        <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer text-[13px]">
          <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} />
          개별 거래 표시
        </label>
        <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer text-[13px]">
          <input type="checkbox" checked={showAnno} onChange={(e) => setShowAnno(e.target.checked)} />
          이벤트·고저점 표시
        </label>
        <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer text-[13px]">
          <input type="checkbox" checked={incCancel} onChange={(e) => setIncCancel(e.target.checked)} />
          해제거래 포함
        </label>
        <span className="flex-1" />
        <button
          onClick={async () => {
            setRefreshing(true);
            setStatusMsg(`${cfg.complex?.name ?? ''} 매물 재수집 중…`);
            await loadDerived(true);          // ?force=1 — 24시간 캐시 무시
            setStatusMsg('매물 갱신 완료');
            setRefreshing(false);
            setTimeout(() => setStatusMsg(''), 5000);
          }}
          disabled={refreshing}
          className="border border-gray-700 rounded-lg px-3.5 py-1.5 text-[13px] text-slate-200 hover:bg-gray-800 disabled:opacity-50"
          title="이 단지의 네이버 매물을 지금 바로 다시 수집 (평소엔 하루 1회 자동)"
        >
          매물 갱신 (이 단지)
        </button>
        <button
          onClick={() => doRefresh(false)}
          disabled={refreshing}
          className="border border-gray-700 rounded-lg px-3.5 py-1.5 text-[13px] text-slate-200 hover:bg-gray-800 disabled:opacity-50"
          title="국토부 실거래 최근 6개월 재수집 + 이 단지 매물 갱신"
        >
          실거래 갱신 (최근 6개월)
        </button>
        <span className="text-slate-500 text-xs">{statusMsg}</span>
      </div>

      {/* 스탯 타일 */}
      <StatTiles all={all} selected={selectedArr} colorOf={colorOf} gLabel={gLabel} />

      {/* 가격 추이 차트 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-[18px] mt-4">
        <h2 className="text-[15px] font-semibold mb-1 text-slate-100">매매가 추이 · 거래량</h2>
        <p className="text-xs text-slate-400 mb-3">
          위: 월별 중앙값(선)과 개별 실거래(점, 억원) · 아래: 거래 건수 · 배경 음영: 모델 국면 판정,
          3개월 이상 지속 구간만 (
          <span style={{ color: '#0ca30c' }}>상승</span>·
          <span style={{ color: '#c98500' }}>고점</span>·
          <span style={{ color: '#d03b3b' }}>하락</span>·
          <span style={{ color: '#2a78d6' }}>저점</span>)
        </p>
        <PriceChart
          data={filtered}
          lineSeries={lineSeries}
          selected={selectedArr}
          showPoints={showPoints}
          showAnno={showAnno}
          events={events}
          phaseRows={phaseRows}
          colorOf={colorOf}
          gLabel={gLabel}
        />
      </div>

      {/* 고점·저점 사이클 */}
      <CycleCard series={lineSeries} />

      {/* 가용 자금 */}
      <FundsCard funds={cfg.funds} gLabel={gLabel} listings={listings} />

      {/* 평형별 매수 밴드 */}
      <BuyBandsCard buyBands={cfg.buyBands} all={all} gLabel={gLabel} listings={listings} />

      {/* 현재 매물 리스트 (평형 선택) */}
      <ListingsCard listings={listings} gLabel={gLabel} buyBands={cfg.buyBands} />

      {/* 매크로 · 사이클 진단 */}
      <MacroCard macro={cfg.macro} cycleRows={phaseRows} wave={wave} regions={regions} listings={listings} deals={all} />

      {/* 거래 내역 */}
      <DealsTable
        data={filtered}
        limit={tableLimit}
        onMore={() => setTableLimit((v) => v + 50)}
        gLabel={gLabel}
      />

      <footer className="border-t border-gray-800 mt-8 pt-4 text-center text-xs text-slate-600">
        <p>Data Source: 국토교통부 아파트 매매 실거래가 상세 자료 (공공데이터포털)</p>
        <p className="mt-1">사이클 모델·매수 밴드는 알고리즘 추정치로 투자 자문이 아닙니다.</p>
      </footer>
    </div>
  );
}
