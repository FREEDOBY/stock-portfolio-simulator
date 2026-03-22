/** 탭 5: 밸류에이션 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { TabChartSection } from './TabChartSection';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
}

export function ValuationTab({ data }: Props) {
  // CPI + Core PCE 합치기
  const cpiRaw = data['CPIAUCSL']?.data || [];
  const pceRaw = data['PCEPILFE']?.data || [];

  const inflationData = cpiRaw.map((d, i) => {
    const cpiYoY = i >= 12 ? ((d.value - cpiRaw[i - 12].value) / cpiRaw[i - 12].value) * 100 : null;
    const pceYoY = pceRaw[i] && i >= 12 ? ((pceRaw[i].value - pceRaw[i - 12].value) / pceRaw[i - 12].value) * 100 : null;
    return {
      date: d.date.substring(0, 7),
      'CPI YoY%': cpiYoY,
      'Core PCE YoY%': pceYoY,
    };
  }).filter((d) => d['CPI YoY%'] !== null);

  // 버핏 지표
  const wilshireRaw = data['NCBCEL']?.data || [];
  const gdpRaw = data['GDP']?.data || [];
  const buffettData = wilshireRaw.map((d, i) => {
    const gdpVal = gdpRaw[i]?.value;
    return {
      date: d.date.substring(0, 7),
      'Buffett%': gdpVal && gdpVal > 0 ? (d.value / gdpVal) * 100 : null,
    };
  }).filter((d) => d['Buffett%'] !== null);

  return (
    <div className="space-y-4">
      {/* CPI + Core PCE */}
      <TabChartSection title="CPI YoY% + Core PCE YoY%">
        <MacroLineChart
          data={inflationData}
          series={[
            { dataKey: 'CPI YoY%', color: '#ef4444', name: 'CPI YoY%' },
            { dataKey: 'Core PCE YoY%', color: '#f59e0b', name: 'Core PCE YoY%', strokeDasharray: '4 4' },
          ]}
          referenceLines={[{ y: 2, color: '#10b981', label: '2% Target' }]}
          yAxisFormatter={(v) => `${v.toFixed(1)}%`}
          height={280}
        />
      </TabChartSection>

      {/* 버핏 지표 */}
      <TabChartSection title="Buffett Indicator (Market Cap / GDP %)">
        <MacroLineChart
          data={buffettData}
          series={[{ dataKey: 'Buffett%', color: '#06b6d4', name: 'Buffett Indicator' }]}
          referenceLines={[
            { y: 100, color: '#10b981', label: '100%' },
            { y: 130, color: '#f59e0b', label: '130%' },
            { y: 160, color: '#ef4444', label: '160%' },
          ]}
          yAxisFormatter={(v) => `${v.toFixed(0)}%`}
          height={300}
        />
      </TabChartSection>
    </div>
  );
}
