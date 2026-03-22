/** 키친사이클 원형 다이어그램 */

interface Props {
  currentPhase: number; // 1~4
}

const PHASES = [
  { id: 1, label: 'Phase 1', desc: '수동적 재고축소', sub: '상승 초기', color: '#10b981', angle: 315 },
  { id: 2, label: 'Phase 2', desc: '적극적 재고확충', sub: '상승 중기', color: '#06b6d4', angle: 45 },
  { id: 3, label: 'Phase 3', desc: '수동적 재고축적', sub: '하락 초기', color: '#f97316', angle: 135 },
  { id: 4, label: 'Phase 4', desc: '적극적 재고감축', sub: '하락 후기', color: '#ef4444', angle: 225 },
];

export function CycleDiagram({ currentPhase }: Props) {
  const radius = 80;
  const cx = 120;
  const cy = 120;

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="240" viewBox="0 0 240 240">
        {/* 배경 원 */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1e293b" strokeWidth="2" />

        {/* 4개 Phase 영역 */}
        {PHASES.map((phase) => {
          const rad = (phase.angle * Math.PI) / 180;
          const x = cx + (radius - 15) * Math.cos(rad);
          const y = cy + (radius - 15) * Math.sin(rad);
          const isActive = phase.id === currentPhase;
          const dotR = isActive ? 12 : 8;

          return (
            <g key={phase.id}>
              {/* 도트 */}
              <circle
                cx={x}
                cy={y}
                r={dotR}
                fill={isActive ? phase.color : '#1e293b'}
                stroke={phase.color}
                strokeWidth={isActive ? 3 : 1}
                opacity={isActive ? 1 : 0.4}
              />
              {isActive && (
                <circle
                  cx={x}
                  cy={y}
                  r={dotR + 5}
                  fill="none"
                  stroke={phase.color}
                  strokeWidth={1}
                  opacity={0.3}
                >
                  <animate attributeName="r" from={String(dotR + 3)} to={String(dotR + 10)} dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.3" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              {/* 라벨 */}
              <text
                x={cx + (radius + 25) * Math.cos(rad)}
                y={cy + (radius + 25) * Math.sin(rad)}
                textAnchor="middle"
                fill={isActive ? phase.color : '#475569'}
                fontSize={isActive ? 10 : 9}
                fontFamily="JetBrains Mono, monospace"
                fontWeight={isActive ? 'bold' : 'normal'}
              >
                {phase.label}
              </text>
            </g>
          );
        })}

        {/* 방향 화살표 (시계방향) */}
        <path
          d={`M ${cx} ${cy - radius + 25} A ${radius - 25} ${radius - 25} 0 1 1 ${cx - 1} ${cy - radius + 25}`}
          fill="none"
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="4 4"
          markerEnd="url(#arrowhead)"
        />
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="#334155" />
          </marker>
        </defs>

        {/* 중앙 텍스트 */}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono, monospace">
          Kitchen
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono, monospace">
          Cycle
        </text>
      </svg>

      {/* 현재 Phase 설명 */}
      {PHASES.filter((p) => p.id === currentPhase).map((p) => (
        <div key={p.id} className="text-center mt-2">
          <span className="text-sm font-bold font-mono" style={{ color: p.color }}>
            {p.label}: {p.desc}
          </span>
          <span className="text-xs text-slate-500 font-mono ml-2">({p.sub})</span>
        </div>
      ))}
    </div>
  );
}
