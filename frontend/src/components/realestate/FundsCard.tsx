/** 가용 자금 — 좌우 독립 패널 2개.
 *  왼쪽: 자금 항목 (backend/realestate/funds.json — 화면에서 직접 편집 가능,
 *        저장(PUT /api/realestate/funds)과 동시에 합계·월부담·커버리지 즉시 재계산.
 *        파일을 손으로 고쳐도 새로고침 시 반영된다)
 *  오른쪽: 평형별 매물 최저가 + 부대비용(취득세·중개보수·등기) 대비 여유/부족 */

import { useEffect, useMemo, useState } from 'react';
import type { Funds, FundsItem, ListingsResponse } from '../../lib/realestate/types';

const fmt = (v: number) => v.toFixed(2) + '억';  // 2자리 고정 — 우측 정렬 시 자릿수 맞춤

/* 부대비용: 취득세(9억 초과 3% + 지방교육세 0.3% + 전용 85㎡ 초과 시 농특세 0.2%)
   + 중개보수 상한 0.7% + VAT + 등기·법무·국민주택채권 약 0.1억 */
function sideCosts(price: number, g: number) {
  const acqRate = g > 85 ? 0.035 : 0.033;
  const acq = price * acqRate;
  const broker = price * 0.007 * 1.1;
  const regist = 0.1;
  return { acq, broker, regist, total: acq + broker + regist, acqRate };
}

/* 월 부담(억): 만기(term_years) 있으면 원리금균등 상환액, 없으면 이자만 */
function monthlyCost(it: { amount: number; rate?: number; term_years?: number }) {
  if (!it.rate || it.amount <= 0) return 0;
  const r = it.rate / 100 / 12;
  if (!it.term_years) return it.amount * r;          // 만기일시/이자만
  const n = it.term_years * 12;
  const k = Math.pow(1 + r, n);
  return (it.amount * r * k) / (k - 1);              // 원리금균등
}

const th = 'px-2.5 py-1.5 border-b border-gray-800 whitespace-nowrap font-medium';
const td = 'px-2.5 py-1.5 border-b border-gray-800 whitespace-nowrap';
const card = 'bg-gray-900 border border-gray-800 rounded-xl px-5 py-[18px]';
const inp = 'bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[13px] text-slate-100';
const btn = 'border rounded-lg px-3 py-1 text-[13px]';

interface Props {
  funds: Funds | null;
  gLabel: (g: number) => string;
  listings?: ListingsResponse | null;
}

export function FundsCard({ funds: initial, gLabel, listings }: Props) {
  const [funds, setFunds] = useState<Funds | null>(initial);
  /* 대금 구조 기준 평형 — 취득세율(85㎡ 초과 3.5%)이 갈린다 */
  const [planG, setPlanG] = useState(136);
  /* 매매가 직접 입력 — 빈 값이면 가용자금이 감당하는 실질 상한을 쓴다 */
  const [priceInput, setPriceInput] = useState('');
  const [draft, setDraft] = useState<Funds | null>(null);   // 편집 중이면 non-null
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { setFunds(initial); }, [initial]);

  const view = draft ?? funds;  // 편집 중엔 입력값 기준으로 실시간 재계산
  /* 체크 해제(off)된 항목은 합계·월 부담·대금 구조에서 전부 빠진다 —
     항목을 지우지 않고 "이 돈이 없다면?"을 돌려보기 위한 것 */
  const on = useMemo(() => (view ? view.items.filter((i) => !i.off) : []), [view]);
  const total = useMemo(
    () => on.reduce((s, i) => s + (Number(i.amount) || 0), 0),
    [on]
  );
  /* 체크 해제된 항목 합 — 합계 행에 "제외 n.nn억"으로 같이 보여준다 */
  const offSum = useMemo(
    () => (view ? view.items.filter((i) => i.off)
                      .reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0),
    [view]
  );
  const monthly = useMemo(
    () => on.reduce((s, i) => s + monthlyCost(i), 0),
    [on]
  );

  /* 대금 구조 — 매수가를 가용자금에서 역산(실질 상한)하고, 자금 항목을 시점 순으로
     계약금 → 중도금 → 잔금 1차 → 잔금 2차에 채운다. 항목을 고치면 구조도 같이 움직인다.
     · 잔금은 둘로 나눈다. 1차는 등기·이사가 걸린 조기잔금, 2차는 나중에 들어오는
       재원으로 내는 후지급분 — 매도인 근저당으로 담보한다.
     · 잔금 1차 고정 재원에 '입금일이 특정 날짜'인 항목이 있으면 잔금일이 그보다
       앞설 수 없다(그 돈을 못 쓰고 후지급분이 늘어난다). 아래 plan.late가 그걸 잡아낸다.
     · 음수 항목(성공보수·양도세)은 청산금에서 나가는 돈이라 청산금 가용에서 먼저 뺀다.
     · '등기 후'는 잔금에 쓸 수 없으므로 배분에서 제외. */
  const plan = useMemo(() => {
    if (!view) return null;
    const g = planG;
    const R = 1 + (g > 85 ? 0.035 : 0.033) + 0.007 * 1.1;
    const cap = (total - 0.1) / R;                   // 가용자금이 감당하는 최대 매수가
    const typed = parseFloat(priceInput);
    const price = Number.isFinite(typed) && typed > 0 ? typed : cap;
    const costs = sideCosts(price, g);

    const order = (w: string) => {
      if (/등기\s*후/.test(w)) return 99;             // 매수에 못 씀
      if (/즉시/.test(w)) return 0;
      const m = w.match(/(20\d\d)-(\d\d)/);
      if (m) return 1 + (+m[1] - 2026) * 12 + +m[2];  // 빠른 달부터
      return 90;                                      // '잔금' 등 — 가장 마지막
    };

    const neg = on.filter((i) => i.amount < 0).reduce((s, i) => s + i.amount, 0);
    const pos = on
      .filter((i) => i.amount > 0 && order(i.when) < 99)
      .map((i) => ({ ...i, avail: i.amount }))
      .sort((a, b) => order(a.when) - order(b.when));
    // 음수(성공보수·양도세)는 청산금에서 차감 — 없으면 가장 늦은 재원에서
    const sink = pos.find((i) => /청산금/.test(i.name)) ?? pos[pos.length - 1];
    if (sink) sink.avail += neg;                      // neg는 음수

    /* 배치 원칙
       · stage가 지정된 항목은 그 단계에 통째로 박는다
         (stage 값이 '잔금' | '잔금2' | '부대비용' 이면 그 단계로 간다)
       · 잔금 1·2차는 각 고정 재원 합으로 결정된다 — 중도금을 최대로 밀기 위해서다
       · 나머지는 계약금 → 중도금 → 부대비용 부족분 순으로 채우되 통째로만
       · 끝자리는 flex(보유 현금)에서만 쪼갠다 */
    const pinned = (st: string) => pos.filter((i) => i.stage === st);
    const free = pos.filter((i) => !i.stage);
    const pinSum = (st: string) => pinned(st).reduce((s, i) => s + i.avail, 0);

    /* 잔금 1차 고정 재원 중 입금일이 '연-월-일'로 박힌 것 — 잔금일이 그보다 앞서면
       그 돈을 잔금에 못 쓰고 후지급(잔금 2차)으로 넘어간다. 가장 늦은 날짜 하나를 쓴다.
       금액·날짜·항목명을 전부 데이터에서 읽으므로 코드에 특정 값을 박지 않는다. */
    const late = pinned('잔금')
      .filter((i) => /\d{4}-\d{2}-\d{2}/.test(i.when))
      .map((i) => ({ name: i.name, amount: i.avail, when: i.when }))
      .sort((a, b) => (a.when < b.when ? 1 : -1))[0] ?? null;

    const con = price * 0.10;
    /* 후지급분(잔금 2차)을 먼저 떼고, 조기잔금(1차)을 떼고, 남는 전부를 중도금에 민다 */
    const bal2 = Math.min(pinSum('잔금2'), price - con);
    const bal1 = Math.min(pinSum('잔금'), price - con - bal2);
    const mid = price - con - bal1 - bal2;

    const mk = (name: string, need: number, when: string) => ({
      name, need, when, sources: [] as { name: string; amount: number }[],
    });
    const stages = [
      mk('계약금 10%', con, '토허 허가 후'),
      mk(`중도금 ${((mid / price) * 100).toFixed(0)}%`, mid, '청산금 입금 확인 후 · 가등기 동시'),
      mk('잔금 1차', bal1, '조기잔금 — 보증금 회수·등기·이사 동시'),
      mk('잔금 2차', bal2, '매도인 근저당부 후지급'),
      mk('부대비용', costs.total, '잔금일 (취득세는 60일 내)'),
    ];
    const [conSt, midSt, bal1St, bal2St, sideSt] = stages;

    const put = (stage: typeof stages[0], src: typeof pos[0], amount: number) => {
      if (amount <= 0.005) return;
      stage.sources.push({ name: src.name, amount });
      src.avail -= amount;
    };
    const left = (stage: typeof stages[0]) =>
      stage.need - stage.sources.reduce((s, x) => s + x.amount, 0);

    // 1) 고정 항목 먼저 — 단계 금액을 넘는 분은 미배분으로 남긴다
    for (const [st, stage] of [['잔금', bal1St], ['잔금2', bal2St], ['부대비용', sideSt]] as const) {
      for (const i of pinned(st)) put(stage, i, Math.min(i.avail, left(stage)));
    }

    // 2) 나머지를 통째로 — 남은 금액에 들어가는 것 중 큰 것부터. flex는 끝자리용으로 남긴다
    const fillWhole = (stage: typeof stages[0]) => {
      let rest = left(stage);
      for (;;) {
        const c = free.filter((i) => !i.flex && i.avail > 0.005 && i.avail <= rest + 0.005);
        if (!c.length) break;
        const pick = c.reduce((a, b) => (b.avail > a.avail ? b : a));
        const take = pick.avail;          // put()이 avail을 깎으므로 먼저 잡아둔다
        put(stage, pick, take);
        rest -= take;
      }
      return rest;
    };
    // 3) 끝자리는 flex에서만 — 작은 것(보유 현금)부터 써서 큰 돈은 통째로 남긴다
    const fillFlex = (stage: typeof stages[0], rest: number) => {
      const fx = free.filter((i) => i.flex && i.avail > 0.005)
                     .sort((a, b) => a.avail - b.avail);
      for (const f of fx) {
        if (rest <= 0.005) break;
        const take = Math.min(f.avail, rest);
        put(stage, f, take);
        rest -= take;
      }
      (stage as typeof stage & { short: number }).short = -rest;
    };

    // 잔금 2차는 고정분이라 마지막 — 자유 재원이 먼저 앞 단계로 가게 둔다
    for (const st of [conSt, midSt, sideSt, bal1St, bal2St]) {
      fillFlex(st, fillWhole(st));
    }
    const leftover = pos.reduce((s, i) => s + Math.max(0, i.avail), 0);
    return {
      price, cap, costs, leftover, neg, mid, bal1, bal2, late,
      gap: total - (price + costs.total),            // 입력가 기준 여유/부족
      stages: stages as (typeof stages[0] & { short: number })[],
    };
  }, [view, on, total, planG, priceInput]);

  /* 평형별: 매물 최저가 + 부대비용 = 총 소요 vs 가용자금 (view 기준 → 편집 즉시 반영) */
  const rows = useMemo(() => {
    if (!listings?.ok || !listings.types) return [];
    return Object.keys(listings.types).map(Number).sort((a, b) => a - b).map((g) => {
      const min = listings.types![g].min;
      const c = sideCosts(min, g);
      return { g, min, costs: c.total, acqRate: c.acqRate, need: min + c.total, gap: total - (min + c.total) };
    });
  }, [listings, total]);

  if (!view) return null;

  const upd = (i: number, patch: Partial<FundsItem>) =>
    setDraft((d) => d && { ...d, items: d.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  /* funds 저장 공통 — PUT 후 서버가 정리한 결과를 그대로 받는다 */
  const put = async (payload: Funds) => {
    setSaving(true);
    setErr('');
    try {
      const r = await fetch('/api/realestate/funds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((x) => x.json());
      if (r.ok) { setFunds(r.funds); return true; }
      setErr(r.msg || r.detail || '저장 실패');
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
    return false;
  };

  const save = async () => {
    if (!draft) return;
    if (await put(draft)) setDraft(null);
  };

  /* 포함/제외 체크박스 — 편집 중이면 draft만 고치고(저장 버튼으로 확정),
     아니면 바로 파일에 반영한다. 시나리오를 빠르게 켜고 끄는 용도라 즉시 저장이 맞다. */
  const toggleOff = async (i: number) => {
    if (draft) { upd(i, { off: !draft.items[i].off }); return; }
    if (!funds) return;
    const next: Funds = {
      ...funds,
      items: funds.items.map((it, j) => (j === i ? { ...it, off: !it.off } : it)),
    };
    setFunds(next);                       // 낙관적 반영 — 체크가 즉시 먹는다
    if (!(await put(next))) setFunds(funds);   // 실패하면 되돌린다
  };

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* ── 패널 1: 자금 항목 ── */}
      <div className={`${card} w-full`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-semibold text-slate-100">
            가용 자금 — 합계 {fmt(total)}
            {draft && <span className="ml-2 text-xs font-normal text-amber-400">(편집 중 — 미저장)</span>}
          </h2>
          <div className="flex gap-2">
            {!draft ? (
              <button className={`${btn} border-gray-700 text-slate-300 hover:bg-gray-800`}
                      onClick={() => { setErr(''); setDraft(JSON.parse(JSON.stringify(funds))); }}>
                편집
              </button>
            ) : (
              <>
                <button className={`${btn} border-blue-500 text-blue-400 hover:bg-gray-800 disabled:opacity-40`}
                        disabled={saving} onClick={save}>
                  {saving ? '저장 중…' : '저장'}
                </button>
                <button className={`${btn} border-gray-700 text-slate-400 hover:bg-gray-800`}
                        disabled={saving} onClick={() => { setDraft(null); setErr(''); }}>
                  취소
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          기준 {view.as_of} · backend/realestate/funds.json (파일 직접 수정도 새로고침 시 반영)
          <br />
          <span className="text-slate-500">
            <b>포함</b> 체크를 풀면 그 항목을 뺀 합계·대금 구조가 바로 나온다 — 항목을
            지우지 않고 "이 돈이 없다면?"을 돌려보는 용도다. 편집 중이 아니면 즉시 저장된다.
          </span>
        </p>
        {err && <p className="text-xs text-red-400 mb-2">⚠ {err}</p>}

        {/* 집행 순서·조건 경고 — 어기면 세금·권리에서 손해가 큰 항목 */}
        {!!view.warnings?.length && (
          <div className="mb-3 px-3 py-2 rounded-lg border border-amber-700 bg-amber-900/20">
            {view.warnings.map((w, i) => (
              <div key={i} className="text-xs text-amber-300 leading-relaxed">
                ⚠ {w}
              </div>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-slate-400">
                <th className={`${th} text-center`} title="체크를 풀면 합계·대금 구조에서 빠진다">포함</th>
                <th className={`${th} text-left`}>항목</th>
                <th className={`${th} text-right`}>금액</th>
                <th className={`${th} text-left`}>시점</th>
                <th className={`${th} text-right`}>연이율%</th>
                <th className={`${th} text-right`}>월 부담</th>
                <th className={`${th} text-left`}>비고</th>
                {draft && <th className={th}></th>}
              </tr>
            </thead>
            <tbody>
              {view.items.map((it, i) => {
                const m = monthlyCost(it);
                const isDebt = /대출|차용|담보|주담대/.test(it.name);
                const debtCls = isDebt ? 'text-amber-300' : '';
                return (
                  <tr key={i}
                      className={it.off ? 'text-slate-600 line-through decoration-slate-600'
                                        : !draft && it.amount === 0 ? 'text-slate-500' : ''}>
                    <td className={`${td} text-center`}>
                      <input type="checkbox" checked={!it.off} disabled={saving}
                             onChange={() => toggleOff(i)}
                             title={it.off ? '제외됨 — 체크하면 합계에 다시 넣는다'
                                           : '체크를 풀면 합계·대금 구조에서 뺀다'}
                             className="align-middle accent-blue-500 cursor-pointer
                                        disabled:opacity-40 disabled:cursor-wait" />
                    </td>
                    <td className={`${td} ${it.off ? '' : debtCls}`}>
                      {draft ? (
                        <input className={`${inp} w-36`} value={it.name}
                               onChange={(e) => upd(i, { name: e.target.value })} />
                      ) : it.link ? (
                        <a href={it.link} target="_blank" rel="noreferrer"
                           className="text-blue-400 hover:underline">{it.name} ↗</a>
                      ) : it.name}
                    </td>
                    <td className={`${td} text-right tabular-nums ${debtCls}`}>
                      {draft ? (
                        <input type="number" step="0.1" min="0" className={`${inp} w-20 text-right`}
                               value={it.amount}
                               onChange={(e) => upd(i, { amount: +e.target.value })} />
                      ) : fmt(it.amount)}
                    </td>
                    <td className={td}>
                      {draft ? (
                        <input className={`${inp} w-28`} value={it.when}
                               onChange={(e) => upd(i, { when: e.target.value })} />
                      ) : it.when}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>
                      {draft ? (
                        <input type="number" step="0.1" min="0" className={`${inp} w-16 text-right`}
                               value={it.rate ?? ''}
                               onChange={(e) => upd(i, { rate: e.target.value === '' ? undefined : +e.target.value })} />
                      ) : (it.rate ? it.rate : '')}
                    </td>
                    <td className={`${td} text-right tabular-nums text-amber-400`}
                        title={it.rate
                          ? `연 ${it.rate}%` + (it.term_years ? ` 원리금균등 ${it.term_years}년` : ' 이자만')
                          : undefined}>
                      {m > 0 ? `${Math.round(m * 10000)}만` : ''}
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-gray-800 text-xs text-slate-400">
                      {draft ? (
                        <input className={`${inp} w-full min-w-[180px]`} value={it.note ?? ''}
                               onChange={(e) => upd(i, { note: e.target.value })} />
                      ) : (
                        <>{it.rate && it.term_years ? `원리금 ${it.term_years}년 · ` : ''}{it.note || ''}</>
                      )}
                    </td>
                    {draft && (
                      <td className={td}>
                        <button className="text-red-400 hover:text-red-300 px-1" title="항목 삭제"
                                onClick={() => setDraft((d) => d && { ...d, items: d.items.filter((_, j) => j !== i) })}>
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="font-semibold text-slate-100">
                <td className={`${td} text-center text-xs text-slate-500 font-normal`}>
                  {on.length}/{view.items.length}
                </td>
                <td className={td}>합계</td>
                <td className={`${td} text-right tabular-nums`}>{fmt(total)}</td>
                <td className={td}></td>
                <td className={td}></td>
                <td className={`${td} text-right tabular-nums text-amber-400`}>
                  {Math.round(monthly * 10000)}만
                </td>
                <td className={`${td} text-xs font-normal text-slate-500`} colSpan={draft ? 2 : 1}>
                  {offSum !== 0 && <>제외 {fmt(offSum)} · 전체 {fmt(total + offSum)}</>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {draft && (
          <button className={`${btn} border-gray-700 text-slate-300 hover:bg-gray-800 mt-2`}
                  onClick={() => setDraft((d) => d && {
                    ...d, items: [...d.items, { name: '', amount: 0, when: '즉시', note: '' }],
                  })}>
            + 항목 추가
          </button>
        )}
      </div>

      {/* ── 패널 2: 대금 구조 — 가용자금이 감당하는 매수가 기준으로 단계별 재원 배분 ── */}
      {plan && (
        <div className={`${card} w-full`}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[15px] font-semibold text-slate-100">
              대금 구조 — 가용자금 기준
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>매매가</span>
              {/* type=number는 스피너가 붙고 휠로 값이 바뀌어 다루기 나쁘다 → 텍스트 + 숫자만 허용 */}
              <input type="text" inputMode="decimal"
                     className={`${inp} w-24 px-2 py-1 text-right tabular-nums text-[14px]
                                 focus:outline-none focus:border-blue-500`}
                     placeholder={plan.cap.toFixed(2)}
                     value={priceInput}
                     onFocus={(e) => e.currentTarget.select()}
                     onChange={(e) => {
                       const v = e.target.value.replace(/[^0-9.]/g, '');
                       if (/^\d*\.?\d*$/.test(v)) setPriceInput(v);
                     }} />
              <span>억</span>
              {priceInput && (
                <button className="text-slate-500 hover:text-slate-300 px-1"
                        title={`가용자금 상한 ${fmt(plan.cap)}로 되돌리기`}
                        onClick={() => setPriceInput('')}>✕</button>
              )}
              <span className="ml-1">평형</span>
              <select className={inp}
                      value={planG}
                      onChange={(e) => setPlanG(+e.target.value)}>
                {(listings?.ok && listings.types
                  ? Object.keys(listings.types).map(Number).sort((a, b) => a - b)
                  : [84, 117, 136]
                ).map((g) => (
                  <option key={g} value={g}>{gLabel(g)}</option>
                ))}
              </select>
            </div>
          </div>
          {/* 자주 쓰는 값은 클릭 한 번으로 */}
          <div className="flex items-center gap-1.5 mb-2 text-xs">
            <span className="text-slate-500">빠른 입력</span>
            {[
              { label: `상한 ${plan.cap.toFixed(2)}`, v: plan.cap.toFixed(2) },
              ...(listings?.ok && listings.types?.[planG]
                ? [{ label: `최저호가 ${listings.types[planG].min.toFixed(1)}`, v: String(listings.types[planG].min) }]
                : []),
              ...['28.5', '28.3', '27.5', '27.3', '27'].map((v) => ({ label: v, v })),
            ].map((q) => (
              <button key={q.label}
                      className={`border rounded px-2 py-0.5 ${
                        priceInput === q.v
                          ? 'border-blue-500 text-blue-400'
                          : 'border-gray-700 text-slate-400 hover:bg-gray-800'}`}
                      onClick={() => setPriceInput(q.v)}>
                {q.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-slate-400 mb-3">
            가용 {fmt(total)} · 소요 {fmt(plan.price + plan.costs.total)} ·{' '}
            <b className={plan.gap >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {plan.gap >= 0 ? '여유 +' : '부족 '}{plan.gap.toFixed(2)}억
            </b>
            {!priceInput && <> · 입력 없으면 가용자금 상한 {fmt(plan.cap)} 기준</>}
            {plan.neg < 0 && <> · 성공보수·양도세 {fmt(plan.neg)}는 청산금에서 선차감</>}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-slate-400">
                  <th className={`${th} text-left`}>단계</th>
                  <th className={`${th} text-right`}>금액</th>
                  <th className={`${th} text-left`}>재원</th>
                  <th className={`${th} text-left`}>시점</th>
                </tr>
              </thead>
              <tbody>
                {plan.stages.map((s, i) => (
                  <tr key={i}>
                    <td className={`${td} font-medium text-slate-200`}
                        title={
                          s.name === '부대비용'
                            ? `취득세 ${fmt(plan.costs.acq)} + 중개보수 ${fmt(plan.costs.broker)} + 등기·채권 ${fmt(plan.costs.regist)}`
                            : s.name.startsWith('잔금 2차')
                              ? `매도인 1순위 근저당 채권최고액 ${fmt(s.need * 1.2)} (120%) · `
                                + `연 4.5%·3개월 이자 약 ${Math.round(s.need * 0.045 * 0.25 * 10000)}만`
                              : undefined
                        }>
                      {s.name}</td>
                    <td className={`${td} text-right tabular-nums font-semibold`}>{fmt(s.need)}</td>
                    {/* 재원은 숫자 우선 — 마우스를 올리면 어느 항목인지 나온다 */}
                    <td className={td}>
                      {s.sources.map((x, j) => (
                        <span key={j}
                              title={`${x.name} ${fmt(x.amount)}`}
                              className="inline-block mr-3 tabular-nums text-slate-200
                                         border-b border-dotted border-slate-600 cursor-help">
                          {fmt(x.amount)}
                        </span>
                      ))}
                      {s.short < -0.005 && (
                        <span className="text-red-400">· 부족 {fmt(s.short)}</span>
                      )}
                    </td>
                    <td className={`${td} text-slate-400`}>{s.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 mt-2.5">
            부대 {fmt(plan.costs.total)} = 취득세 {fmt(plan.costs.acq)} + 중개보수 {fmt(plan.costs.broker)}
            {' '}+ 등기 {fmt(plan.costs.regist)}
            {plan.leftover > 0.005 && <> · 미배분 {fmt(plan.leftover)}</>}
            <br />
            중도금을 최대로 밀어 잔금을 가볍게 잡았다 — 잔금은 중도금 시점 이후에만 들어오는
            재원(stage로 지정한 항목)으로 고정하고 나머지를 전부 중도금에 넣는다.
            중도금을 지급하면 매도인이 해제할 수 없어 물건이 빨리 확정된다.
            <br />
            잔금 1차 {fmt(plan.bal1)}로 보증금 회수·잔금·등기·이사를 같은 날에 맞물리고,
            나중에 들어오는 재원은 잔금 2차 {fmt(plan.bal2)}로 미뤄 매도인 1순위 근저당(채권최고액{' '}
            {fmt(plan.bal2 * 1.2)})으로 담보한다 — 주담대를 쓰지 않아 1순위를 매도인에게 줄 수 있다.
            {plan.bal2 > 0.005 && <> 그 재원이 축소·지연되면 말소가 안 되고 임의경매 위험이
            생기므로, 확정 통지를 받은 뒤에만 이 구조로 들어간다.</>}
            <br />
            {plan.late && (
              <span className="text-amber-500/90">
                <b>{plan.late.name}</b> {fmt(plan.late.amount)}은 <b>{plan.late.when}</b> 입금이다 —
                잔금일이 그보다 앞서면 잔금 1차에 쓸 수 없고 후지급분이{' '}
                {fmt(plan.bal2 + plan.late.amount)}으로 되돌아간다. 잔금일을 그 다음 영업일
                이후로 잡고, 임차 해지통고 도달도 같은 기준으로 역산한다(주임법 3개월).
              </span>
            )}
          </p>
        </div>
      )}

      {/* ── 패널 3: 매물 최저가 대비 (편집 중에도 입력값 기준 실시간 재계산) ── */}
      {rows.length > 0 && (
        <div className={`${card} w-full`}>
          <h2 className="text-[15px] font-semibold mb-1 text-slate-100">
            매물 최저가 대비 — 부대비용 포함
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            부대비용 = 취득세 3.3%(전용 85㎡ 이하)/3.5%(초과, 농특세 포함) +
            중개보수 0.7%+VAT + 등기·채권 약 0.1억 (중개보수는 협의 가능)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-slate-400">
                  <th className={`${th} text-left`}>평형</th>
                  <th className={`${th} text-right`}>최저 호가</th>
                  <th className={`${th} text-right`}>부대비용</th>
                  <th className={`${th} text-right`}>총 소요</th>
                  <th className={`${th} text-right`}>여유 / 부족</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.g}>
                    <td className={td}>{gLabel(r.g)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(r.min)}</td>
                    <td className={`${td} text-right tabular-nums`}
                        title={`취득세 ${(r.acqRate * 100).toFixed(1)}% + 중개보수 0.7%+VAT + 등기·채권 0.1억`}>
                      {fmt(r.costs)}
                    </td>
                    <td className={`${td} text-right tabular-nums font-semibold`}>{fmt(r.need)}</td>
                    <td className={`${td} text-right tabular-nums font-semibold ${
                      r.gap >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.gap >= 0 ? '+' : ''}{fmt(r.gap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
