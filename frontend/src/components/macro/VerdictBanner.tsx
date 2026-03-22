import { VERDICT_CONFIG } from '../../types/macro';
import type { OverallResult } from '../../types/macro';

interface Props {
  overall: OverallResult;
}

export function VerdictBanner({ overall }: Props) {
  const config = VERDICT_CONFIG[overall.verdict];

  return (
    <div
      data-testid="verdict-banner"
      className="bg-[#111827] border rounded-lg p-6 text-center"
      style={{ borderColor: config.color + '50' }}
    >
      <div className="flex items-center justify-center gap-3 mb-3">
        <div
          className="w-3 h-3 rounded-full animate-pulse"
          style={{ backgroundColor: config.color }}
        />
        <span className="text-sm font-mono text-slate-500 uppercase tracking-wider">
          Overall Verdict
        </span>
      </div>

      {/* 판정 라벨 */}
      <div
        className="text-3xl font-bold font-mono mb-2 uppercase tracking-wider"
        style={{ color: config.color }}
      >
        {config.label}
      </div>

      {/* 점수 */}
      <div className="text-5xl font-bold font-mono mb-4" style={{ color: config.color }}>
        {overall.score > 0 ? '+' : ''}{overall.score.toFixed(2)}
      </div>

      {/* 5단계 게이지 */}
      <div className="flex justify-center gap-1 mb-4">
        {Object.entries(VERDICT_CONFIG).map(([key, cfg]) => (
          <div
            key={key}
            className="h-1.5 w-12 rounded-full transition-all"
            style={{
              backgroundColor: key === overall.verdict ? cfg.color : '#1e293b',
            }}
          />
        ))}
      </div>

      {/* 업데이트 시간 */}
      <p className="text-sm font-mono text-slate-600">
        Last Updated: {new Date(overall.updated_at).toLocaleString()}
      </p>
    </div>
  );
}
