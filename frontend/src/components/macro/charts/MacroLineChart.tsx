import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, ReferenceArea, Scatter,
} from 'recharts';
import type { CrisisOverlay, SignalMarker } from './crisisOverlayConfig';
import { OVERLAY_COLORS, MARKER_COLORS } from './crisisOverlayConfig';

interface SeriesConfig {
  dataKey: string;
  color: string;
  name: string;
  type?: 'line' | 'area' | 'bar';
  strokeDasharray?: string;
  yAxisId?: 'left' | 'right';
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
  yDomain?: [number | 'auto', number | 'auto'];
  rightYDomain?: [number | 'auto', number | 'auto'];
  /** 경제위기 오버레이 구간 */
  crisisOverlays?: CrisisOverlay[];
  /** 시그널 발동 마커 */
  signalMarkers?: SignalMarker[];
}

/** 시그널 마커용 커스텀 도트 */
function SignalDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props as { cx: number; cy: number; payload: Record<string, unknown> };
  if (!payload?._markerType) return null;

  const isBuy = payload._markerType === 'buy';
  const color = isBuy ? MARKER_COLORS.buy : MARKER_COLORS.sell;
  const size = 5;

  return (
    <g>
      {isBuy ? (
        // 위쪽 삼각형 (매수)
        <polygon
          points={`${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
        />
      ) : (
        // 아래쪽 삼각형 (매도)
        <polygon
          points={`${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`}
          fill={color}
          stroke={color}
          strokeWidth={1}
        />
      )}
    </g>
  );
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
  crisisOverlays = [],
  signalMarkers = [],
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-600 font-mono">
        No data available
      </div>
    );
  }

  const hasRightAxis = series.some((s) => s.yAxisId === 'right');
  const rightAxisColor = series.find((s) => s.yAxisId === 'right')?.color || '#64748b';
  const leftAxisColor = series.find((s) => !s.yAxisId || s.yAxisId === 'left')?.color || '#64748b';

  // 차트 데이터의 날짜 범위
  const dates = data.map((d) => String(d.date));
  const chartStart = dates[0] || '';
  const chartEnd = dates[dates.length - 1] || '';

  // 시그널 마커를 차트 데이터에 머지
  const markerMap = new Map<string, SignalMarker>();
  signalMarkers.forEach((m) => {
    const dateKey = m.date.substring(0, 7); // YYYY-MM 매칭
    markerMap.set(dateKey, m);
  });

  const enrichedData = data.map((d) => {
    const dateStr = String(d.date);
    const marker = markerMap.get(dateStr) || markerMap.get(dateStr.substring(0, 7));
    if (marker) {
      return {
        ...d,
        _markerValue: d[series[0]?.dataKey] ?? 0,
        _markerType: marker.type,
        _markerReason: marker.reason,
      };
    }
    return d;
  });

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={enrichedData} margin={{ top: 5, right: hasRightAxis ? 10 : 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}
            stroke="#1e293b"
            interval="preserveStartEnd"
            minTickGap={40}
            tickFormatter={(v: string) => {
              if (!v) return '';
              // YYYY-MM-DD → YYYY-MM, YYYY-MM → YY.MM
              const parts = v.substring(0, 7).split('-');
              return parts.length >= 2 ? `${parts[0].slice(2)}.${parts[1]}` : v;
            }}
          />

          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: leftAxisColor, fontFamily: 'JetBrains Mono, monospace' }}
            stroke="#1e293b"
            width={55}
            tickFormatter={yAxisFormatter}
            domain={yDomain}
            allowDataOverflow={!!yDomain}
          />

          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: rightAxisColor, fontFamily: 'JetBrains Mono, monospace' }}
              stroke="#1e293b"
              width={50}
              tickFormatter={rightYAxisFormatter}
              domain={rightYDomain}
              allowDataOverflow={!!rightYDomain}
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

          {/* 경제위기 오버레이 음영 */}
          {crisisOverlays.map((overlay, i) => {
            // 차트 날짜 형식 감지 (YYYY-MM vs YYYY-MM-DD)
            const dateLen = chartStart.length; // 7 or 10
            const overlayStart = overlay.start.substring(0, dateLen);
            const overlayEnd = overlay.end.substring(0, dateLen);

            // 차트 범위와 겹치는 구간만 렌더링
            if (overlayEnd < chartStart || overlayStart > chartEnd) return null;

            // 차트 범위로 클램핑 + 가장 가까운 실제 날짜 찾기
            const targetStart = overlayStart < chartStart ? chartStart : overlayStart;
            const targetEnd = overlayEnd > chartEnd ? chartEnd : overlayEnd;

            // 차트에 실제 존재하는 가장 가까운 날짜 찾기
            const closestStart = dates.find((d) => d >= targetStart) || targetStart;
            const closestEnd = [...dates].reverse().find((d) => d <= targetEnd) || targetEnd;

            const colors = OVERLAY_COLORS[overlay.type];

            return (
              <ReferenceArea
                key={`overlay-${i}`}
                x1={closestStart}
                x2={closestEnd}
                yAxisId="left"
                fill={colors.fill}
                fillOpacity={colors.opacity}
                stroke={colors.stroke}
                strokeOpacity={0.2}
                strokeDasharray="3 3"
                label={{
                  value: overlay.label,
                  position: 'insideTop',
                  fontSize: 9,
                  fill: colors.fill,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            );
          })}

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

          {/* 시그널 발동 마커 */}
          {signalMarkers.length > 0 && (
            <Scatter
              yAxisId="left"
              dataKey="_markerValue"
              shape={<SignalDot />}
              legendType="none"
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
