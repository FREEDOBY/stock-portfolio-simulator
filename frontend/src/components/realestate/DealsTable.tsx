/** 거래 내역 테이블 — 최신순, 필터 조건 공유, 평형 선택, 더 보기 */

import { useMemo, useState } from 'react';
import type { Deal } from '../../lib/realestate/types';
import { fmtEok } from '../../lib/realestate/utils';

interface Props {
  data: Deal[];
  limit: number;
  onMore: () => void;
  gLabel: (g: number) => string;
}

export function DealsTable({ data, limit, onMore, gLabel }: Props) {
  const [sel, setSel] = useState<number | null>(null); // null = 전체
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    data.forEach((d) => {
      const g = Math.floor(d.ar);
      m.set(g, (m.get(g) || 0) + 1);
    });
    return m;
  }, [data]);
  const groups = [...counts.keys()].sort((a, b) => a - b);
  // 상단 필터 변경으로 선택 평형이 사라지면 전체로 복귀
  const effSel = sel != null && counts.has(sel) ? sel : null;
  const shown = effSel == null ? data : data.filter((d) => Math.floor(d.ar) === effSel);
  const rows = [...shown].reverse().slice(0, limit);
  const td = 'px-2.5 py-1.5 border-b border-gray-800 whitespace-nowrap';
  const btn = (active: boolean) =>
    `px-3 py-1.5 text-[13px] ${active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-gray-800'}`;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-[18px] mt-4">
      <h2 className="text-[15px] font-semibold mb-1 text-slate-100">거래 내역</h2>
      <p className="text-xs text-slate-400 mb-3">최신순 · 표시 조건은 위 필터를 따릅니다</p>
      <div className="inline-flex border border-gray-700 rounded-lg overflow-hidden mb-3">
        <button onClick={() => setSel(null)} className={btn(effSel == null)}>
          전체 ({data.length})
        </button>
        {groups.map((g) => (
          <button key={g} onClick={() => setSel(g)} className={btn(effSel === g)}>
            {gLabel(g).split(' ')[0]} ({counts.get(g)})
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-slate-400">
              <th className={`${td} text-left font-medium`}>계약일</th>
              <th className={`${td} text-left font-medium`}>평형</th>
              <th className={`${td} text-left font-medium`}>동</th>
              <th className={`${td} text-right font-medium`}>층</th>
              <th className={`${td} text-right font-medium`}>거래금액</th>
              <th className={`${td} text-left font-medium`}>유형</th>
              <th className={`${td} text-left font-medium`}>비고</th>
              <th className={`${td} text-left font-medium`}>등기일</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => {
              const canceled = d.cdeal === '해제';
              const cls = canceled ? `${td} text-slate-500 line-through` : td;
              return (
                <tr key={`${d.date}-${d.dong}-${d.fl}-${d.amt}-${i}`}>
                  <td className={cls}>{d.date}</td>
                  <td className={cls}>{gLabel(Math.floor(d.ar))}</td>
                  <td className={cls}>{d.dong || '-'}</td>
                  <td className={`${cls} text-right tabular-nums`}>{d.fl}</td>
                  <td className={`${cls} text-right tabular-nums`}>{fmtEok(d.amt)}</td>
                  <td className={cls}>{d.gbn || '-'}</td>
                  <td className={td}>
                    {canceled && (
                      <span className="text-red-400 text-xs">
                        해제{d.cdealDay ? ` (${d.cdealDay})` : ''}
                      </span>
                    )}
                  </td>
                  <td className={cls}>{d.rgst || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <div className="text-center mt-2.5">
          <button
            onClick={onMore}
            className="border border-gray-700 rounded-lg px-3.5 py-1.5 text-[13px] text-slate-200 hover:bg-gray-800"
          >
            더 보기
          </button>
        </div>
      )}
    </div>
  );
}
