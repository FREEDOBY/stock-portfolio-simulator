/** 탭 2: 유동성 & 금리 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { TabChartSection } from './TabChartSection';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
}

export function LiquidityTab({ data }: Props) {
  const toChartData = (seriesId: string) =>
    data[seriesId]?.data?.map((d) => ({ date: d.date.substring(0, 7), [seriesId]: d.value })) || [];

  // 10Y vs 2Y 합치기
  const dgs10 = data['DGS10']?.data || [];
  const dgs2 = data['DGS2']?.data || [];
  const yieldData = dgs10.map((d, i) => ({
    date: d.date.substring(0, 7),
    '10Y': d.value,
    '2Y': dgs2[i]?.value,
  }));

  // M2 + YoY% 계산
  const m2Raw = data['M2SL']?.data || [];
  const m2Data = m2Raw.map((d, i) => ({
    date: d.date.substring(0, 7),
    M2: d.value,
    'YoY%': i >= 12 ? ((d.value - m2Raw[i - 12].value) / m2Raw[i - 12].value) * 100 : null,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fed 기준금리 */}
        <TabChartSection title="Federal Funds Rate">
          <MacroLineChart
            data={toChartData('FEDFUNDS')}
            series={[{ dataKey: 'FEDFUNDS', color: '#ef4444', name: 'Fed Rate' }]}
            yAxisFormatter={(v) => `${v}%`}
          />
        </TabChartSection>

        {/* 10Y vs 2Y */}
        <TabChartSection title="10Y vs 2Y Treasury Yield">
          <MacroLineChart
            data={yieldData}
            series={[
              { dataKey: '10Y', color: '#10b981', name: '10Y' },
              { dataKey: '2Y', color: '#f97316', name: '2Y' },
            ]}
            yAxisFormatter={(v) => `${v}%`}
          />
        </TabChartSection>
      </div>

      {/* M2 + YoY% */}
      <TabChartSection title="M2 Money Supply + YoY%">
        <MacroLineChart
          data={m2Data}
          series={[
            { dataKey: 'M2', color: '#3b82f6', name: 'M2 ($B)' },
            { dataKey: 'YoY%', color: '#f59e0b', name: 'YoY%', strokeDasharray: '4 4' },
          ]}
          height={280}
        />
      </TabChartSection>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 연준 대차대조표 */}
        <TabChartSection title="Fed Balance Sheet">
          <MacroLineChart
            data={toChartData('WALCL')}
            series={[{ dataKey: 'WALCL', color: '#06b6d4', name: 'Total Assets', type: 'area' }]}
          />
        </TabChartSection>

        {/* 역레포 */}
        <TabChartSection title="Reverse Repo (ON RRP)">
          <MacroLineChart
            data={toChartData('RRPONTSYD')}
            series={[{ dataKey: 'RRPONTSYD', color: '#a78bfa', name: 'RRP' }]}
          />
        </TabChartSection>

        {/* 달러 인덱스 */}
        <TabChartSection title="Dollar Index (DXY)">
          <MacroLineChart
            data={toChartData('DXY')}
            series={[{ dataKey: 'DXY', color: '#f59e0b', name: 'DXY' }]}
          />
        </TabChartSection>
      </div>
    </div>
  );
}
