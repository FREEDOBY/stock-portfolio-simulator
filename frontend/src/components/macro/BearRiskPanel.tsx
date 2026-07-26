/** 베어장 위험 상세 패널 — 유형별 4축 판정 + 30년 소급 검증
 *
 * 베어장은 촉발 원인별로 성격이 달라 단일 지표로 예측 불가:
 * - 긴축형(2018·2022) / 버블형(2000·2021) / 신용위기형(2008) — 예측축
 * - 쇼크형(1987·2020·2025) — 예측 불가, 추세 이탈 '확인' 전담
 * 하단 검증 차트는 각 축 점수를 30년 소급 계산해 실제 베어장(음영)과 대조.
 */
import { Fragment, useState } from 'react';
import { MacroLineChart } from './charts/MacroLineChart';
import { ChartTitle } from './charts/InfoTip';
import { NASDAQ_BEAR_OVERLAYS } from './charts/crisisOverlayConfig';
import { WARNING_LEVEL_CONFIG } from '../../types/macro';
import type { BearAxis, BearAxisSignal, BearMarketRiskData } from '../../types/macro';

interface Props {
  data: BearMarketRiskData;
}

const SIGNAL_COLOR: Record<string, string> = {
  점등: '#ef4444', 부분: '#f59e0b', 정상: '#10b981', '데이터 없음': '#64748b',
};

const AXIS_LINE_COLOR: Record<string, string> = {
  tightening: '#f97316', bubble: '#a78bfa', credit: '#ef4444', shock: '#64748b',
};

function SignalCard({ s }: { s: BearAxisSignal }) {
  const c = SIGNAL_COLOR[s.status] || '#64748b';
  return (
    <div className="bg-[#0a0e17] rounded-lg p-3 border" style={{ borderColor: c + '30' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-slate-500 uppercase">{s.label}</span>
        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: c, backgroundColor: c + '20' }}>
          {s.status}
        </span>
      </div>
      <div className="font-mono font-bold text-slate-200 text-base">{s.value}</div>
      {s.detail && <div className="text-xs font-mono text-slate-600 mt-0.5">{s.detail}</div>}
    </div>
  );
}

function AxisSection({ axis }: { axis: BearAxis }) {
  const levelCfg = WARNING_LEVEL_CONFIG[axis.level];
  return (
    <div className="bg-[#0a0e17] rounded-lg p-4 border border-slate-700/30">
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider" style={{ color: AXIS_LINE_COLOR[axis.key] }}>
            {axis.label}
          </span>
          <span className="text-xs font-mono text-slate-600">{axis.desc}</span>
        </div>
        <span className="text-2xl font-mono font-bold" style={{ color: axis.color }}>
          {axis.key === 'shock' && axis.state_label
            ? axis.state_label
            : axis.score !== null ? axis.score.toFixed(0) : 'N/A'}
        </span>
      </div>
      <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className="absolute h-full rounded-full transition-all duration-700"
          style={{ width: `${axis.score ?? 0}%`, backgroundColor: axis.color }}
        />
        {[15, 35, 60].map((m) => (
          <div key={m} className="absolute h-full w-px bg-slate-600" style={{ left: `${m}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {axis.signals.map((s) => <SignalCard key={s.key} s={s} />)}
      </div>
      {axis.level !== 'normal' && axis.key !== 'shock' && (
        <div className="mt-2 text-xs font-mono" style={{ color: levelCfg.color }}>
          {levelCfg.label} — 경고 임계(35) {axis.score !== null && axis.score >= 35 ? '초과' : '접근'}
        </div>
      )}
    </div>
  );
}

export function BearRiskPanel({ data }: Props) {
  const config = WARNING_LEVEL_CONFIG[data.summary.level];
  const [visibleAxes, setVisibleAxes] = useState<Record<string, boolean>>({
    tightening: true, bubble: true, credit: true, shock: false,
  });

  const toggleAxis = (key: string) =>
    setVisibleAxes((prev) => ({ ...prev, [key]: !prev[key] }));

  const axisLabels: Record<string, string> = Object.fromEntries(
    data.axes.map((a) => [a.key, a.label]));

  return (
    <div data-testid="bear-risk-panel" className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
          <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">
            Bear Market Risk · 유형별 4축 판정
          </h3>
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded border"
          style={{ color: config.color, borderColor: config.color + '50', backgroundColor: config.color + '15' }}
        >
          {config.label}
        </span>
      </div>

      {/* 요약 + 행동 단계 */}
      <div className="bg-[#0a0e17] rounded-lg p-4 border border-slate-700/30 mb-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">종합 — 최고 위험 축</span>
          <span className="text-3xl font-mono font-bold" style={{ color: config.color }}>
            {data.summary.worst_score !== null ? data.summary.worst_score.toFixed(0) : 'N/A'}
          </span>
        </div>
        <p className="text-sm font-mono text-slate-400 mt-1">{data.summary.headline}</p>
        {data.summary.stage_info && (
          <div
            className="mt-3 px-3 py-2 rounded border"
            style={{
              borderColor: data.summary.stage_info.color + '40',
              backgroundColor: data.summary.stage_info.color + '10',
            }}
          >
            <span className="text-sm font-mono font-bold" style={{ color: data.summary.stage_info.color }}>
              {data.summary.stage_info.label} — {data.summary.stage_info.action}
            </span>
            <p className="text-xs font-mono text-slate-500 mt-1">{data.summary.stage_info.desc}</p>
          </div>
        )}
        <p className="text-xs font-mono text-slate-600 mt-2 leading-relaxed">
          축 점수는 타이밍이 아니라 조건 성숙도입니다 — 버블·긴축 축은 고점보다 수개월~수년 앞서 점등될 수
          있습니다. 행동 단계는 30년 소급 검증 기반: 복수 축 동시 경고(비중 관리)는 오탐 0회, 단일 축
          경고(경계)는 강세장에서 수년 지속될 수 있어 행동 신호가 아닙니다. 어느 축이 켜졌는지가 예상 깊이를
          결정합니다 (신용형 = -50%급 · 긴축/버블형 = -25~35%급).
        </p>
      </div>

      {/* 축별 섹션 */}
      <div className="space-y-3 mb-4">
        {data.axes.map((axis) => <AxisSection key={axis.key} axis={axis} />)}
      </div>

      {/* 30년 소급 검증 차트 */}
      <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30 mb-3">
        <ChartTitle
          title="축별 점수 30년 소급 검증 (실제 베어장 음영)"
          info={"각 축 점수를 과거 데이터로 소급 계산해 실제 베어장(음영)과 대조합니다. 점선 35 = 경고, 60 = 위험. 검증 기준: 예측축(긴축·버블·신용)은 고점 '직전 12개월' 내 경고 도달, 쇼크축은 고점 후 6개월 내 이탈(50+) 도달.\n주의: FRED는 개정 후 데이터만 제공하므로 당시 실시간 판정의 재현이 아니며, 200일선은 40주선으로 근사합니다. 신용 스프레드는 30년 이력이 있는 무디스 Baa(BAA10Y)를 사용합니다."}
        />
        <div className="flex gap-2 mb-2">
          {data.axes.map((a) => (
            <button
              key={a.key}
              onClick={() => toggleAxis(a.key)}
              className="text-xs font-mono px-2 py-0.5 rounded border transition-colors"
              style={visibleAxes[a.key]
                ? { color: AXIS_LINE_COLOR[a.key], borderColor: AXIS_LINE_COLOR[a.key] + '60', backgroundColor: AXIS_LINE_COLOR[a.key] + '15' }
                : { color: '#475569', borderColor: '#33415560' }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <MacroLineChart
          data={data.history}
          series={data.axes
            .filter((a) => visibleAxes[a.key])
            .map((a) => ({ dataKey: a.key, color: AXIS_LINE_COLOR[a.key], name: a.label }))}
          height={320}
          yDomain={[0, 100]}
          yAxisFormatter={(v) => `${v.toFixed(0)}`}
          referenceLines={[
            { y: 35, color: '#f97316', label: '경고' },
            { y: 60, color: '#ef4444', label: '위험' },
          ]}
          crisisOverlays={NASDAQ_BEAR_OVERLAYS}
          brush
        />
      </div>

      {/* 역대 하락장 지표 참조 테이블 */}
      {data.reference && (
        <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30 mb-3">
          <ChartTitle
            title="역대 하락장 고점 시점 지표 참조 — 현재와 한눈 비교"
            info={"각 하락장 '고점 당월'의 지표 실측값입니다 (그 상태로 고점을 통과했다는 뜻). 쇼크축 지표만 고점 후 6개월 내 극단값 — 하락이 어디까지 갔는지 보여줍니다. 맨 오른쪽 '현재' 열과 행별로 비교하면 지금이 과거 어느 고점과 닮았는지 판단할 수 있습니다.\n주의: FRED 개정 후 데이터 기준이며, 분기 지표는 발표 지연으로 고점 당월 값이 직전 분기 값일 수 있습니다."}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono whitespace-nowrap">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700/50">
                  <th className="text-left py-1.5 pr-3 sticky left-0 bg-[#0a0e17]">지표</th>
                  {data.reference.rows.map((r) => (
                    <th
                      key={r.key}
                      className={`text-right px-2 ${r.key === 'current' ? 'text-cyan-300' : ''}`}
                      title={r.peak ? `고점 ${r.peak}` : '현재 값'}
                    >
                      {r.label}
                      {r.peak && <div className="text-[10px] font-normal text-slate-700">{r.peak}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.reference.columns.map((col, i) => {
                  const prevAxis = data.reference!.columns[i - 1]?.axis;
                  const axisColor = AXIS_LINE_COLOR[col.axis] || '#64748b';
                  return (
                    <Fragment key={col.key}>
                      {col.axis !== prevAxis && (
                        <tr>
                          <td
                            colSpan={data.reference!.rows.length + 1}
                            className="pt-2 pb-1 text-[10px] uppercase tracking-wider sticky left-0"
                            style={{ color: axisColor }}
                          >
                            {col.axis_label}
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-slate-800/40">
                        <td className="py-1 pr-3 text-slate-400 sticky left-0 bg-[#0a0e17]">{col.label}</td>
                        {data.reference!.rows.map((r) => (
                          <td
                            key={r.key}
                            className={`text-right px-2 ${
                              r.key === 'current' ? 'text-cyan-300 bg-cyan-500/5' : 'text-slate-500'
                            }`}
                          >
                            {r.metrics[col.key] ?? '-'}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 에피소드 검증 테이블 */}
      <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
        <ChartTitle
          title="역사 검증 — 베어장별 사전 점등 여부"
          info="각 베어장 고점 직전 12개월 창에서 축별 최대 점수(쇼크축은 고점 후 6개월). 굵은 값 = 담당 축. 2020 코로나·2025 관세는 외생 쇼크라 예측축 무점등이 정답이며 쇼크축의 빠른 이탈 확인이 담당입니다."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700/50">
                <th className="text-left py-1.5 pr-2">베어장 (고점)</th>
                <th className="text-right px-2">긴축</th>
                <th className="text-right px-2">버블</th>
                <th className="text-right px-2">신용</th>
                <th className="text-right px-2">쇼크</th>
                <th className="text-right pl-2">판정</th>
              </tr>
            </thead>
            <tbody>
              {data.validation.map((ep) => (
                <tr key={ep.key} className="border-b border-slate-800/50">
                  <td className="py-1.5 pr-2 text-slate-400">{ep.label} ({ep.peak})</td>
                  {(['tightening', 'bubble', 'credit', 'shock'] as const).map((k) => {
                    const cell = ep.axes[k];
                    const isExpected = ep.expected.includes(k);
                    const warned = cell?.warned;
                    return (
                      <td
                        key={k}
                        className={`text-right px-2 ${isExpected ? 'font-bold' : ''}`}
                        style={{ color: warned ? AXIS_LINE_COLOR[k] : '#475569' }}
                        title={isExpected ? `담당 축 (${axisLabels[k]})` : undefined}
                      >
                        {cell?.max_score !== null && cell?.max_score !== undefined
                          ? cell.max_score.toFixed(0) : '-'}
                        {isExpected && (warned ? ' ✓' : ' ✗')}
                      </td>
                    );
                  })}
                  <td className={`text-right pl-2 ${ep.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                    {ep.passed ? 'PASS' : 'MISS'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
