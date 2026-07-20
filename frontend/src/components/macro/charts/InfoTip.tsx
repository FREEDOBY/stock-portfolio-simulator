/** 차트 설명 호버 툴팁 (ⓘ) — 아이콘에 마우스를 올리면 설명 팝오버 표시 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group cursor-help inline-flex items-center">
      <span className="text-[10px] font-mono text-slate-600 border border-slate-700 rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none shrink-0 group-hover:text-cyan-400 group-hover:border-cyan-500/50 transition-colors">
        i
      </span>
      <span className="absolute left-0 top-full mt-1.5 z-20 hidden group-hover:block w-[28rem] max-w-[80vw] bg-[#1a1f2e] border border-slate-600/50 rounded-md p-3 text-xs font-mono font-normal text-slate-300 leading-relaxed normal-case tracking-normal text-left shadow-xl">
        {text}
      </span>
    </span>
  );
}

/** 차트 제목 + 호버 설명 (제목/아이콘 어디에 올려도 표시) */
export function ChartTitle({ title, info }: { title: string; info: string }) {
  return (
    <div className="relative group flex items-center gap-1.5 mb-1 w-fit cursor-help">
      <span className="text-xs font-mono text-slate-500">{title}</span>
      <span className="text-[10px] font-mono text-slate-600 border border-slate-700 rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none shrink-0 group-hover:text-cyan-400 group-hover:border-cyan-500/50 transition-colors">
        i
      </span>
      <span className="absolute left-0 top-full mt-1 z-20 hidden group-hover:block w-[28rem] max-w-[80vw] bg-[#1a1f2e] border border-slate-600/50 rounded-md p-3 text-xs font-mono text-slate-300 leading-relaxed shadow-xl">
        {info}
      </span>
    </div>
  );
}
