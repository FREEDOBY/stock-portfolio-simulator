/** 탭 1: 경기 사이클 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { CycleDiagram } from '../charts/CycleDiagram';
import { TabChartSection } from './TabChartSection';
import { addYoY, YOY_SERIES, YOY_ZERO_LINE, yoyFormatter } from './chartUtils';
import type { CrisisOverlay, SignalMarker } from '../charts/crisisOverlayConfig';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
  crisisOverlays?: CrisisOverlay[];
  signalMarkers?: SignalMarker[];
}

export function BusinessCycleTab({ data, crisisOverlays = [] }: Props) {
  const toChartData = (seriesId: string) => {
    const raw = data[seriesId]?.data || [];
    // 일별 데이터 → 월별 마지막 값만 (중복 제거)
    const byMonth = new Map<string, number>();
    raw.forEach((d) => byMonth.set(d.date.substring(0, 7), d.value));
    return Array.from(byMonth, ([date, value]) => ({ date, [seriesId]: value }));
  };

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

  // 키친사이클 Phase: IPMAN(수요) × ISRATIO(재고) 핵심 2지표
  let kitchenPhase = 0;

  const calcTrend = (seriesData: Array<{ date: string; value: number }> | undefined): number => {
    if (!seriesData || seriesData.length < 6) return 0;
    const recent = seriesData.slice(-6);
    const maCurrent = (recent[5].value + recent[4].value + recent[3].value) / 3;
    const maPast = (recent[2].value + recent[1].value + recent[0].value) / 3;
    return maCurrent > maPast ? 1 : -1;
  };

  const pmiRising = calcTrend(data['IPMAN']?.data) > 0;
  const invRising = calcTrend(data['ISRATIO']?.data) > 0;

  if (pmiRising && !invRising) kitchenPhase = 1;
  else if (pmiRising && invRising) kitchenPhase = 2;
  else if (!pmiRising && invRising) kitchenPhase = 3;
  else if (!pmiRising && !invRising) kitchenPhase = 4;

  return (
    <div className="space-y-4">
        {/* OECD CLI + MoM% */}
        <TabChartSection
          title="OECD CLI (미국) + MoM%"
          description={"OECD 경기선행지수 (Composite Leading Indicator)\n• 100 이상: 경기 확장기\n• 100 이하: 경기 수축기\n• MoM%: 월간 변화율로 방향성 판단\n• MoM% 가속도(변화의 변화)로 전환점 포착"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
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

      {/* 산업생산지수 - 키친사이클 핵심 입력 */}
      <TabChartSection
        title="산업생산지수 (IPMAN, 2012=100)"
        description={"산업생산 제조업지수 (Industrial Production: Manufacturing)\n• 2012년=100 기준 지수\n• 키친사이클 Phase 판별의 핵심 입력\n• 3개월 이동평균의 중기 방향(3개월 전 대비)으로 트렌드 판별\n• 상승 추세 → 경기 확장, 하락 추세 → 경기 수축\n• 급락: 경기침체 동행 지표"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={addYoY(ismData, 'PMI')}
          series={[
            { dataKey: 'PMI', color: '#10b981', name: '산업생산지수' },
            YOY_SERIES,
          ]}
          yDomain={[70, 115]}
          rightYAxisFormatter={yoyFormatter}
          referenceLines={[{ y: 100, color: '#475569', label: '100 (2012)' }, YOY_ZERO_LINE]}
        />
      </TabChartSection>

      {/* 내구재 + 제조업 신규주문 */}
      <TabChartSection
        title="내구재 신규주문 + 제조업 신규주문"
        description={"내구재 신규주문 (DGORDER): 3년 이상 사용 가능한 제품 주문\n• 설비투자 선행지표, 기업 신뢰도 반영\n\n제조업 신규주문 (AMTMNO): 전체 제조업 주문\n• 경기 전반의 수요 강도 측정\n• 두 지표 동반 상승 → 경기 확장 신호"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={ismData}
          series={[
            { dataKey: '신규주문', color: '#3b82f6', name: '내구재 신규주문', yAxisId: 'left' },
            { dataKey: '재고', color: '#f59e0b', name: '제조업 신규주문', yAxisId: 'right' },
          ]}
          yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}B`}
          rightYAxisFormatter={(v) => `${(v / 1000).toFixed(0)}B`}
        />
      </TabChartSection>

        {/* 제조업 신규주문 (Census) */}
        <TabChartSection
          title="New Orders: Nondefense Capital Goods ex-Aircraft"
          description={"핵심 자본재 신규주문 (NEWORDER)\n• 방산·항공기 제외한 기업 설비투자 주문\n• ISM PMI 신규주문의 실제 데이터 대용\n• 키친사이클 수요 트렌드 판별에 사용\n• 1~2개월 선행\n• 감소 추세 → 기업 투자 축소"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={addYoY(toChartData('NEWORDER'), 'NEWORDER')}
            series={[{ dataKey: 'NEWORDER', color: '#3b82f6', name: 'New Orders ($B)' }, YOY_SERIES]}
            yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}B`}
            rightYAxisFormatter={yoyFormatter}
            yDomain={[50000, 85000]}
            referenceLines={[YOY_ZERO_LINE]}
          />
        </TabChartSection>

        {/* 건축허가건수 */}
        <TabChartSection
          title="Building Permits"
          description={"건축허가건수 (PERMIT)\n• 주택경기 선행지표 (6개월 선행)\n• 금리 인상 시 급감 → 경기 둔화 선행\n• 2006년 급감 → 2008 금융위기\n• 2022년 급감 → 주택시장 냉각\n• 주택은 GDP의 ~15% 차지"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={addYoY(toChartData('PERMIT'), 'PERMIT')}
            series={[{ dataKey: 'PERMIT', color: '#f97316', name: 'Permits (K)' }, YOY_SERIES]}
            yAxisFormatter={(v) => `${v.toFixed(0)}K`}
            rightYAxisFormatter={yoyFormatter}
            yDomain={[900, 2100]}
            referenceLines={[YOY_ZERO_LINE]}
          />
        </TabChartSection>

        {/* 소비자 내구재 신규주문 */}
        <TabChartSection
          title="Consumer Durable Goods Orders"
          description={"소비자 내구재 신규주문 (ACDGNO)\n• 자동차, 가전 등 소비자 내구재\n• 소비 심리와 직결\n• 3~6개월 선행\n• 감소 → 소비자 지출 위축 신호\n• AI 관련 소비재 수요 트렌드"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={addYoY(toChartData('ACDGNO'), 'ACDGNO')}
            series={[{ dataKey: 'ACDGNO', color: '#a78bfa', name: 'Consumer Durables ($B)' }, YOY_SERIES]}
            yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}B`}
            rightYAxisFormatter={yoyFormatter}
            yDomain={[20000, 55000]}
            referenceLines={[YOY_ZERO_LINE]}
          />
        </TabChartSection>

        {/* 재고/출하 비율 */}
        <TabChartSection
          title="Inventory/Sales Ratio"
          description={"총사업 재고/출하 비율 (ISRATIO)\n• 재고 ÷ 출하 = 재고가 몇 개월치인지\n• 상승: 재고 쌓임 (수요 < 공급) → 경기 둔화\n• 하락: 재고 소진 (수요 > 공급) → 경기 회복\n• 3개월 이동평균 방향으로 트렌드 판별\n• 키친사이클 Phase 판별의 핵심 입력"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={addYoY(toChartData('ISRATIO'), 'ISRATIO')}
            series={[{ dataKey: 'ISRATIO', color: '#a78bfa', name: 'IS Ratio', type: 'area' }, YOY_SERIES]}
            yDomain={[1.2, 1.55]}
            rightYAxisFormatter={yoyFormatter}
            referenceLines={[YOY_ZERO_LINE]}
          />
        </TabChartSection>

        {/* 장단기 금리차 */}
        <TabChartSection
          title="10Y-2Y Treasury Spread"
          description={"장단기 금리차 (10년물 - 2년물)\n• 양수: 정상 수익률 곡선 (경기 확장 기대)\n• 음수 (역전): 경기 침체 선행 신호\n• 역전 후 다시 양수 전환 시 → 침체 임박\n• 역사적으로 모든 미국 경기침체 전 역전 발생"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={toChartData('T10Y2Y')}
            series={[{ dataKey: 'T10Y2Y', color: '#ec4899', name: '10Y-2Y' }]}
            referenceLines={[{ y: 0, color: '#ef4444', label: '0%' }]}
            yAxisFormatter={(v) => `${v.toFixed(1)}%`}
          />
        </TabChartSection>

      {/* 노동생산성 */}
      <TabChartSection
        title="Labor Productivity (OPHNFB)"
        description={"비농업 시간당 산출 (노동생산성)\n• AI/기술 혁신의 생산성 향상 직접 측정\n• 상승: 같은 노동으로 더 많이 생산 → 경제 성장\n• 정체/하락: 생산성 둔화 → 임금 상승 압력\n• AI 시대: 급격한 상승 시 고용 감소 동반 가능"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={addYoY(toChartData('OPHNFB'), 'OPHNFB')}
          series={[{ dataKey: 'OPHNFB', color: '#06b6d4', name: 'Productivity', type: 'area' }, YOY_SERIES]}
          yDomain={[95, 125]}
          rightYAxisFormatter={yoyFormatter}
          referenceLines={[YOY_ZERO_LINE]}
        />
      </TabChartSection>
    </div>
  );
}
