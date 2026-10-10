/** 관심 단지 카드 — 등록된 단지(profiles.json)를 상단에 카드로 깔고,
 *  클릭 한 번으로 해당 단지 대시보드로 전환한다. */

import { useCallback, useEffect, useState } from 'react';
import type { ComplexProfile } from '../../lib/realestate/types';

interface Props {
  current: ComplexProfile | null | undefined;
  onSwitched: () => void | Promise<void>;
}

export function ComplexCards({ current, onSwitched }: Props) {
  const [list, setList] = useState<ComplexProfile[]>([]);
  const [switching, setSwitching] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/realestate/complexes').then((x) => x.json());
      if (r.ok) setList(r.complexes);
    } catch { /* 카드 로딩 실패는 치명적이지 않음 */ }
  }, []);

  useEffect(() => { load(); }, [load, current?.complexNo]);

  const pick = async (c: ComplexProfile) => {
    if (c.complexNo === current?.complexNo || switching != null) return;
    setSwitching(c.complexNo);
    try {
      const r = await fetch('/api/realestate/complex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complexNo: c.complexNo, name: c.name,
                               lawdCd: c.lawdCd, address: c.regionName }),
      }).then((x) => x.json());
      if (r.ok) await onSwitched();
    } catch { /* ignore */ }
    setSwitching(null);
  };

  if (list.length < 2) return null;  // 단지가 하나뿐이면 카드 불필요

  return (
    <div className="flex gap-2.5 mb-4 overflow-x-auto pb-1">
      {list.map((c) => {
        const active = c.complexNo === current?.complexNo;
        const noListing = c.complexNo <= 0;
        return (
          <button
            key={c.complexNo}
            onClick={() => pick(c)}
            disabled={switching != null}
            className={`flex-none text-left rounded-xl px-4 py-2.5 border transition-colors ${
              active
                ? 'bg-blue-600/20 border-blue-500'
                : 'bg-gray-900 border-gray-800 hover:border-gray-600'
            } disabled:opacity-60`}
          >
            <div className={`text-[13.5px] font-semibold ${active ? 'text-blue-300' : 'text-slate-100'}`}>
              {switching === c.complexNo ? '전환 중…' : c.name}
              {active && <span className="ml-1.5 text-[11px] font-normal text-blue-400">보는 중</span>}
            </div>
            <div className="text-[11.5px] text-slate-500 mt-0.5">
              {c.regionName}
              {noListing && <span className="text-amber-500/80"> · 매물 미연결</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
