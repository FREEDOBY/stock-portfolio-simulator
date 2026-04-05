/** 코스톨라니 달걀모델 다이어그램
 *
 * 6단계: A1(매집) → A2(동행) → A3(과열) → B1(분배) → B2(동행하락) → B3(과매도)
 * 판정: FEDFUNDS 방향 + VIX 수준
 */
import type { KostolanyData } from '../../../types/macro';

interface Props {
  data: KostolanyData;
}

// 도트 위치를 직접 지정 (타원 위 정확한 좌표)
const CX = 170;
const CY = 160;
const RX = 110;
const RY = 120;

const PHASES = [
  { id: 'A1', label: '매집',     angle: 200 },
  { id: 'A2', label: '동행',     angle: 270 },
  { id: 'A3', label: '과열',     angle: 340 },
  { id: 'B1', label: '분배',     angle: 20  },
  { id: 'B2', label: '동행하락', angle: 90  },
  { id: 'B3', label: '과매도',   angle: 160 },
] as const;

const SENTIMENT_LABEL = { fear: '공포', neutral: '중립', greed: '탐욕' } as const;
const MONETARY_LABEL = { tight: '긴축', loose: '완화' } as const;

function getPos(angle: number, radiusOffset: number = 0) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: CX + (RX + radiusOffset) * Math.cos(rad),
    y: CY + (RY + radiusOffset) * Math.sin(rad),
  };
}

export function KostolanyEgg({ data }: Props) {
  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: data.color }} />
        <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">
          Kostolany Egg Model
        </h3>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-6">
        {/* SVG 달걀 다이어그램 */}
        <svg width="340" height="330" viewBox="0 0 340 330" className="flex-shrink-0">
          {/* 상/하 영역 배경 반원 */}
          <path
            d={`M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`}
            fill="rgba(16, 185, 129, 0.03)" stroke="none"
          />
          <path
            d={`M ${CX - RX} ${CY} A ${RX} ${RY} 0 0 0 ${CX + RX} ${CY}`}
            fill="rgba(239, 68, 68, 0.03)" stroke="none"
          />

          {/* 달걀 외곽 */}
          <ellipse cx={CX} cy={CY} rx={RX} ry={RY}
            fill="none" stroke="#334155" strokeWidth="1.5" />

          {/* 수평 구분선 (A/B 영역) */}
          <line x1={CX - RX} y1={CY} x2={CX + RX} y2={CY}
            stroke="#1e293b" strokeWidth="1" strokeDasharray="6 4" />

          {/* A/B 영역 라벨 */}
          <text x={CX} y={CY - RY - 14} textAnchor="middle"
            fill="#10b981" fontSize="12" fontFamily="JetBrains Mono, monospace" opacity="0.7">
            ▲ 상승 국면 (A)
          </text>
          <text x={CX} y={CY + RY + 22} textAnchor="middle"
            fill="#ef4444" fontSize="12" fontFamily="JetBrains Mono, monospace" opacity="0.7">
            ▼ 하락 국면 (B)
          </text>

          {/* 방향 화살표 (시계방향 점선) */}
          <path
            d={`M ${CX} ${CY - RY + 8} A ${RX - 8} ${RY - 8} 0 1 1 ${CX - 1} ${CY - RY + 8}`}
            fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="4 4"
            markerEnd="url(#kostolany-arrow)"
          />
          <defs>
            <marker id="kostolany-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <polygon points="0 0, 8 4, 0 8" fill="#475569" />
            </marker>
          </defs>

          {/* 6개 Phase 도트 + 라벨 */}
          {PHASES.map((phase) => {
            const dot = getPos(phase.angle, -4);
            const lbl = getPos(phase.angle, 30);
            const isActive = phase.id === data.phase;
            const phaseColor = isActive ? data.color : '#475569';
            const dotR = isActive ? 10 : 5;

            return (
              <g key={phase.id}>
                {/* 도트 */}
                <circle cx={dot.x} cy={dot.y} r={dotR}
                  fill={isActive ? phaseColor : '#1e293b'}
                  stroke={phaseColor}
                  strokeWidth={isActive ? 2 : 1}
                  opacity={isActive ? 1 : 0.6}
                />
                {isActive && (
                  <circle cx={dot.x} cy={dot.y} r={dotR + 5}
                    fill="none" stroke={phaseColor} strokeWidth={1} opacity={0.4}>
                    <animate attributeName="r" from={String(dotR + 3)} to={String(dotR + 14)} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* Phase ID */}
                <text x={lbl.x} y={lbl.y - 6} textAnchor="middle" dominantBaseline="middle"
                  fill={isActive ? phaseColor : '#64748b'}
                  fontSize={isActive ? 14 : 12}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight={isActive ? 'bold' : 'normal'}>
                  {phase.id}
                </text>
                {/* Phase 한글명 */}
                <text x={lbl.x} y={lbl.y + 10} textAnchor="middle" dominantBaseline="middle"
                  fill={isActive ? phaseColor : '#64748b'}
                  fontSize={isActive ? 13 : 11}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight={isActive ? 'bold' : 'normal'}>
                  {phase.label}
                </text>
              </g>
            );
          })}

          {/* 중앙 텍스트 */}
          <text x={CX} y={CY - 8} textAnchor="middle" fill="#475569" fontSize="12" fontFamily="JetBrains Mono, monospace">
            Kostolany
          </text>
          <text x={CX} y={CY + 8} textAnchor="middle" fill="#475569" fontSize="12" fontFamily="JetBrains Mono, monospace">
            Egg
          </text>
        </svg>

        {/* 우측 정보 패널 */}
        <div className="flex-1 space-y-3 min-w-0">
          {/* 현재 Phase */}
          <div className="bg-[#0a0e17] rounded-lg p-4 border border-slate-700/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl font-mono font-bold" style={{ color: data.color }}>
                {data.phase}
              </span>
              <span className="text-lg font-mono font-bold" style={{ color: data.color }}>
                {data.name}
              </span>
            </div>
            <p className="text-sm font-mono text-slate-400 leading-relaxed">
              {data.desc}
            </p>
            <div className="mt-3 inline-block px-3 py-1 rounded text-sm font-mono border"
              style={{
                color: data.color,
                borderColor: data.color + '40',
                backgroundColor: data.color + '15',
              }}>
              {data.action}
            </div>
          </div>

          {/* 판정 근거 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
              <div className="text-xs font-mono text-slate-500 uppercase mb-1">금리 수준</div>
              <div className="text-base font-mono text-slate-200 font-bold">
                {MONETARY_LABEL[data.inputs.monetary]}
              </div>
              <div className="text-xs font-mono text-slate-500 mt-1">
                FFR: {data.inputs.fed_rate ?? 'N/A'}%
              </div>
            </div>
            <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
              <div className="text-xs font-mono text-slate-500 uppercase mb-1">시장 심리</div>
              <div className="text-base font-mono text-slate-200 font-bold">
                {SENTIMENT_LABEL[data.inputs.sentiment]}
              </div>
              <div className="text-xs font-mono text-slate-500 mt-1">
                VIX: {data.inputs.vix ?? 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
