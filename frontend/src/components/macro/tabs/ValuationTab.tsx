/** 탭 5: 밸류에이션 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { TabChartSection } from './TabChartSection';
import type { CrisisOverlay, SignalMarker } from '../charts/crisisOverlayConfig';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
  crisisOverlays?: CrisisOverlay[];
  signalMarkers?: SignalMarker[];
}

export function ValuationTab({ data, crisisOverlays = [] }: Props) {
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

  // 버핏 지표 (NCBCEL: 백만달러, GDP: 십억달러 → NCBCEL/1000으로 단위 통일)
  const wilshireRaw = data['NCBCEL']?.data || [];
  const gdpRaw = data['GDP']?.data || [];
  const buffettData = wilshireRaw.map((d, i) => {
    const gdpVal = gdpRaw[i]?.value;
    return {
      date: d.date.substring(0, 7),
      'Buffett%': gdpVal && gdpVal > 0 ? ((d.value / 1000) / gdpVal) * 100 : null,
    };
  }).filter((d) => d['Buffett%'] !== null);

  return (
    <div className="space-y-4">
      {/* CPI + Core PCE */}
      <TabChartSection
        title="CPI YoY% + Core PCE YoY%"
        description={"CPI (소비자물가지수): 전체 소비자 물가 변동\nCore PCE (개인소비지출): 연준이 선호하는 인플레 지표 (식품·에너지 제외)\n• 2% 이하: 인플레 안정 → 금리 인하 가능\n• 2~3%: 적정 범위\n• 3% 이상: 인플레 압력 → 금리 인상 압력\n• CPI와 PCE 괴리 확대 시 → 연준 정책 혼란"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
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
      <TabChartSection
        title="Buffett Indicator (Market Cap / GDP %)"
        description={"버핏지표: 전체 주식 시가총액 ÷ GDP\n• 100% 이하: 저평가 → 매수 적기\n• 100~130%: 적정 가치\n• 130~160%: 고평가 → 주의\n• 160% 이상: 극심한 고평가 → 버블 경고\n• 워런 버핏이 '단일 최고의 밸류에이션 지표'로 언급"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
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
