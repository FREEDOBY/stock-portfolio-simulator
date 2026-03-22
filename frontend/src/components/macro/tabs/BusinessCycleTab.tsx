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

  // CLI + MoM% (듀얼 Y축)
  const cliData = data['USALOLITOAASTSAM']?.data || [];
  const cliWithMom = cliData.map((d, i) => ({
    date: d.date.substring(0, 7),
    CLI: d.value,
    'MoM%': i > 0 ? ((d.value - cliData[i - 1].value) / cliData[i - 1].value) * 100 : 0,
  }));

  // PMI + 신규주문 + 재고
  const pmiDates = data['IPMAN']?.data?.map((d) => d.date.substring(0, 7)) || [];
  const ismData = pmiDates.map((date, i) => ({
    date,
    PMI: data['IPMAN']?.data?.[i]?.value,
    '신규주문': data['DGORDER']?.data?.[i]?.value,
    '재고': data['AMTMNO']?.data?.[i]?.value,
  }));

  // 키친사이클 Phase 추론
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
        <TabChartSection
          title="OECD CLI (미국) + MoM%"
          description={"OECD 경기선행지수 (Composite Leading Indicator)\n• 100 이상: 경기 확장기\n• 100 이하: 경기 수축기\n• MoM%: 월간 변화율로 방향성 판단\n• MoM% 가속도(변화의 변화)로 전환점 포착"}
        >
          <MacroLineChart
            data={cliWithMom}
            series={[
              { dataKey: 'CLI', color: '#06b6d4', name: 'CLI', yAxisId: 'left' },
              { dataKey: 'MoM%', color: '#f97316', name: 'MoM%', strokeDasharray: '4 4', yAxisId: 'right' },
            ]}
            yDomain={[94, 106]}
            referenceLines={[
              { y: 100, color: '#475569', label: '100', yAxisId: 'left' },
              { y: 0, color: '#475569', label: '0%', yAxisId: 'right' },
            ]}
            rightYAxisFormatter={(v) => `${v.toFixed(1)}%`}
          />
        </TabChartSection>

        {/* 키친사이클 다이어그램 */}
        <TabChartSection
          title="Kitchen Cycle Phase"
          description={"키친사이클: 약 40개월 주기의 재고 순환\n• Phase 1: 수동적 재고축소 (상승 초기) → 매수\n• Phase 2: 적극적 재고확충 (상승 중기) → 보유\n• Phase 3: 수동적 재고축적 (하락 초기) → 매도\n• Phase 4: 적극적 재고감축 (하락 후기) → 대기\nPMI 트렌드 + 재고/출하비율 트렌드로 판별"}
        >
          <CycleDiagram currentPhase={kitchenPhase || 1} />
        </TabChartSection>
      </div>

      {/* 산업생산지수 */}
      <TabChartSection
        title="산업생산지수 (IPMAN, 2017=100)"
        description={"산업생산 제조업지수 (Industrial Production: Manufacturing)\n• 2017년=100 기준 지수\n• 100 이상: 2017년 대비 생산 증가\n• 3개월 이동평균 방향으로 PMI 트렌드 판별\n• 상승 추세 → 경기 확장, 하락 추세 → 경기 수축"}
      >
        <MacroLineChart
          data={ismData}
          series={[
            { dataKey: 'PMI', color: '#10b981', name: '산업생산지수' },
          ]}
          yDomain={[85, 115]}
          referenceLines={[{ y: 100, color: '#475569', label: '100' }]}
        />
      </TabChartSection>

      {/* 내구재 + 제조업 신규주문 */}
      <TabChartSection
        title="내구재 신규주문 + 제조업 신규주문"
        description={"내구재 신규주문 (DGORDER): 3년 이상 사용 가능한 제품 주문\n• 설비투자 선행지표, 기업 신뢰도 반영\n\n제조업 신규주문 (AMTMNO): 전체 제조업 주문\n• 경기 전반의 수요 강도 측정\n• 두 지표 동반 상승 → 경기 확장 신호"}
      >
        <MacroLineChart
          data={ismData}
          series={[
            { dataKey: '신규주문', color: '#3b82f6', name: '내구재 신규주문', yAxisId: 'left' },
            { dataKey: '재고', color: '#f59e0b', name: '제조업 신규주문', yAxisId: 'right' },
          ]}
          yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}B`}
          rightYAxisFormatter={(v) => `${(v / 1000).toFixed(0)}B`}
        />
      </TabChartSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 재고/출하 비율 */}
        <TabChartSection
          title="Inventory/Sales Ratio"
          description={"총사업 재고/출하 비율 (ISRATIO)\n• 재고 ÷ 출하 = 재고가 몇 개월치인지\n• 상승: 재고 쌓임 (수요 < 공급) → 경기 둔화\n• 하락: 재고 소진 (수요 > 공급) → 경기 회복\n• 3개월 이동평균 방향으로 트렌드 판별\n• 키친사이클 Phase 판별의 핵심 입력"}
        >
          <MacroLineChart
            data={toChartData('ISRATIO')}
            series={[{ dataKey: 'ISRATIO', color: '#a78bfa', name: 'IS Ratio', type: 'area' }]}
          />
        </TabChartSection>

        {/* 장단기 금리차 */}
        <TabChartSection
          title="10Y-2Y Treasury Spread"
          description={"장단기 금리차 (10년물 - 2년물)\n• 양수: 정상 수익률 곡선 (경기 확장 기대)\n• 음수 (역전): 경기 침체 선행 신호\n• 역전 후 다시 양수 전환 시 → 침체 임박\n• 역사적으로 모든 미국 경기침체 전 역전 발생"}
        >
          <MacroLineChart
            data={toChartData('T10Y2Y')}
            series={[{ dataKey: 'T10Y2Y', color: '#ec4899', name: '10Y-2Y' }]}
            referenceLines={[{ y: 0, color: '#ef4444', label: '0%' }]}
            yAxisFormatter={(v) => `${v.toFixed(1)}%`}
          />
        </TabChartSection>
      </div>
    </div>
  );
}
