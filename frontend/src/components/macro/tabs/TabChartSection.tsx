/** 탭 내 차트 섹션 래퍼 */
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

export function TabChartSection({ title, children }: Props) {
  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono mb-3">
        {title}
      </h4>
      {children}
    </div>
  );
}
