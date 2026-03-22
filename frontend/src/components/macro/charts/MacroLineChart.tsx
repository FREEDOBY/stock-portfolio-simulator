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
}

interface Props {
  data: Array<Record<string, unknown>>;
  series: SeriesConfig[];
  height?: number;
  referenceLines?: Array<{ y: number; color: string; label?: string }>;
  yAxisFormatter?: (v: number) => string;
}

export function MacroLineChart({
  data,
  series,
  height = 250,
  referenceLines = [],
  yAxisFormatter,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-slate-600 font-mono">
        No data available
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
            stroke="#1e293b"
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
            stroke="#1e293b"
            width={55}
            tickFormatter={yAxisFormatter}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1f2e',
              border: '1px solid rgba(100,116,139,0.3)',
              borderRadius: '4px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '11px',
              color: '#e2e8f0',
            }}
          />
          <Legend wrapperStyle={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }} />

          {referenceLines.map((ref, i) => (
            <ReferenceLine
              key={i}
              y={ref.y}
              stroke={ref.color}
              strokeDasharray="3 3"
              strokeWidth={1}
              label={ref.label ? { value: ref.label, position: 'right', fontSize: 9, fill: ref.color } : undefined}
            />
          ))}

          {series.map((s) =>
            s.type === 'area' ? (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                fill={s.color + '20'}
                stroke={s.color}
                strokeWidth={1.5}
                name={s.name}
              />
            ) : s.type === 'bar' ? (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                fill={s.color}
                opacity={0.7}
                name={s.name}
              />
            ) : (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                name={s.name}
                strokeDasharray={s.strokeDasharray}
              />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
