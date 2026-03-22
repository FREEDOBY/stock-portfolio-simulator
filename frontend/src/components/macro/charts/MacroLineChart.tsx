import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

interface SeriesConfig {
  dataKey: string;
  color: string;
  name: string;
  type?: 'line' | 'area' | 'bar';
  strokeDasharray?: string;
  yAxisId?: 'left' | 'right';  // 듀얼 Y축 지원
}

interface ReferenceLineConfig {
  y: number;
  color: string;
  label?: string;
  yAxisId?: 'left' | 'right';
}

interface Props {
  data: Array<Record<string, unknown>>;
  series: SeriesConfig[];
  height?: number;
  referenceLines?: ReferenceLineConfig[];
  yAxisFormatter?: (v: number) => string;
  rightYAxisFormatter?: (v: number) => string;
  yDomain?: [number | 'auto', number | 'auto'];       // 왼쪽 Y축 범위
  rightYDomain?: [number | 'auto', number | 'auto'];   // 오른쪽 Y축 범위
}

export function MacroLineChart({
  data,
  series,
  height = 250,
  referenceLines = [],
  yAxisFormatter,
  rightYAxisFormatter,
  yDomain,
  rightYDomain,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-600 font-mono">
        No data available
      </div>
    );
  }

  const hasRightAxis = series.some((s) => s.yAxisId === 'right');
  // 오른쪽 축 시리즈의 색상을 Y축 라벨에 사용
  const rightAxisColor = series.find((s) => s.yAxisId === 'right')?.color || '#64748b';
  const leftAxisColor = series.find((s) => !s.yAxisId || s.yAxisId === 'left')?.color || '#64748b';

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: hasRightAxis ? 10 : 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
            stroke="#1e293b"
            interval="preserveStartEnd"
          />

          {/* 왼쪽 Y축 */}
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: leftAxisColor, fontFamily: 'JetBrains Mono, monospace' }}
            stroke="#1e293b"
            width={55}
            tickFormatter={yAxisFormatter}
            domain={yDomain}
          />

          {/* 오른쪽 Y축 (듀얼 모드에서만) */}
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: rightAxisColor, fontFamily: 'JetBrains Mono, monospace' }}
              stroke="#1e293b"
              width={50}
              tickFormatter={rightYAxisFormatter}
              domain={rightYDomain}
            />
          )}

          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1f2e',
              border: '1px solid rgba(100,116,139,0.3)',
              borderRadius: '4px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '13px',
              color: '#e2e8f0',
            }}
          />
          <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px' }} />

          {referenceLines.map((ref, i) => (
            <ReferenceLine
              key={i}
              y={ref.y}
              yAxisId={ref.yAxisId || 'left'}
              stroke={ref.color}
              strokeDasharray="3 3"
              strokeWidth={1}
              label={ref.label ? { value: ref.label, position: 'right', fontSize: 11, fill: ref.color } : undefined}
            />
          ))}

          {series.map((s) => {
            const axisId = s.yAxisId || 'left';

            if (s.type === 'area') {
              return (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  yAxisId={axisId}
                  fill={s.color + '20'}
                  stroke={s.color}
                  strokeWidth={1.5}
                  name={s.name}
                />
              );
            }
            if (s.type === 'bar') {
              return (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  yAxisId={axisId}
                  fill={s.color}
                  opacity={0.7}
                  name={s.name}
                />
              );
            }
            return (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                yAxisId={axisId}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                name={s.name}
                strokeDasharray={s.strokeDasharray}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
