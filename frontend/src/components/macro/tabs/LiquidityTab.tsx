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
        <TabChartSection
          title="Federal Funds Rate"
          description={"연방기금금리 (Fed Funds Rate)\n• 연준이 설정하는 단기 기준금리\n• 인상: 유동성 긴축, 주식 약세 압력\n• 인하: 유동성 확장, 주식 강세 지원\n• 금리 동결 기간이 길면 → 방향 전환 임박"}
        >
          <MacroLineChart
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
      <TabChartSection
        title="M2 Money Supply + YoY%"
        description={"M2 통화량: 현금 + 요구불예금 + 저축성예금 + MMF 등\n• YoY% 양수: 유동성 확장 → 자산가격 상승 지원\n• YoY% 음수: 유동성 수축 → 자산가격 하락 압력\n• 역사적으로 M2 급증 후 12~18개월 뒤 인플레이션\n• 코로나 시기 M2 40% 급증 → 2022 인플레이션"}
      >
        <MacroLineChart
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 연준 대차대조표 */}
        <TabChartSection
          title="Fed Balance Sheet"
          description={"연준 총자산 (WALCL)\n• QE(양적완화): 자산 매입 → 총자산 증가 → 유동성 공급\n• QT(양적긴축): 자산 축소 → 총자산 감소 → 유동성 회수\n• 자산 증가 속도가 빠를수록 시장 유동성 풍부\n• 2020~2022 QE: $4T → $9T 급증"}
        >
          <MacroLineChart
            data={toChartData('WALCL')}
            series={[{ dataKey: 'WALCL', color: '#06b6d4', name: 'Total Assets', type: 'area' }]}
          />
        </TabChartSection>

        {/* 역레포 */}
        <TabChartSection
          title="Reverse Repo (ON RRP)"
          description={"역레포 잔고 (Overnight Reverse Repo)\n• 금융기관이 연준에 예치한 초과 유동성\n• 잔고 감소: 시장으로 유동성 유입 → 강세\n• 잔고 증가: 시장에서 유동성 회수 → 약세\n• 0에 가까워지면 → 유동성 버퍼 소진 경고"}
        >
          <MacroLineChart
            data={toChartData('RRPONTSYD')}
            series={[{ dataKey: 'RRPONTSYD', color: '#a78bfa', name: 'RRP' }]}
          />
        </TabChartSection>

        {/* 달러 인덱스 */}
        <TabChartSection
          title="Dollar Index (DXY)"
          description={"달러 인덱스: 주요 6개국 통화 대비 달러 가치\n• 상승: 달러 강세 → 신흥국/원자재 약세, 미국 수출 부담\n• 하락: 달러 약세 → 위험자산 강세, 글로벌 유동성 확대\n• 100 이상: 달러 강세 구간\n• 나스닥과 역상관 경향 (달러↑ = 나스닥↓)"}
        >
          <MacroLineChart
            data={toChartData('DXY')}
            series={[{ dataKey: 'DXY', color: '#f59e0b', name: 'DXY' }]}
          />
        </TabChartSection>
      </div>
    </div>
  );
}
