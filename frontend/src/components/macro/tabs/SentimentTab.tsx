/** 탭 4: 시장 심리 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { TabChartSection } from './TabChartSection';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
}

export function SentimentTab({ data }: Props) {
  const toChartData = (seriesId: string) =>
    data[seriesId]?.data?.map((d) => ({ date: d.date.substring(0, 7), [seriesId]: d.value })) || [];

  return (
    <div className="space-y-4">
      {/* VIX */}
      <TabChartSection title="VIX (Fear Index)">
        <MacroLineChart
          data={toChartData('VIX')}
          series={[{ dataKey: 'VIX', color: '#ef4444', name: 'VIX', type: 'area' }]}
          referenceLines={[
            { y: 30, color: '#f59e0b', label: '30' },
            { y: 40, color: '#ef4444', label: '40' },
          ]}
        />
      </TabChartSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 하이일드 스프레드 */}
        <TabChartSection title="High Yield Spread (ICE BofA)">
          <MacroLineChart
            data={toChartData('BAMLH0A0HYM2')}
            series={[{ dataKey: 'BAMLH0A0HYM2', color: '#f97316', name: 'HY Spread' }]}
            yAxisFormatter={(v) => `${v}%`}
          />
        </TabChartSection>

        {/* 신규 실업수당 */}
        <TabChartSection title="Initial Jobless Claims">
          <MacroLineChart
            data={toChartData('ICSA')}
            series={[{ dataKey: 'ICSA', color: '#a78bfa', name: 'Claims' }]}
            yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
          />
        </TabChartSection>
      </div>
    </div>
  );
}
