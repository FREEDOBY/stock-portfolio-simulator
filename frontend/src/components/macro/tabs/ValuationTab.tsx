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
  // CPI + 코어 CPI + Core PCE 합치기
  const cpiRaw = data['CPIAUCSL']?.data || [];
  const coreCpiRaw = data['CPILFESL']?.data || [];
  const pceRaw = data['PCEPILFE']?.data || [];

  // 월키('YYYY-MM') 기준 변화율 맵 — 시리즈별 발표 시차·길이 차이에 안전
  const rateMap = (
    raw: Array<{ date: string; value: number }>,
    lagMonths: number,
    annualizeFactor: number,
  ) => {
    const m = new Map<string, number>();
    for (let i = lagMonths; i < raw.length; i++) {
      const prev = raw[i - lagMonths].value;
      if (prev > 0) {
        m.set(
          raw[i].date.substring(0, 7),
          (Math.pow(raw[i].value / prev, annualizeFactor) - 1) * 100,
        );
      }
    }
    return m;
  };
  const mergeByMonth = (seriesMaps: Record<string, Map<string, number>>) => {
    const months = [...new Set(Object.values(seriesMaps).flatMap((m) => [...m.keys()]))].sort();
    return months.map((month) => ({
      date: month,
      ...Object.fromEntries(
        Object.entries(seriesMaps).map(([key, m]) => [key, m.get(month) ?? null]),
      ),
    }));
  };

  const inflationData = mergeByMonth({
    'CPI YoY%': rateMap(cpiRaw, 12, 1),
    'Core CPI YoY%': rateMap(coreCpiRaw, 12, 1),
    'Core PCE YoY%': rateMap(pceRaw, 12, 1),
  });

  // 코어 인플레 모멘텀 (3·6개월 연율) — 최근 5년만 (장기간은 노이즈로 판독 불가)
  const momentumData = mergeByMonth({
    'Core CPI 3m연율%': rateMap(coreCpiRaw, 3, 4),
    'Core CPI 6m연율%': rateMap(coreCpiRaw, 6, 2),
    'Core PCE 3m연율%': rateMap(pceRaw, 3, 4),
    'Core PCE 6m연율%': rateMap(pceRaw, 6, 2),
  }).slice(-60);

  // PPI (생산자물가) vs CPI — 가격 전가·마진 갭 판독
  const ppiRaw = data['PPIFIS']?.data || [];
  const corePpiRaw = data['PPIFES']?.data || [];
  const ppiData = mergeByMonth({
    'PPI YoY%': rateMap(ppiRaw, 12, 1),
    'Core PPI YoY%': rateMap(corePpiRaw, 12, 1),
    'CPI YoY%': rateMap(cpiRaw, 12, 1),
  }).filter((d) => d['PPI YoY%'] !== null || d['Core PPI YoY%'] !== null);

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
      {/* CPI + 코어 CPI + Core PCE */}
      <TabChartSection
        title="CPI + Core CPI + Core PCE (YoY%)"
        description={"CPI (소비자물가지수): 전체 소비자 물가 변동\nCore CPI: 식품·에너지 제외 CPI — 기조적 물가 추세\nCore PCE (개인소비지출): 연준이 선호하는 인플레 지표 (식품·에너지 제외)\n• 2% 이하: 인플레 안정 → 금리 인하 가능\n• 2~3%: 적정 범위\n• 3% 이상: 인플레 압력 → 금리 인상 압력\n• CPI와 PCE 괴리 확대 시 → 연준 정책 혼란"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={inflationData}
          series={[
            { dataKey: 'CPI YoY%', color: '#ef4444', name: 'CPI YoY%' },
            { dataKey: 'Core CPI YoY%', color: '#8b5cf6', name: 'Core CPI YoY%' },
            { dataKey: 'Core PCE YoY%', color: '#f59e0b', name: 'Core PCE YoY%', strokeDasharray: '4 4' },
          ]}
          referenceLines={[{ y: 2, color: '#10b981', label: '2% Target' }]}
          yAxisFormatter={(v) => `${v.toFixed(1)}%`}
          height={280}
        />
      </TabChartSection>

      {/* 코어 인플레 모멘텀 (3·6개월 연율) */}
      <TabChartSection
        title="코어 인플레 모멘텀 — 3·6개월 연율 (최근 5년)"
        description={"YoY는 1년 전 기저효과에 좌우되어 방향 전환을 늦게 보여줌.\n3개월·6개월 연율화는 최근 물가 모멘텀을 선행적으로 포착\n• 3m < 6m < YoY: 인플레 둔화 가속 → 금리 인하 여지\n• 3m > 6m > YoY: 인플레 재가속 → 금리 인상 압력\n• 3m 연율이 2% 근처 안착 시 → 연준 인하 사이클 재개 조건"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={momentumData}
          series={[
            { dataKey: 'Core CPI 3m연율%', color: '#8b5cf6', name: 'Core CPI 3m연율' },
            { dataKey: 'Core CPI 6m연율%', color: '#8b5cf6', name: 'Core CPI 6m연율', strokeDasharray: '4 4' },
            { dataKey: 'Core PCE 3m연율%', color: '#f59e0b', name: 'Core PCE 3m연율' },
            { dataKey: 'Core PCE 6m연율%', color: '#f59e0b', name: 'Core PCE 6m연율', strokeDasharray: '4 4' },
          ]}
          referenceLines={[{ y: 2, color: '#10b981', label: '2% Target' }]}
          yAxisFormatter={(v) => `${v.toFixed(1)}%`}
          height={280}
        />
      </TabChartSection>

      {/* PPI vs CPI */}
      <TabChartSection
        title="PPI (생산자물가) vs CPI (YoY%)"
        description={"PPI (생산자물가지수): 기업이 출고 단계에서 받는 도매 가격 — CPI의 2~6개월 선행지표\nCore PPI: 식품·에너지 제외 — 기조적 원가 압력\n• PPI ↑ + CPI 안정: 인플레 재점화 조기 경고 → 금리 인상 리스크\n• PPI ↓ + CPI 높음: 파이프라인 압력 해소 → 수개월 내 CPI 둔화 기대\n• PPI > CPI 지속: 원가 전가 실패 → 기업 마진 압박 신호\n※ 데이터는 2010년부터 제공 (최종수요 기준 개편)"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={ppiData}
          series={[
            { dataKey: 'PPI YoY%', color: '#06b6d4', name: 'PPI YoY%' },
            { dataKey: 'Core PPI YoY%', color: '#3b82f6', name: 'Core PPI YoY%', strokeDasharray: '4 4' },
            { dataKey: 'CPI YoY%', color: '#ef4444', name: 'CPI YoY%' },
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
