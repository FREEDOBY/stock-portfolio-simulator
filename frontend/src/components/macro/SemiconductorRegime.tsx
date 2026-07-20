/** 반도체 레짐 판정기 — AI 반도체 사이클 고점 '선행' 판독
 *
 * 선행·전조(60): 캐펙스 증가율 + 메모리 가격(ECOS·HBM·스팟) → 변곡을 앞서는 전조
 * 동행·조기확인(20): TSMC 월매출 + 한국 수출 → 빠른 발표로 전조를 확정
 * 확인·주가(40): 과열·상대강도·모멘텀·RSI → 주가 동조 여부
 * 고점위험 스코어 = min(100, 선행 + 동행 + 확인)
 */
import { MacroLineChart } from './charts/MacroLineChart';
import { ChartTitle } from './charts/InfoTip';
import type { SemiconductorData, LeadingSignal } from '../../types/macro';

interface Props {
  data: SemiconductorData;
  onUpdate?: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  감소: '#ef4444', 꺾임: '#ef4444', 극단: '#ef4444', 과매수: '#ef4444', 롤오버: '#ef4444',
  '증가율 둔화': '#f97316', '상승 둔화': '#f97316', 감속: '#f97316',
  '증설 과열': '#ef4444', '증설 가속': '#f59e0b', 확장: '#10b981', 감산: '#a78bfa',
  과열: '#f59e0b', 경계: '#f59e0b', 정점: '#f59e0b', 상승: '#f59e0b',
  정상: '#10b981', 가속: '#10b981', 중립: '#64748b', 보합: '#64748b',
};

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return 'N/A';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function SignalCard({ s, big }: { s: LeadingSignal; big?: boolean }) {
  const c = STATUS_COLOR[s.status] || '#64748b';
  return (
    <div className="bg-[#0a0e17] rounded-lg p-3 border" style={{ borderColor: c + '30' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-slate-500 uppercase">{s.label}</span>
        <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: c, backgroundColor: c + '20' }}>
          {s.status}
        </span>
      </div>
      <div className={`font-mono font-bold text-slate-200 ${big ? 'text-lg' : 'text-base'}`}>{s.value}</div>
      {s.detail && <div className="text-xs font-mono text-slate-600 mt-0.5">{s.detail}</div>}
    </div>
  );
}

export function SemiconductorRegime({ data }: Props) {
  const { proxy, capex, dram_ref } = data;
  const score = data.top_risk_score;

  return (
    <div data-testid="semiconductor-regime" className="bg-[#111827] border border-slate-700/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: data.color }} />
          <h3 className="text-sm font-mono text-slate-300 uppercase tracking-wider">
            Semiconductor Regime · 고점 선행 판독
          </h3>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded border"
          style={{ color: data.color, borderColor: data.color + '50', backgroundColor: data.color + '15' }}>
          {data.name}
        </span>
      </div>

      {/* 고점 위험 스코어 게이지 (선행 + 확인) */}
      <div className="bg-[#0a0e17] rounded-lg p-4 border border-slate-700/30 mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">
            고점 위험 스코어
            <span className="text-slate-600 ml-2 normal-case">
              선행 {data.lead_score} + 동행 {data.coin_score ?? 0} + 확인 {data.conf_score}
            </span>
          </span>
          <span className="text-3xl font-mono font-bold" style={{ color: data.color }}>{score}</span>
        </div>
        <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="absolute h-full rounded-full transition-all duration-700"
            style={{ width: `${score}%`, backgroundColor: data.color }} />
          {[20, 40, 60].map((m) => (
            <div key={m} className="absolute h-full w-px bg-slate-600" style={{ left: `${m}%` }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-700 mt-1">
          <span>확장</span><span>후기</span><span>과열</span><span>고점경고</span>
        </div>
        <p className="text-sm font-mono text-slate-400 leading-relaxed mt-2">{data.desc}</p>
        <div className="mt-2 inline-block px-3 py-1 rounded text-sm font-mono border"
          style={{ color: data.color, borderColor: data.color + '40', backgroundColor: data.color + '15' }}>
          {data.action}
        </div>
      </div>

      {/* 선행·전조 (펀더멘탈) — 주축 */}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">선행 · 전조</span>
        <span className="text-xs font-mono text-slate-600">수요·공급 캐펙스와 메모리 가격이 변곡을 앞섬 (최대 70)</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {data.leading_signals.map((s) => <SignalCard key={s.key} s={s} big />)}
        {data.leading_signals.length === 0 && (
          <div className="col-span-2 text-xs font-mono text-slate-600 p-2">선행 데이터 로딩 실패</div>
        )}
      </div>

      {/* 동행·조기확인 (활동 실측) */}
      {data.coincident_signals && data.coincident_signals.length > 0 && (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-mono text-amber-400 uppercase tracking-wider">동행 · 조기확인</span>
            <span className="text-xs font-mono text-slate-600">사이클 활동 그 자체 — 빠른 발표(익월 1일/10일)로 전조를 확정</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {data.coincident_signals.map((s) => <SignalCard key={s.key} s={s} />)}
          </div>
        </>
      )}

      {/* 확인 신호 (주가) — 보조 */}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">확인 · 주가</span>
        <span className="text-xs font-mono text-slate-600">주가 동조 여부만 확인</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {data.confirm_signals.map((s) => <SignalCard key={s.key} s={s} />)}
      </div>

      {/* 추세 · 시계열 차트 */}
      <div className="space-y-3 mb-3">
        <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider">추세 · 시계열</div>

        {/* 고점 위험 스코어 추이 (판정 이력 · 로컬 축적) */}
        {data.score_history && data.score_history.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title={`고점 위험 스코어 추이 (${data.score_history.length}일 축적)`}
              info="판정기가 매일 계산한 고점 위험 스코어의 이력입니다(로컬 축적). 40 = 과열 주의, 60 = 고점 경고 임계선. 다음 변곡에서 '경고가 고점보다 며칠 앞섰나'를 실측 검증하고 배점을 데이터로 조정하기 위한 기록으로, 판정 자체에는 영향을 주지 않습니다."
            />
            <MacroLineChart
              data={data.score_history}
              series={[{ dataKey: 'score', color: '#f59e0b', name: '스코어', dot: true }]}
              height={180}
              yAxisFormatter={(v) => `${v.toFixed(0)}`}
              yDomain={[0, 100]}
              referenceLines={[
                { y: 40, color: '#f97316', label: '과열' },
                { y: 60, color: '#ef4444', label: '경고' },
              ]}
            />
          </div>
        )}

        {/* ── 선행 · 전조 차트 ── */}
        <div className="text-[11px] font-mono text-cyan-400/80 uppercase tracking-wider pt-1">
          선행 · 전조 — 수요·공급 캐펙스와 메모리 가격
        </div>

        {/* 빅테크 캐펙스 분기 추이 */}
        {data.capex_series && data.capex_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title="빅테크 캐펙스 분기 ($B · QoQ %)"
              info="마이크로소프트·알파벳·메타·아마존의 분기 설비투자 합계(실적 발표 실측)입니다. AI 데이터센터 수요의 최상류 선행지표 — 금액(초록 막대)보다 QoQ 증가율(주황 라인)이 핵심으로, 증가율이 0%를 향해 둔화되면 선행 신호 '증가율 둔화'(20점), 마이너스면 '감소'(30점)가 점등됩니다."
            />
            <MacroLineChart
              data={data.capex_series}
              series={[
                { dataKey: 'value', color: '#10b981', name: '캐펙스', type: 'bar' },
                { dataKey: 'qoq', color: '#f59e0b', name: 'QoQ %', yAxisId: 'right', dot: true },
              ]}
              height={220}
              yAxisFormatter={(v) => `$${v}B`}
              rightYAxisFormatter={(v) => `${v.toFixed(0)}%`}
              referenceLines={[{ y: 0, color: '#64748b', yAxisId: 'right' }]}
            />
          </div>
        )}

        {/* 메모리 3사(공급) 캐펙스 분기 추이 */}
        {data.supply_capex_series && data.supply_capex_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title="메모리 3사 캐펙스 분기 ($B · QoQ %)"
              info="삼성전자·SK하이닉스·마이크론(공급 측)의 분기 설비투자 합계입니다(달러 환산, 3사 모두 보고한 분기만). 수요 캐펙스와 반대로 읽습니다 — 증설 급팽창(YoY +50%↑)은 1~2년 뒤 공급과잉·가격붕괴의 전조(고점 위험 가점)이고, 감산 전환(YoY 마이너스)은 역사적으로 메모리 바닥의 전조입니다. 마이크론은 회계분기라 캘린더 분기로 근사합니다."
            />
            <MacroLineChart
              data={data.supply_capex_series}
              series={[
                { dataKey: 'value', color: '#a78bfa', name: '공급 캐펙스', type: 'bar' },
                { dataKey: 'qoq', color: '#f59e0b', name: 'QoQ %', yAxisId: 'right', dot: true },
              ]}
              height={220}
              yAxisFormatter={(v) => `$${v}B`}
              rightYAxisFormatter={(v) => `${v.toFixed(0)}%`}
              referenceLines={[{ y: 0, color: '#64748b', yAxisId: 'right' }]}
            />
          </div>
        )}

        {/* IC 수출물가지수 (ECOS · D램 컨트랙트 프록시) */}
        {data.ecos_series && data.ecos_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title="집적회로 수출물가지수 (달러 · 2020=100 · MoM % · 10년)"
              info="한국은행 ECOS의 집적회로 수출물가지수(달러 기준, 월간, 10년)입니다. 한국 IC 수출은 D램·낸드가 지배하므로 D램 컨트랙트 가격의 공식 통계 프록시로 쓰입니다. 직전 사이클 고점(2017~18 슈퍼사이클, 2021)과 비교해보세요 — 두 번 모두 MoM 막대가 먼저 줄어들고 레벨이 뒤따라 꺾였습니다. 메모리 가격 신호의 주지표: YoY 마이너스 '꺾임'(20점), MoM 2개월 연속 둔화+반토막 '상승 둔화'(10점). 하단 바로 구간 확대 가능."
            />
            <MacroLineChart
              data={data.ecos_series}
              series={[
                { dataKey: 'value', color: '#a78bfa', name: 'IC 수출물가', type: 'area' },
                { dataKey: 'mom', color: '#f59e0b', name: 'MoM %', type: 'bar', yAxisId: 'right' },
              ]}
              height={240}
              yAxisFormatter={(v) => `${v.toFixed(0)}`}
              rightYAxisFormatter={(v) => `${v.toFixed(0)}%`}
              yDomain={['auto', 'auto']}
              referenceLines={[{ y: 0, color: '#64748b', yAxisId: 'right' }]}
              brush
            />
          </div>
        )}

        {/* DRAM 스팟 일간 (TrendForce · 로컬 축적) */}
        {data.tf_spot_series && data.tf_spot_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title={`DRAM 스팟 일간 ($ · TrendForce · ${data.tf_spot_series.length}일 축적)`}
              info="TrendForce 스팟 테이블에서 매일 수집하는 주력 칩(DDR4 8Gb/16Gb·DDR5 16Gb) 세션 평균가 실측입니다. 스팟은 컨트랙트에 선행하는 가장 민감한 메모리 가격으로, 3개 칩 합성 일간 변동률이 메모리 가격 신호의 'DRAM 스팟' 방향으로 반영됩니다. 소스가 당일 값만 제공해 로컬에서 수집한 날만 축적됩니다(빠진 날은 공백)."
            />
            <MacroLineChart
              data={data.tf_spot_series}
              series={[
                { dataKey: 'ddr5_16gb', color: '#06b6d4', name: 'DDR5 16Gb', dot: true },
                { dataKey: 'ddr4_16gb', color: '#a78bfa', name: 'DDR4 16Gb', dot: true },
                { dataKey: 'ddr4_8gb', color: '#f59e0b', name: 'DDR4 8Gb', dot: true },
              ]}
              height={220}
              yAxisFormatter={(v) => `$${v.toFixed(0)}`}
              yDomain={['auto', 'auto']}
            />
          </div>
        )}

        {/* HBM 세대별 가격 (AI 프리미엄 메모리 · 2020~2026) */}
        {data.hbm_gen_series && data.hbm_gen_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title="HBM 세대별 가격 ($/GB · 2020~2026 · 마지막 포인트는 전망)"
              info="AI 가속기용 프리미엄 메모리의 세대별 GB당 가격 이력입니다(SiliconAnalysts 추정). HBM은 연 단위 선계약 시장이라 일간 시세가 존재하지 않아 반기·연간 추정이 최선입니다. HBM3E의 2026 포인트($11)와 HBM4($14)는 전망치 — HBM4 전환기에 HBM3E 가격이 정상화(하락)되는 궤적이 핵심입니다. 신호에는 실측(2025 하반기까지)만 스테일 가드 하에 반영됩니다."
            />
            <MacroLineChart
              data={data.hbm_gen_series}
              series={[
                { dataKey: 'hbm2', color: '#64748b', name: 'HBM2', dot: true },
                { dataKey: 'hbm2e', color: '#94a3b8', name: 'HBM2E', dot: true },
                { dataKey: 'hbm3', color: '#06b6d4', name: 'HBM3', dot: true },
                { dataKey: 'hbm3e', color: '#f43f5e', name: 'HBM3E', dot: true },
                { dataKey: 'hbm4', color: '#a78bfa', name: 'HBM4', dot: true },
              ]}
              height={220}
              yAxisFormatter={(v) => `$${v}`}
              yDomain={['auto', 'auto']}
            />
          </div>
        )}

        {/* D램 DDR4 가격 추이 (컨트랙트 → 스팟 · 장기 레벨 참고) */}
        {data.ddr4_series && data.ddr4_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title="D램 DDR4 8Gb 가격 ($ · 컨트랙트→스팟 · 전기 대비 %)"
              info="SiliconAnalysts의 분기 추정치로, 레거시 D램 가격의 장기 레벨 참고용입니다. 데이터가 희소하고(포인트 수 개) 컨트랙트→스팟 접합 지점은 기준이 달라 변화율(주황 막대)을 계산하지 않습니다. 스팟 '방향' 신호로는 사용하지 않으며, 신호는 TrendForce 일간 실측이 담당합니다."
            />
            <MacroLineChart
              data={data.ddr4_series}
              series={[
                { dataKey: 'value', color: '#f43f5e', name: 'DDR4 $', type: 'area', dot: true },
                { dataKey: 'qoq', color: '#f59e0b', name: '전기 대비 %', type: 'bar', yAxisId: 'right', barSize: 28 },
              ]}
              height={220}
              yAxisFormatter={(v) => `$${v}`}
              rightYAxisFormatter={(v) => `${v.toFixed(0)}%`}
              referenceLines={[{ y: 0, color: '#64748b', yAxisId: 'right' }]}
            />
          </div>
        )}

        {/* ── 동행 · 조기확인 차트 ── */}
        <div className="text-[11px] font-mono text-amber-400/80 uppercase tracking-wider pt-1">
          동행 · 조기확인 — 사이클 활동 실측
        </div>

        {/* TSMC 월매출 (AI 생산 최상류) */}
        {data.tsmc_series && data.tsmc_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title="TSMC 월매출 (NT$B · YoY %)"
              info="SEC 6-K 공시로 매월 10일경 발표되는 TSMC 월매출입니다. AI 칩 생산 최상류의 월간 실측(동행·조기확인) — 매출 자체보다 YoY 증가율(주황 라인)의 방향이 핵심으로, 증가율이 직전 월 대비 5%p 이상 둔화하면 5점, 마이너스 전환 시 10점이 점등됩니다. 분기 실적 발표보다 1~2개월 빠른 확정 신호입니다."
            />
            <MacroLineChart
              data={data.tsmc_series}
              series={[
                { dataKey: 'revenue_bn', color: '#06b6d4', name: '매출 NT$B', type: 'bar' },
                { dataKey: 'yoy', color: '#f59e0b', name: 'YoY %', yAxisId: 'right' },
              ]}
              height={220}
              yAxisFormatter={(v) => `${v.toFixed(0)}`}
              rightYAxisFormatter={(v) => `${v.toFixed(0)}%`}
              referenceLines={[{ y: 0, color: '#64748b', yAxisId: 'right' }]}
            />
          </div>
        )}

        {/* 한국 반도체 수출 추이 (월별) */}
        {data.export_series && data.export_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title="한국 반도체 수출 (월별, 억$ · HS 8542)"
              info="관세청 무역통계의 월간 반도체(HS 8542) 수출액입니다. 익월 1일에 나오는 세계에서 가장 빠른 반도체 활동 실측(동행·조기확인)으로, 글로벌 반도체 경기의 카나리아 역할을 합니다. YoY 마이너스면 '감소'(10점), +10% 미만이면 '둔화'(5점)가 점등됩니다."
            />
            <MacroLineChart
              data={data.export_series}
              series={[{ dataKey: 'value', color: '#22d3ee', name: '수출 억$', type: 'area' }]}
              height={220}
              yAxisFormatter={(v) => `${v}억`}
            />
          </div>
        )}

        {/* ── 확인 · 주가 차트 ── */}
        <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider pt-1">
          확인 · 주가 — 동조 여부
        </div>

        {/* 메모리 vs 로직 주가 (정규화 지수) */}
        {data.mem_logic_series && data.mem_logic_series.length > 0 && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-slate-700/30">
            <ChartTitle
              title="메모리 vs 로직 주가 (시작=100 정규화, 2년)"
              info="메모리 3사(마이크론·SK하이닉스·삼성전자)와 로직 2사(엔비디아·브로드컴) 주가를 각각 바스켓 평균한 뒤 2년 전=100으로 정규화한 상대 성과 비교입니다. 메모리는 사이클 후반에 로직을 가파르게 아웃퍼폼하는 경향이 있어, 메모리 라인이 수직으로 벌어지면 과열·말기 신호, 벌어진 격차가 꺾이면(롤오버) 고점 확인 신호입니다. 위 확인 블록의 과열도·상대강도·모멘텀·RSI가 이 데이터로 계산됩니다."
            />
            <MacroLineChart
              data={data.mem_logic_series}
              series={[
                { dataKey: 'memory', color: '#f59e0b', name: '메모리' },
                { dataKey: 'logic', color: '#06b6d4', name: '로직' },
              ]}
              height={220}
              yAxisFormatter={(v) => `${v.toFixed(0)}`}
            />
          </div>
        )}
      </div>

      {/* 참고 실데이터: 캐펙스 · D램 · HBM */}
      <div className="bg-[#0a0e17]/60 rounded-lg p-3 border border-slate-800/50 space-y-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-xs font-mono text-slate-600">캐펙스 합계</div>
            <div className="text-sm font-mono font-bold text-slate-300">
              {capex.total_latest != null ? `$${capex.total_latest}B` : 'N/A'}
            </div>
            <div className="text-xs font-mono" style={{ color: capex.accelerating === false ? '#f97316' : '#10b981' }}>
              QoQ {fmtPct(capex.growth_qoq)}
            </div>
          </div>
          <div>
            <div className="text-xs font-mono text-slate-600">DDR4 스팟</div>
            <div className="text-sm font-mono font-bold text-slate-300">
              {dram_ref.ddr4_spot != null ? `$${dram_ref.ddr4_spot}` : 'N/A'}
            </div>
            <div className="text-xs font-mono" style={{ color: dram_ref.ddr4_spot_dir === 'falling' ? '#ef4444' : '#10b981' }}>
              {dram_ref.ddr4_spot_dir === 'falling' ? '하락' : dram_ref.ddr4_spot_dir === 'rising' ? '상승' : '보합'}
            </div>
          </div>
          <div>
            <div className="text-xs font-mono text-slate-600">반도체 PPI YoY</div>
            <div className="text-sm font-mono font-bold" style={{ color: (dram_ref.ppi_yoy ?? 0) < 0 ? '#ef4444' : '#10b981' }}>
              {fmtPct(dram_ref.ppi_yoy)}
            </div>
          </div>
          <div>
            <div className="text-xs font-mono text-slate-600">{dram_ref.hbm_gen || 'HBM'} $/GB</div>
            <div className="text-sm font-mono font-bold text-slate-300">
              {dram_ref.hbm_value != null ? `$${dram_ref.hbm_value}` : 'N/A'}
            </div>
          </div>
        </div>
        <div className="text-xs font-mono text-slate-600 text-center border-t border-slate-800/50 pt-2">
          주가 3M · 메모리 <span className="text-slate-400">{fmtPct(proxy.mem_avg)}</span>
          {' · '}로직 <span className="text-slate-400">{fmtPct(proxy.logic_avg)}</span>
          {' · '}격차 <span style={{ color: (proxy.mem_vs_logic ?? 0) < 0 ? '#ef4444' : '#10b981' }}>{fmtPct(proxy.mem_vs_logic)}</span>
          {' · '}SOX <span className="text-slate-400">{fmtPct(proxy.sox_mom)}</span>
          {proxy.mem_drawdown != null && (
            <>
              {' · '}고점대비 <span style={{ color: proxy.mem_drawdown <= -15 ? '#ef4444' : '#f59e0b' }}>{fmtPct(proxy.mem_drawdown)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
