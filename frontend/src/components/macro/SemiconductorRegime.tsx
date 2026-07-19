/** 반도체 레짐 판정기 — AI 반도체 사이클 고점 '선행' 판독
 *
 * 선행(펀더멘탈·주축): 빅테크 캐펙스 증가율 + D램 가격 → 사이클을 선행
 * 확인(주가·동행): 메모리/로직 과열·상대강도·모멘텀·RSI → 선행 신호를 확인
 * 고점위험 스코어 = 선행(최대 60) + 확인(최대 40)
 */
import type { SemiconductorData, LeadingSignal } from '../../types/macro';

interface Props {
  data: SemiconductorData;
  onUpdate?: () => void;
}

const STATUS_COLOR: Record<string, string> = {
  감소: '#ef4444', 꺾임: '#ef4444', 극단: '#ef4444', 과매수: '#ef4444', 롤오버: '#ef4444',
  '증가율 둔화': '#f97316', 감속: '#f97316',
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
            <span className="text-slate-600 ml-2 normal-case">선행 {data.lead_score} + 확인 {data.conf_score}</span>
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

      {/* 선행 신호 (펀더멘탈) — 주축 */}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">선행 · 펀더멘탈</span>
        <span className="text-xs font-mono text-slate-600">캐펙스·D램이 사이클을 선행</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {data.leading_signals.map((s) => <SignalCard key={s.key} s={s} big />)}
        {data.leading_signals.length === 0 && (
          <div className="col-span-2 text-xs font-mono text-slate-600 p-2">선행 데이터 로딩 실패</div>
        )}
      </div>

      {/* 확인 신호 (주가·동행) — 보조 */}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">확인 · 주가(동행)</span>
        <span className="text-xs font-mono text-slate-600">선행 신호를 확인만</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {data.confirm_signals.map((s) => <SignalCard key={s.key} s={s} />)}
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
        </div>
      </div>
    </div>
  );
}
