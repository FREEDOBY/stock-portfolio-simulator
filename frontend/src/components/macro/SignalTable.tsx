import { SIGNAL_STATUS_CONFIG } from '../../types/macro';
import type { SignalResult } from '../../types/macro';

interface Props {
  signals: SignalResult[];
}

export function SignalTable({ signals }: Props) {
  return (
    <div data-testid="signal-table" className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">
          Signal Status
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-2 px-3 text-sm text-slate-500 font-mono">#</th>
              <th className="text-left py-2 px-3 text-sm text-slate-500 font-mono">SIGNAL</th>
              <th className="text-center py-2 px-3 text-sm text-slate-500 font-mono">STATUS</th>
              <th className="text-right py-2 px-3 text-sm text-slate-500 font-mono">SCORE</th>
              <th className="text-left py-2 px-3 text-sm text-slate-500 font-mono">REASON</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => {
              const statusCfg = SIGNAL_STATUS_CONFIG[signal.status];
              return (
                <tr
                  key={signal.signal_id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-2.5 px-3 text-sm text-slate-600 font-mono">
                    {signal.signal_id}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-slate-300 font-mono">
                    {signal.name}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className="px-2 py-0.5 text-sm font-mono rounded"
                      style={{
                        color: statusCfg.color,
                        backgroundColor: statusCfg.color + '20',
                        border: `1px solid ${statusCfg.color}40`,
                      }}
                    >
                      {statusCfg.label}
                    </span>
                  </td>
                  <td
                    className="py-2.5 px-3 text-right text-sm font-bold font-mono"
                    style={{ color: signal.score > 0 ? '#10b981' : signal.score < 0 ? '#ef4444' : '#64748b' }}
                  >
                    {signal.score > 0 ? '+' : ''}{signal.score.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-slate-500 font-mono truncate max-w-[300px]" title={signal.reason}>
                    {signal.reason}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
