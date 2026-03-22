/** 탭 내 차트 섹션 래퍼 - 지표 설명 툴팁 포함 */
import { type ReactNode, useState } from 'react';

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

export function TabChartSection({ title, description, children }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3 relative">
        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono">
          {title}
        </h4>
        {description && (
          <div
            className="relative"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <svg
              className="w-4 h-4 text-slate-600 hover:text-cyan-400 cursor-help transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {showTooltip && (
              <div className="absolute left-0 top-full mt-2 z-50 w-72 p-3 bg-[#1a1f2e] border border-slate-600/50 rounded shadow-xl shadow-black/50">
                <p className="text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-line">
                  {description}
                </p>
                <div className="absolute -top-2 left-2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-transparent border-b-[#1a1f2e]" />
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
