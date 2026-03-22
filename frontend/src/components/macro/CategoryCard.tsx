import { CATEGORY_CONFIG } from '../../types/macro';
import type { CategorySummary } from '../../types/macro';

interface Props {
  categoryId: string;
  summary: CategorySummary;
  onClick?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  bullish: '#10b981',
  bearish: '#ef4444',
  neutral: '#64748b',
  fear: '#f97316',
  overvalued: '#f59e0b',
};

export function CategoryCard({ categoryId, summary, onClick }: Props) {
  const config = CATEGORY_CONFIG[categoryId];
  const statusColor = STATUS_COLORS[summary.status] || '#64748b';

  if (!config) return null;

  return (
    <button
      data-testid={`category-card-${categoryId}`}
      onClick={onClick}
      className="bg-[#111827] border border-slate-700/50 rounded-lg p-4 text-left hover:border-slate-600/50 transition-all w-full group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={config.icon} />
          </svg>
          <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            {config.label}
          </span>
        </div>
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      </div>

      {/* 핵심 수치 */}
      <div className="space-y-1">
        {Object.entries(summary.key_values).map(([key, value]) => {
          if (value === null || value === undefined) return null;
          return (
            <div key={key} className="flex justify-between items-center">
              <span className="text-xs text-slate-600 font-mono uppercase">{key}</span>
              <span className="text-sm font-bold font-mono" style={{ color: statusColor }}>
                {typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 2) : value}
              </span>
            </div>
          );
        })}
      </div>

      {/* 호버 힌트 */}
      <div className="mt-2 text-xs text-slate-700 font-mono group-hover:text-cyan-500 transition-colors">
        Click for details →
      </div>
    </button>
  );
}
