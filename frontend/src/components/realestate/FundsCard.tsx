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
  const [draft, setDraft] = useState<Funds | null>(null);   // 편집 중이면 non-null
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { setFunds(initial); }, [initial]);

  const view = draft ?? funds;  // 편집 중엔 입력값 기준으로 실시간 재계산
  const total = useMemo(
    () => (view ? view.items.reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0),
    [view]
  );
  const monthly = useMemo(
    () => (view ? view.items.reduce((s, i) => s + monthlyCost(i), 0) : 0),
    [view]
  );

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

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setErr('');
    try {
      const r = await fetch('/api/realestate/funds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      }).then((x) => x.json());
      if (r.ok) { setFunds(r.funds); setDraft(null); }
      else setErr(r.msg || '저장 실패');
    } catch (e) {
      setErr(String(e));
    }
    setSaving(false);
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
                  <tr key={i} className={!draft && it.amount === 0 ? 'text-slate-500' : ''}>
                    <td className={`${td} ${debtCls}`}>
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
                <td className={td}>합계</td>
                <td className={`${td} text-right tabular-nums`}>{fmt(total)}</td>
                <td className={td}></td>
                <td className={td}></td>
                <td className={`${td} text-right tabular-nums text-amber-400`}>
                  {Math.round(monthly * 10000)}만
                </td>
                <td className={td} colSpan={draft ? 2 : 1}></td>
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

      {/* ── 패널 2: 매물 최저가 대비 (편집 중에도 입력값 기준 실시간 재계산) ── */}
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
