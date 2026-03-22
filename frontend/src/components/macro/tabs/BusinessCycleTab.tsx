/** 탭 1: 경기 사이클 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { CycleDiagram } from '../charts/CycleDiagram';
import { TabChartSection } from './TabChartSection';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
}

export function BusinessCycleTab({ data }: Props) {
  const toChartData = (seriesId: string) =>
    data[seriesId]?.data?.map((d) => ({ date: d.date.substring(0, 7), [seriesId]: d.value })) || [];

  // CLI MoM% 계산
  const cliData = data['USALOLITOAASTSAM']?.data || [];
  const cliWithMom = cliData.map((d, i) => ({
    date: d.date.substring(0, 7),
    CLI: d.value,
    'MoM%': i > 0 ? ((d.value - cliData[i - 1].value) / cliData[i - 1].value) * 100 : 0,
  }));

  // PMI + 신규주문 + 재고 합치기
  const pmiDates = data['IPMAN']?.data?.map((d) => d.date.substring(0, 7)) || [];
  const ismData = pmiDates.map((date, i) => ({
    date,
    PMI: data['IPMAN']?.data?.[i]?.value,
    '신규주문': data['DGORDER']?.data?.[i]?.value,
    '재고': data['AMTMNO']?.data?.[i]?.value,
  }));

  // 키친사이클 Phase 추론 (PMI 트렌드 + 재고 트렌드)
  let kitchenPhase = 0;
  if (ismData.length >= 3) {
    const last3Pmi = ismData.slice(-3).map((d) => d.PMI || 0);
    const last3Inv = (data['ISRATIO']?.data || []).slice(-3).map((d) => d.value);
    const pmiRising = last3Pmi[2] > last3Pmi[0];
    const invRising = last3Inv.length >= 3 && last3Inv[2] > last3Inv[0];

    if (pmiRising && !invRising) kitchenPhase = 1;
    else if (pmiRising && invRising) kitchenPhase = 2;
    else if (!pmiRising && invRising) kitchenPhase = 3;
    else if (!pmiRising && !invRising) kitchenPhase = 4;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OECD CLI + MoM% */}
        <TabChartSection title="OECD CLI (미국) + MoM%">
          <MacroLineChart
            data={cliWithMom}
            series={[
              { dataKey: 'CLI', color: '#06b6d4', name: 'CLI' },
              { dataKey: 'MoM%', color: '#f97316', name: 'MoM%', strokeDasharray: '4 4' },
            ]}
            referenceLines={[{ y: 100, color: '#475569', label: '100' }]}
          />
        </TabChartSection>

        {/* 키친사이클 다이어그램 */}
        <TabChartSection title="Kitchen Cycle Phase">
          <CycleDiagram currentPhase={kitchenPhase || 1} />
        </TabChartSection>
      </div>

      {/* ISM PMI + 신규주문 + 재고 */}
      <TabChartSection title="ISM Manufacturing PMI + New Orders + Inventories">
        <MacroLineChart
          data={ismData}
          series={[
            { dataKey: 'PMI', color: '#10b981', name: 'PMI' },
            { dataKey: '신규주문', color: '#3b82f6', name: 'New Orders' },
            { dataKey: '재고', color: '#f59e0b', name: 'Inventories' },
          ]}
          referenceLines={[{ y: 50, color: '#475569', label: '50' }]}
        />
      </TabChartSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 재고/출하 비율 */}
        <TabChartSection title="Inventory/Sales Ratio">
          <MacroLineChart
            data={toChartData('ISRATIO')}
            series={[{ dataKey: 'ISRATIO', color: '#a78bfa', name: 'IS Ratio', type: 'area' }]}
          />
        </TabChartSection>

        {/* 장단기 금리차 */}
        <TabChartSection title="10Y-2Y Treasury Spread">
          <MacroLineChart
            data={toChartData('T10Y2Y')}
            series={[{ dataKey: 'T10Y2Y', color: '#ec4899', name: '10Y-2Y' }]}
            referenceLines={[{ y: 0, color: '#ef4444', label: '0%' }]}
          />
        </TabChartSection>
      </div>
    </div>
  );
}
