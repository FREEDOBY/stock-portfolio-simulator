/** 탭 3: 기술적 시그널 */
import { useState } from 'react';
import { MacroLineChart } from '../charts/MacroLineChart';
import { GaugeChart } from '../charts/GaugeChart';
import { TabChartSection } from './TabChartSection';
import { setElliottCount } from '../../../api/macro';
import type { CrisisOverlay, SignalMarker } from '../charts/crisisOverlayConfig';

interface Props {
  data: Record<string, unknown>;
  crisisOverlays?: CrisisOverlay[];
  signalMarkers?: SignalMarker[];
}

export function TechnicalTab({ data, crisisOverlays = [], signalMarkers = [] }: Props) {
  const [elliott, setElliott] = useState(0);

  const nasdaqWeekly = (data['nasdaq_weekly'] as Array<{ date: string; value: number }>) || [];
  const sma200Data = (data['sma200'] as Array<{ date: string; value: number }>) || [];
  const sma50Data = (data['sma50'] as Array<{ date: string; value: number }>) || [];
  const macdData = data['macd'] as { line: Array<{ date: string; value: number }>; signal: Array<{ date: string; value: number }>; histogram: Array<{ date: string; value: number }> } | undefined;
  const rsiData = (data['rsi'] as Array<{ date: string; value: number }>) || [];

  // 나스닥 + SMA 합치기 (최근 260주 = 5년)
  const sma200Map = new Map(sma200Data.map((d) => [d.date, d.value]));
  const sma50Map = new Map(sma50Data.map((d) => [d.date, d.value]));
  const priceChart = nasdaqWeekly.map((d) => ({
    date: d.date.substring(0, 10),
    NASDAQ: d.value,
    'SMA200': sma200Map.get(d.date) || null,
    'SMA50': sma50Map.get(d.date) || null,
  }));

  // MACD 차트
  const macdLineData = macdData?.line || [];
  const macdSignalMap = new Map((macdData?.signal || []).map((d) => [d.date, d.value]));
  const macdHistMap = new Map((macdData?.histogram || []).map((d) => [d.date, d.value]));
  const macdChart = macdLineData.map((d) => ({
    date: d.date.substring(0, 10),
    MACD: d.value,
    Signal: macdSignalMap.get(d.date) || null,
    Histogram: macdHistMap.get(d.date) || null,
  }));

  // RSI
  const rsiChart = rsiData.map((d) => ({
    date: d.date.substring(0, 10),
    RSI: d.value,
  }));

  // 200주선 거리%
  const lastPrice = nasdaqWeekly.length > 0 ? nasdaqWeekly[nasdaqWeekly.length - 1].value : 0;
  const lastSma200 = sma200Data.length > 0 ? sma200Data[sma200Data.length - 1].value : 0;
  const distancePct = lastSma200 > 0 ? ((lastPrice - lastSma200) / lastSma200) * 100 : 0;

  // Drawdown
  const last52 = nasdaqWeekly.slice(-52);
  const peak52 = last52.length > 0 ? Math.max(...last52.map((d) => d.value)) : 0;
  const drawdownPct = peak52 > 0 ? ((lastPrice - peak52) / peak52) * 100 : 0;

  const handleElliottChange = async (count: number) => {
    setElliott(count);
    try { await setElliottCount(count); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      {/* 나스닥 + SMA */}
      <TabChartSection
        title="NASDAQ Composite + 200W / 50W SMA"
        description={"나스닥 종합지수 + 이동평균선\n• 200주선(빨강): 장기 추세 지표, 하회 시 약세장\n• 50주선(노랑): 중기 추세 지표\n• 골든크로스: 50주선이 200주선 상향 돌파 → 강세\n• 데드크로스: 50주선이 200주선 하향 돌파 → 약세\n• 200주선 접근 시 매수 시그널 발동"}
      >
        <MacroLineChart
          data={priceChart}
          series={[
            { dataKey: 'NASDAQ', color: '#00d4aa', name: 'NASDAQ' },
            { dataKey: 'SMA200', color: '#ef4444', name: '200W SMA', strokeDasharray: '6 3' },
            { dataKey: 'SMA50', color: '#f59e0b', name: '50W SMA', strokeDasharray: '4 4' },
          ]}
          height={300}
          crisisOverlays={crisisOverlays}
          signalMarkers={signalMarkers}
        />
      </TabChartSection>

      {/* MACD */}
      <TabChartSection
        title="Weekly MACD (12, 26, 9)"
        description={"MACD (Moving Average Convergence Divergence)\n• MACD선: EMA(12주) - EMA(26주)\n• 시그널선: MACD의 EMA(9주)\n• 히스토그램: MACD - 시그널\n• MACD > 시그널: 상승 모멘텀\n• 3쌍봉 하락다이버전스: 주가↑ MACD↓ → 매도 경고\n• 쌍바닥 상승다이버전스: 주가↓ MACD↑ → 매수 신호"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={macdChart}
          series={[
            { dataKey: 'Histogram', color: '#64748b', name: 'Histogram', type: 'bar' },
            { dataKey: 'MACD', color: '#3b82f6', name: 'MACD' },
            { dataKey: 'Signal', color: '#f97316', name: 'Signal', strokeDasharray: '4 4' },
          ]}
          referenceLines={[{ y: 0, color: '#475569' }]}
          height={220}
        />
      </TabChartSection>

      {/* RSI */}
      <TabChartSection
        title="Weekly RSI (14)"
        description={"RSI (Relative Strength Index, 14주)\n• 0~100 범위, 상승/하락 강도 측정\n• 70 이상: 과매수 → 조정 가능성\n• 30 이하: 과매도 → 반등 가능성\n• 25 이하: 극과매도 → 매수 시그널\n• 다이버전스 감지 시 추세 전환 신호"}
      >
        <MacroLineChart crisisOverlays={crisisOverlays}
          data={rsiChart}
          series={[{ dataKey: 'RSI', color: '#a78bfa', name: 'RSI' }]}
          referenceLines={[
            { y: 70, color: '#ef4444', label: '70' },
            { y: 30, color: '#10b981', label: '30' },
          ]}
          height={220}
        />
      </TabChartSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 게이지 + Drawdown */}
        <div className="space-y-3">
          <GaugeChart value={distancePct} label="200W SMA Distance" min={-30} max={50} />
          <div className="bg-[#0d1117] border border-slate-700/30 rounded p-4">
            <p className="text-sm text-slate-500 font-mono uppercase mb-2">Drawdown from 52W High</p>
            <p className={`text-3xl font-bold font-mono text-center ${drawdownPct < -15 ? 'text-red-400' : 'text-slate-300'}`}>
              {drawdownPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* 엘리엇 수동 입력 */}
        <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
          <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider font-mono mb-3">
            Elliott Wave (Manual)
          </h4>
          <p className="text-sm text-slate-600 font-mono mb-3">
            엘리엇 5파동 연속 출현 횟수
          </p>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => handleElliottChange(n)}
                className={`flex-1 py-2 text-sm font-mono rounded transition-all ${
                  elliott === n
                    ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400'
                    : 'bg-[#0a0e17] border border-slate-700/50 text-slate-500 hover:border-slate-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {elliott >= 3 && (
            <p className="text-xs text-red-400 font-mono mt-2 animate-pulse">
              ! 3회 연속 → 매도 확인 필요
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
