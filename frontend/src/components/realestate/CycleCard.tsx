/** 고점·저점 사이클 카드 — 표시 중인 기간의 지그재그 피벗 나열 */

import type { LineSeries } from '../../lib/realestate/types';
import { eokTxt } from '../../lib/realestate/utils';

export function CycleCard({ series }: { series: LineSeries[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-[18px] mt-4">
      <h2 className="text-[15px] font-semibold mb-1 text-slate-100">고점·저점 사이클</h2>
      <p className="text-xs text-slate-400 mb-3">
        표시 중인 기간의 월 중앙값 기준 · 괄호 안은 직전 고/저점 대비 등락폭
      </p>
      <div className="flex flex-col gap-2 overflow-x-auto">
        {series.map((s) => (
          <div key={s.g} className="flex items-center gap-x-2.5 gap-y-2 flex-wrap text-[13px]">
            <span className="flex-none w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className="flex-none w-[150px] text-slate-300">{s.label}</span>
            {!s.pivots.length ? (
              <span className="text-slate-500">기간 내 뚜렷한 고저점 없음</span>
            ) : (
              s.pivots.map((p, i) => (
                <span key={i} className="whitespace-nowrap">
                  {i > 0 && <span className="text-slate-500 mr-2.5">→</span>}
                  <b className={p.type === 'H' ? 'text-emerald-400' : 'text-red-400'}>
                    {eokTxt(p.y)}
                  </b>
                  <span className="text-slate-500">
                    {' '}{p.type === 'H' ? '고점' : '저점'}{' '}
                    {p.open ? '진행 중' : p.ym.slice(0, 4) + '.' + p.ym.slice(4)}
                    {p.pct != null && ` (${p.pct > 0 ? '+' : ''}${Math.round(p.pct)}%)`}
                  </span>
                </span>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
