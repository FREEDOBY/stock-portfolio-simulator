/** 베어장 위험 4축 요약 카드 (대시보드용)
 *
 * 유형별 축(긴축·버블·신용·쇼크)의 현재 점수를 미니 게이지로 표시.
 * 클릭 시 상세 페이지(bear-risk)로 이동.
 */
import { WARNING_LEVEL_CONFIG } from '../../types/macro';
import type { BearMarketRiskData } from '../../types/macro';

interface Props {
  data: BearMarketRiskData;
  onNavigate?: () => void;
}

export function BearRiskBanner({ data, onNavigate }: Props) {
  const config = WARNING_LEVEL_CONFIG[data.summary.level];
  const stage = data.summary.stage_info;

  return (
    <div
      data-testid="bear-risk-banner"
      className="bg-[#111827] border rounded-lg p-5 cursor-pointer hover:border-cyan-500/40 transition-colors"
      style={{ borderColor: (stage?.color ?? config.color) + '50' }}
      onClick={onNavigate}
    >
      {/* 헤더 — 행동 단계 배지 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${data.summary.stage !== 'normal' ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: stage?.color ?? config.color }}
          />
          <span className="text-sm font-mono text-slate-500 uppercase tracking-wider">
            Bear Market Risk
          </span>
        </div>
        {stage && (
          <span
            className="text-xs font-mono px-2 py-0.5 rounded"
            style={{
              color: stage.color,
              backgroundColor: stage.color + '1a',
              border: `1px solid ${stage.color}40`,
            }}
          >
            {stage.label} · {stage.action}
          </span>
        )}
      </div>

      {/* 헤드라인 */}
      <p className="text-sm font-mono text-slate-400 mb-4">{data.summary.headline}</p>

      {/* 4축 미니 게이지 */}
      <div className="space-y-2">
        {data.axes.map((axis) => (
          <div key={axis.key} className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-500 w-16 flex-shrink-0">{axis.label}</span>
            <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden flex-1">
              <div
                className="absolute h-full rounded-full transition-all duration-700"
                style={{ width: `${axis.score ?? 0}%`, backgroundColor: axis.color }}
              />
              <div className="absolute h-full w-px bg-slate-600" style={{ left: '35%' }} />
              <div className="absolute h-full w-px bg-slate-600" style={{ left: '60%' }} />
            </div>
            <span className="text-xs font-mono w-14 text-right flex-shrink-0" style={{ color: axis.color }}>
              {axis.key === 'shock'
                ? axis.state_label
                : axis.score !== null ? axis.score.toFixed(0) : 'N/A'}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] font-mono text-slate-700 mt-3">
        쇼크축은 예측이 아닌 추세 이탈 확인 · 클릭 시 30년 검증 차트
      </p>
    </div>
  );
}
