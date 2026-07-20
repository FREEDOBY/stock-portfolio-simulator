/** 탭 6: 노동시장 & 가계 */
import { MacroLineChart } from '../charts/MacroLineChart';
import { TabChartSection } from './TabChartSection';
import { addYoY, YOY_SERIES, YOY_ZERO_LINE, yoyFormatter } from './chartUtils';
import type { CrisisOverlay, SignalMarker } from '../charts/crisisOverlayConfig';

interface Props {
  data: Record<string, { data: Array<{ date: string; value: number }> }>;
  crisisOverlays?: CrisisOverlay[];
  signalMarkers?: SignalMarker[];
}

export function LaborHouseholdTab({ data, crisisOverlays = [] }: Props) {
  const toChartData = (seriesId: string) => {
    const raw = data[seriesId]?.data || [];
    const byMonth = new Map<string, number>();
    raw.forEach((d) => byMonth.set(d.date.substring(0, 7), d.value));
    return Array.from(byMonth, ([date, value]) => ({ date, [seriesId]: value }));
  };

  return (
    <div className="space-y-4">
      {/* 실업률 + 구인건수 (듀얼 Y축) */}
      <TabChartSection
        title="Unemployment Rate + JOLTS Job Openings"
        description={"실업률 (UNRATE): 전체 노동인구 중 실업자 비율\n• 4% 이하: 완전고용\n• 4~6%: 정상\n• 6% 이상: 고용 악화\n\nJOLTS 구인건수: 미충원 일자리 수\n• 감소: 기업 채용 축소 → 경기 둔화\n• 실업률↑ + 구인↓ = 노동시장 냉각"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={(() => {
            const unrate = data['UNRATE']?.data || [];
            const jolts = data['JTSJOL']?.data || [];
            const joltsMap = new Map(jolts.map((d) => [d.date.substring(0, 7), d.value]));
            return unrate.map((d) => ({
              date: d.date.substring(0, 7),
              'UNRATE': d.value,
              'JOLTS': joltsMap.get(d.date.substring(0, 7)) || null,
            }));
          })()}
          series={[
            { dataKey: 'UNRATE', color: '#ef4444', name: '실업률 (%)', yAxisId: 'left' },
            { dataKey: 'JOLTS', color: '#10b981', name: 'JOLTS 구인 (천)', yAxisId: 'right' },
          ]}
          yAxisFormatter={(v) => `${v}%`}
          rightYAxisFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
          referenceLines={[{ y: 4, color: '#475569', label: '4%', yAxisId: 'left' }]}
          height={280}
        />
      </TabChartSection>

      {/* Sahm Rule */}
      <TabChartSection
        title="Sahm Rule Recession Indicator"
        description={"Sahm Rule: 실업률 3개월 이동평균이 12개월 최저점 대비 +0.5%p 이상 상승 시 발동\n• 0.5 이상: 경기침체 진입 신호 (빨간 기준선)\n• 1970년 이후 모든 침체 100% 감지 (11/11)\n• 2024년 첫 false positive (이민 노동 공급 증가)\n• 선행이 아닌 '조기 확인' 지표 (침체 초기 1~3개월 후)\n• FRED에서 이미 계산된 값 제공 (SAHMREALTIME)"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={toChartData('SAHMREALTIME')}
          series={[{ dataKey: 'SAHMREALTIME', color: '#ef4444', name: 'Sahm Rule', type: 'area' }]}
          referenceLines={[{ y: 0.5, color: '#ef4444', label: '0.5 (Trigger)' }]}
          yDomain={[-0.5, 1.5]}
        />
      </TabChartSection>

        {/* 임시직 고용 */}
        <TabChartSection
          title="Temporary Help Services"
          description={"임시직/파견 고용 (TEMPHELPS)\n• 가장 빠른 고용 선행지표\n• 경기 둔화 시 정규직보다 먼저 감소\n• 감소 추세: 6~12개월 후 전체 고용 악화\n• AI 자동화 영향을 가장 먼저 반영\n• 2007년 말 감소 시작 → 2008 금융위기"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={addYoY(toChartData('TEMPHELPS'), 'TEMPHELPS')}
            series={[{ dataKey: 'TEMPHELPS', color: '#f97316', name: 'Temp Jobs (K)' }, YOY_SERIES]}
            yAxisFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
            rightYAxisFormatter={yoyFormatter}
            yDomain={[2000, 3300]}
            referenceLines={[YOY_ZERO_LINE]}
          />
        </TabChartSection>

        {/* 경제활동참가율 */}
        <TabChartSection
          title="Labor Force Participation Rate"
          description={"경제활동참가율 (CIVPART)\n• 생산가능인구 중 경제활동 참여 비율\n• 하락: 구직포기 증가, AI로 일자리 축소\n• 코로나 후 62~63%로 하락 (코로나 전 63.3%)\n• 장기 하락 추세 → 고령화 + 기술 대체\n• 급락: 대규모 실업 이벤트"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={toChartData('CIVPART')}
            series={[{ dataKey: 'CIVPART', color: '#a78bfa', name: 'Participation %' }]}
            yAxisFormatter={(v) => `${v}%`}
            yDomain={[60, 68]}
          />
        </TabChartSection>

        {/* 가계부채/GDP */}
        <TabChartSection
          title="Household Debt / GDP"
          description={"가계부채/GDP 비율 (HDTGPDUSQ163N)\n• 가계의 부채 부담 측정\n• 80% 이상: 경고\n• 100% 이상: 위험 (2008년 전 수준)\n• 상승 추세: 소비자 레버리지 증가\n• 금리 인상 시 → 이자 부담 급증 → 소비 위축"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={toChartData('HDTGPDUSQ163N')}
            series={[{ dataKey: 'HDTGPDUSQ163N', color: '#ef4444', name: 'HH Debt/GDP %', type: 'area' }]}
            yAxisFormatter={(v) => `${v}%`}
            yDomain={[55, 105]}
            referenceLines={[{ y: 100, color: '#ef4444', label: '100%' }]}
          />
        </TabChartSection>

        {/* 신용카드 연체율 */}
        <TabChartSection
          title="Credit Card Delinquency Rate"
          description={"신용카드 연체율 (DRCCLACBS)\n• 소비자 신용 스트레스 직접 측정\n• 2% 이하: 건전\n• 2~3%: 주의\n• 3% 이상: 소비자 재정 악화\n• 급등: 소비 붕괴 선행 → 경기침체\n• 현재 상승 추세 (AI 고용 감소 영향 가능)"}
        >
          <MacroLineChart crisisOverlays={crisisOverlays}
            data={toChartData('DRCCLACBS')}
            series={[{ dataKey: 'DRCCLACBS', color: '#f43f5e', name: 'CC Delinquency %' }]}
            yAxisFormatter={(v) => `${v.toFixed(1)}%`}
            yDomain={[1, 5]}
          />
        </TabChartSection>

      {/* 개인저축률 */}
      <TabChartSection
        title="Personal Saving Rate"
        description={"개인저축률 (PSAVERT)\n• 가처분소득 대비 저축 비율\n• 5% 이상: 건전한 저축\n• 3% 이하: 소비자 여력 소진 경고\n• 급등 (코로나): 강제 저축 → 이후 보복소비\n• 하락 추세: 물가 상승 + 부채 증가로 저축 여력 감소"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={toChartData('PSAVERT')}
          series={[{ dataKey: 'PSAVERT', color: '#10b981', name: 'Saving Rate %', type: 'area' }]}
          yAxisFormatter={(v) => `${v}%`}
          yDomain={[0, 15]}
          referenceLines={[{ y: 3, color: '#ef4444', label: '3% (Warning)' }]}
        />
      </TabChartSection>
    </div>
  );
}
