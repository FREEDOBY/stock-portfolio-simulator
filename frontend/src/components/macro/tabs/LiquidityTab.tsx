/** 탭 2: 유동성 & 금리 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { TabChartSection } from './TabChartSection';
import { addYoY, YOY_SERIES, YOY_ZERO_LINE, yoyFormatter } from './chartUtils';
import type { CrisisOverlay, SignalMarker } from '../charts/crisisOverlayConfig';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
  crisisOverlays?: CrisisOverlay[];
  signalMarkers?: SignalMarker[];
}

export function LiquidityTab({ data, crisisOverlays = [] }: Props) {
  const toChartData = (seriesId: string) => {
    const raw = data[seriesId]?.data || [];
    const byMonth = new Map<string, number>();
    raw.forEach((d) => byMonth.set(d.date.substring(0, 7), d.value));
    return Array.from(byMonth, ([date, value]) => ({ date, [seriesId]: value }));
  };

  // 10Y vs 2Y 합치기 (일별 → 월별 마지막 값)
  const dgs10 = data['DGS10']?.data || [];
  const dgs2 = data['DGS2']?.data || [];
  const dgs2Map = new Map<string, number>();
  dgs2.forEach((d) => dgs2Map.set(d.date.substring(0, 7), d.value));
  const yieldByMonth = new Map<string, { '10Y': number; '2Y': number | undefined }>();
  dgs10.forEach((d) => {
    const month = d.date.substring(0, 7);
    yieldByMonth.set(month, { '10Y': d.value, '2Y': dgs2Map.get(month) });
  });
  const yieldData = Array.from(yieldByMonth, ([date, vals]) => ({ date, ...vals }));

  // M2 + YoY% 계산
  const m2Raw = data['M2SL']?.data || [];
  const m2Data = m2Raw.map((d, i) => ({
    date: d.date.substring(0, 7),
    M2: d.value,
    'YoY%': i >= 12 ? ((d.value - m2Raw[i - 12].value) / m2Raw[i - 12].value) * 100 : null,
  }));

  // 유동성 국면: M2 증감률(YoY%) + 나스닥 오버레이 (자산 vs 유동성)
  const nasdaqRaw = data['NASDAQ']?.data || [];
  const nasdaqByMonth = new Map<string, number>();
  nasdaqRaw.forEach((d) => nasdaqByMonth.set(d.date.substring(0, 7), d.value));
  const m2RegimeData = m2Raw.map((d, i) => ({
    date: d.date.substring(0, 7),
    'M2 증감률%': i >= 12 ? ((d.value - m2Raw[i - 12].value) / m2Raw[i - 12].value) * 100 : null,
    NASDAQ: nasdaqByMonth.get(d.date.substring(0, 7)) ?? null,
  }));
  const latestM2Yoy = [...m2RegimeData].reverse().find((d) => d['M2 증감률%'] !== null)?.['M2 증감률%'] ?? null;

  return (
    <div className="space-y-4">
        {/* Fed 기준금리 */}
        <TabChartSection
          title="Federal Funds Rate"
          description={"연방기금금리 (Fed Funds Rate)\n• 연준이 설정하는 단기 기준금리\n• 인상: 유동성 긴축, 주식 약세 압력\n• 인하: 유동성 확장, 주식 강세 지원\n• 금리 동결 기간이 길면 → 방향 전환 임박"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={toChartData('FEDFUNDS')}
            series={[{ dataKey: 'FEDFUNDS', color: '#ef4444', name: 'Fed Rate' }]}
            yAxisFormatter={(v) => `${v}%`}
          />
        </TabChartSection>

        {/* 10Y vs 2Y */}
        <TabChartSection
          title="10Y vs 2Y Treasury Yield"
          description={"국채 10년물 vs 2년물 금리\n• 10Y: 장기 경제 성장 기대 반영\n• 2Y: 단기 통화정책 기대 반영\n• 10Y > 2Y (정상): 경기 확장 기대\n• 10Y < 2Y (역전): 경기 침체 선행 신호\n• 스프레드 확대 → 경기 회복 신호"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={yieldData}
            series={[
              { dataKey: '10Y', color: '#10b981', name: '10Y' },
              { dataKey: '2Y', color: '#f97316', name: '2Y' },
            ]}
            yAxisFormatter={(v) => `${v}%`}
          />
        </TabChartSection>

      {/* M2 + YoY% */}
      <TabChartSection
        title="M2 Money Supply + YoY%"
        description={"M2 통화량: 현금 + 요구불예금 + 저축성예금 + MMF 등\n• YoY% 양수: 유동성 확장 → 자산가격 상승 지원\n• YoY% 음수: 유동성 수축 → 자산가격 하락 압력\n• 역사적으로 M2 급증 후 12~18개월 뒤 인플레이션\n• 코로나 시기 M2 40% 급증 → 2022 인플레이션"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={m2Data}
          series={[
            { dataKey: 'M2', color: '#3b82f6', name: 'M2 ($B)', type: 'area', yAxisId: 'left' },
            { dataKey: 'YoY%', color: '#f59e0b', name: 'YoY%', yAxisId: 'right' },
          ]}
          yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}T`}
          rightYAxisFormatter={(v) => `${v.toFixed(1)}%`}
          referenceLines={[{ y: 0, color: '#475569', label: '0%', yAxisId: 'right' }]}
          height={280}
        />
      </TabChartSection>

      {/* 유동성 국면: M2 증감률 + 나스닥 오버레이 */}
      {nasdaqRaw.length > 0 && (
        <TabChartSection
          title={`유동성 국면 · M2 증감률 vs NASDAQ${latestM2Yoy !== null ? ` (최근 ${latestM2Yoy > 0 ? '+' : ''}${latestM2Yoy.toFixed(1)}%)` : ''}`}
          description={"M2 증감률(YoY) + 나스닥 오버레이 — 유동성이 자산가격을 이끄는지 확인\n• M2 증감률 0% 아래(빨간선) = 유동성 수축 → 위험자산 바닥/스트레스\n• 음수→플러스 전환 = 유동성 저점 = 위험자산 바닥 신호\n• 2015·2018·2022 유동성 수축 구간이 시장 스트레스와 동행"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={m2RegimeData}
            series={[
              { dataKey: 'M2 증감률%', color: '#10b981', name: 'M2 증감률%', type: 'area', yAxisId: 'left' },
              { dataKey: 'NASDAQ', color: '#06b6d4', name: 'NASDAQ', yAxisId: 'right' },
            ]}
            yAxisFormatter={(v) => `${v.toFixed(0)}%`}
            rightYAxisFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            referenceLines={[{ y: 0, color: '#ef4444', label: '수축', yAxisId: 'left' }]}
            height={280}
          />
        </TabChartSection>
      )}

        {/* 연준 대차대조표 */}
        <TabChartSection
          title="Fed Balance Sheet"
          description={"연준 총자산 (WALCL)\n• QE(양적완화): 자산 매입 → 총자산 증가 → 유동성 공급\n• QT(양적긴축): 자산 축소 → 총자산 감소 → 유동성 회수\n• 자산 증가 속도가 빠를수록 시장 유동성 풍부\n• 2020~2022 QE: $4T → $9T 급증"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={addYoY(toChartData('WALCL'), 'WALCL')}
            series={[{ dataKey: 'WALCL', color: '#06b6d4', name: 'Total Assets', type: 'area' }, YOY_SERIES]}
            rightYAxisFormatter={yoyFormatter}
            referenceLines={[YOY_ZERO_LINE]}
          />
        </TabChartSection>

        {/* 역레포 */}
        <TabChartSection
          title="Reverse Repo (ON RRP)"
          description={"역레포 잔고 (Overnight Reverse Repo)\n• 금융기관이 연준에 예치한 초과 유동성\n• 잔고 감소: 시장으로 유동성 유입 → 강세\n• 잔고 증가: 시장에서 유동성 회수 → 약세\n• 0에 가까워지면 → 유동성 버퍼 소진 경고"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={toChartData('RRPONTSYD')}
            series={[{ dataKey: 'RRPONTSYD', color: '#a78bfa', name: 'RRP' }]}
          />
        </TabChartSection>

        {/* 달러 인덱스 */}
        <TabChartSection
          title="Dollar Index (DXY)"
          description={"달러 인덱스: 주요 6개국 통화 대비 달러 가치\n• 상승: 달러 강세 → 신흥국/원자재 약세, 미국 수출 부담\n• 하락: 달러 약세 → 위험자산 강세, 글로벌 유동성 확대\n• 100 이상: 달러 강세 구간\n• 나스닥과 역상관 경향 (달러↑ = 나스닥↓)"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={addYoY(toChartData('DXY'), 'DXY')}
            series={[{ dataKey: 'DXY', color: '#06b6d4', name: 'DXY' }, YOY_SERIES]}
            rightYAxisFormatter={yoyFormatter}
            referenceLines={[YOY_ZERO_LINE]}
          />
        </TabChartSection>

      {/* 은행 대출 기준 강화 */}
      <TabChartSection
        title="Bank Lending Standards (SLOOS)"
        description={"은행 대출기준 강화 비율 (Senior Loan Officer Survey)\n• 양수: 대출 기준 강화 중 (신용 수축)\n• 음수: 대출 기준 완화 중 (신용 확장)\n• 40% 이상: 경기침체 6~12개월 전 신호\n• 2001, 2008 침체 전 9개월 선행 감지\n• 은행이 돈줄을 조이면 → 기업 투자 위축 → 경기 둔화"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={toChartData('DRTSCILM')}
          series={[{ dataKey: 'DRTSCILM', color: '#ef4444', name: 'Tightening %' }]}
          yAxisFormatter={(v) => `${v}%`}
          referenceLines={[
            { y: 0, color: '#475569', label: '0%' },
            { y: 40, color: '#ef4444', label: '40%' },
          ]}
        />
      </TabChartSection>

      {/* 기업부채 */}
      <TabChartSection
        title="Nonfinancial Corporate Debt"
        description={"비금융기업 부채 총액 (BCNSDODNS)\n• 기업의 레버리지 수준 측정\n• 급증: 과잉 투자 + 부채 의존 → 금리 인상 시 위험\n• AI 인프라 과잉투자 시 이 지표가 급등\n• 2008년 전 급증 → 금융위기 촉발\n• GDP 대비 비율로 봐야 정확"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={addYoY(toChartData('BCNSDODNS'), 'BCNSDODNS')}
          series={[{ dataKey: 'BCNSDODNS', color: '#f43f5e', name: 'Corp Debt', type: 'area' }, YOY_SERIES]}
          rightYAxisFormatter={yoyFormatter}
          referenceLines={[YOY_ZERO_LINE]}
        />
      </TabChartSection>
    </div>
  );
}
