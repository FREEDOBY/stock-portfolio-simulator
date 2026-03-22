import { SIGNAL_STATUS_CONFIG } from '../../types/macro';
import type { SignalHistoryEntry } from '../../types/macro';

interface Props {
  history: SignalHistoryEntry[];
}

export function SignalHistory({ history }: Props) {
  if (history.length === 0) {
    return (
      <div data-testid="signal-history" className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">
            Signal History
          </h3>
        </div>
        <p className="text-xs text-slate-600 font-mono text-center py-4">No signal changes recorded</p>
      </div>
    );
  }

  return (
    <div data-testid="signal-history" className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">
          Signal History
        </h3>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {history.map((entry, idx) => {
          const newCfg = SIGNAL_STATUS_CONFIG[entry.new_status];
          return (
            <div
              key={idx}
              className="flex items-center gap-3 px-3 py-2 bg-[#0d1117] border border-slate-700/30 rounded text-xs font-mono"
            >
              <span className="text-slate-600 flex-shrink-0">{entry.date}</span>
              <span className="text-slate-500">S{entry.signal_id}</span>
              <span className="text-slate-600">→</span>
              <span style={{ color: newCfg.color }}>{newCfg.label}</span>
              <span className="text-slate-700 truncate">{entry.reason}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
