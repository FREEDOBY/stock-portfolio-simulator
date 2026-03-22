import { useState } from 'react';
import { WARNING_LEVEL_CONFIG } from '../../types/macro';
import type { RecessionWarning } from '../../types/macro';

interface Props {
  warning: RecessionWarning;
}

export function RecessionWarningBanner({ warning }: Props) {
  const [expanded, setExpanded] = useState(false);
  const config = WARNING_LEVEL_CONFIG[warning.level];

  return (
    <div
      data-testid="recession-warning"
      className="bg-[#111827] border rounded-lg p-5"
      style={{ borderColor: config.color + '50' }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${warning.level !== 'normal' ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: config.color }}
          />
          <span className="text-sm font-mono text-slate-500 uppercase tracking-wider">
            Recession Risk
          </span>
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            color: config.color,
            backgroundColor: config.bgColor,
            border: `1px solid ${config.color}40`,
          }}
        >
          {config.label}
        </span>
      </div>

      {/* 점수 + 게이지 */}
      <div className="text-center mb-3">
        <span className="text-4xl font-bold font-mono" style={{ color: config.color }}>
          {warning.score.toFixed(1)}%
        </span>
        <p className="text-xs text-slate-600 font-mono mt-1">
          {warning.triggered_count}/{warning.total_checks} indicators triggered
        </p>
      </div>

      {/* 게이지 바 */}
      <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className="absolute h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.min(warning.score, 100)}%`,
            backgroundColor: config.color,
          }}
        />
        {/* 레벨 마커 */}
        <div className="absolute h-full w-px bg-slate-600" style={{ left: '15%' }} />
        <div className="absolute h-full w-px bg-slate-600" style={{ left: '35%' }} />
        <div className="absolute h-full w-px bg-slate-600" style={{ left: '60%' }} />
      </div>
      <div className="flex justify-between text-xs font-mono text-slate-700 mb-4">
        <span>0%</span>
        <span>15%</span>
        <span>35%</span>
        <span>60%</span>
        <span>100%</span>
      </div>

      {/* 체크리스트 토글 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-2 text-xs font-mono text-slate-500 hover:text-cyan-400 transition-colors"
      >
        <span className={`transform transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        Indicator Details
      </button>

      {/* 개별 지표 체크리스트 */}
      {expanded && (
        <div className="mt-3 space-y-1.5">
          {warning.checks.map((check) => (
            <div
              key={check.id}
              className={`flex items-center justify-between px-3 py-2 rounded text-xs font-mono ${
                check.triggered
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-[#0d1117] border border-slate-700/30'
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={check.triggered ? 'text-red-400' : 'text-emerald-400'}>
                  {check.triggered ? '⚠' : '✓'}
                </span>
                <span className={check.triggered ? 'text-red-300' : 'text-slate-400'}>
                  {check.name}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-slate-600 truncate max-w-[200px]" title={check.detail}>
                  {check.detail}
                </span>
                <span className="text-slate-700">×{check.weight}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
