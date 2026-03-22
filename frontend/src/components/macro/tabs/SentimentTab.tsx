/** 탭 4: 시장 심리 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { TabChartSection } from './TabChartSection';
import type { CrisisOverlay, SignalMarker } from '../charts/crisisOverlayConfig';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
  crisisOverlays?: CrisisOverlay[];
  signalMarkers?: SignalMarker[];
}

export function SentimentTab({ data, crisisOverlays = [] }: Props) {
  const toChartData = (seriesId: string) => {
    const raw = data[seriesId]?.data || [];
    const byMonth = new Map<string, number>();
    raw.forEach((d) => byMonth.set(d.date.substring(0, 7), d.value));
    return Array.from(byMonth, ([date, value]) => ({ date, [seriesId]: value }));
  };

  return (
    <div className="space-y-4">
      {/* VIX */}
      <TabChartSection
        title="VIX (Fear Index)"
        description={"VIX 공포지수: S&P 500 옵션의 30일 내재변동성\n• 15 이하: 시장 안정, 낙관 (과도한 낙관은 주의)\n• 20~25: 정상 범위\n• 30 이상: 공포 확산, 변동성 급등\n• 40 이상: 극도의 공포 → 역발상 매수 기회\n• VIX 스파이크 후 급락 → 시장 바닥 신호"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
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
        <TabChartSection
          title="High Yield Spread (ICE BofA)"
          description={"하이일드 채권 스프레드: 고위험 채권과 국채의 금리 차이\n• 3% 이하: 시장 낙관, 위험 선호\n• 4~5%: 경계 구간\n• 5% 이상: 신용 위험 확대, 경기 둔화 신호\n• 급등 시: 금융 스트레스 → 주식 하락 동반\n• 스프레드 축소 → 위험자산 강세 신호"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={toChartData('BAMLH0A0HYM2')}
            series={[{ dataKey: 'BAMLH0A0HYM2', color: '#f97316', name: 'HY Spread' }]}
            yAxisFormatter={(v) => `${v}%`}
          />
        </TabChartSection>

        {/* 신규 실업수당 */}
        <TabChartSection
          title="Initial Jobless Claims"
          description={"신규 실업수당 청구건수 (주간)\n• 고용시장 실시간 체온계\n• 20만 이하: 노동시장 강세\n• 25만~30만: 정상 범위\n• 30만 이상: 고용 둔화 경고\n• 급등 시: 경기 침체 선행 신호\n• Y축 상한 500K (코로나 스파이크 클램핑)"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={toChartData('ICSA')}
            series={[{ dataKey: 'ICSA', color: '#a78bfa', name: 'Claims' }]}
            yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
            yDomain={[0, 500000]}
          />
        </TabChartSection>
      </div>

      {/* 소비자심리지수 */}
      <TabChartSection
        title="Consumer Sentiment (Michigan)"
        description={"미시간대 소비자심리지수 (UMCSENT)\n• 소비자의 경제 전망과 지출 의향 측정\n• 80 이상: 낙관 → 소비 증가 기대\n• 60~80: 보통\n• 60 이하: 비관 → 소비 위축 경고\n• 주식시장 3~6개월 선행 경향\n• 급락 시 경기침체 선행 신호"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={toChartData('UMCSENT')}
          series={[{ dataKey: 'UMCSENT', color: '#06b6d4', name: 'Sentiment' }]}
          referenceLines={[{ y: 60, color: '#ef4444', label: '60' }]}
        />
      </TabChartSection>
    </div>
  );
}
