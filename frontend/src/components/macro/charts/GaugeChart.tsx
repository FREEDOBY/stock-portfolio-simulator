/** 게이지 차트 - 200주선 대비 거리% 등 */

interface Props {
  value: number;
  min?: number;
  max?: number;
  label: string;
  unit?: string;
  thresholds?: Array<{ value: number; color: string; label: string }>;
}

export function GaugeChart({
  value,
  min = -30,
  max = 50,
  label,
  unit = '%',
  thresholds = [
    { value: 0, color: '#ef4444', label: '하회' },
    { value: 10, color: '#f59e0b', label: '근접' },
    { value: 30, color: '#64748b', label: '관심' },
    { value: 50, color: '#10b981', label: '상회' },
  ],
}: Props) {
  const range = max - min;
  const clampedValue = Math.max(min, Math.min(max, value));
  const percentage = ((clampedValue - min) / range) * 100;

  // 색상 결정
  let color = '#64748b';
  for (const t of thresholds) {
    if (value <= t.value) {
      color = t.color;
      break;
    }
  }
  if (value > thresholds[thresholds.length - 1].value) {
    color = thresholds[thresholds.length - 1].color;
  }

  return (
    <div className="bg-[#0d1117] border border-slate-700/30 rounded p-4">
      <p className="text-xs text-slate-500 font-mono uppercase mb-3">{label}</p>

      {/* 값 */}
      <div className="text-center mb-3">
        <span className="text-3xl font-bold font-mono" style={{ color }}>
          {value > 0 ? '+' : ''}{value.toFixed(1)}
        </span>
        <span className="text-sm text-slate-500 font-mono ml-1">{unit}</span>
      </div>

      {/* 바 게이지 */}
      <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>

      {/* 라벨 */}
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-700 font-mono">{min}</span>
        <span className="text-xs text-slate-700 font-mono">{max}</span>
      </div>
    </div>
  );
}
