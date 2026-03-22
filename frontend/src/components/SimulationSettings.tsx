export type InvestmentType = 'lump_sum' | 'dca' | 'ma_dca';
export type DCAFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface Settings {
  startDate: string;
  endDate: string;
  initialAmount: number;
  rebalance: string;
  investmentType: InvestmentType;
  dcaFrequency: DCAFrequency;
  dcaAmount: number;
  maPeriod: number;
  maMultiplier: number;
}

interface Props {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  onRun: () => void;
  isLoading: boolean;
  canRun: boolean;
}

const inputClass = "w-full px-3 py-2 bg-[#0a0e17] border border-slate-600/50 rounded text-slate-200 text-sm font-mono focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30";
const labelClass = "block text-sm font-medium text-slate-500 mb-1 uppercase tracking-wider font-mono";

export function SimulationSettings({
  settings,
  setSettings,
  onRun,
  isLoading,
  canRun,
}: Props) {
  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">Parameters</h2>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Start Date</label>
            <input
              type="date"
              value={settings.startDate}
              onChange={(e) =>
                setSettings({ ...settings, startDate: e.target.value })
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>End Date</label>
            <input
              type="date"
              value={settings.endDate}
              onChange={(e) =>
                setSettings({ ...settings, endDate: e.target.value })
              }
              className={inputClass}
            />
          </div>
        </div>

        {/* 투자 방식 선택 */}
        <div>
          <label className={labelClass}>Strategy</label>
          <div className="flex gap-1">
            {[
              { value: 'lump_sum', label: 'LUMP' },
              { value: 'dca', label: 'DCA' },
              { value: 'ma_dca', label: 'MA-DCA' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() =>
                  setSettings({
                    ...settings,
                    investmentType: opt.value as InvestmentType,
                  })
                }
                className={`flex-1 px-2 py-1.5 text-sm font-mono rounded transition-all ${
                  settings.investmentType === opt.value
                    ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400'
                    : 'bg-[#0a0e17] border border-slate-700/50 text-slate-500 hover:border-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 초기 투자금 */}
        <div>
          <label className={labelClass}>
            {settings.investmentType === 'lump_sum'
              ? 'Initial Amount ($)'
              : 'Initial Amount ($, optional)'}
          </label>
          <input
            type="number"
            min={settings.investmentType === 'lump_sum' ? '1000' : '0'}
            step="1000"
            value={settings.initialAmount}
            onChange={(e) =>
              setSettings({ ...settings, initialAmount: Number(e.target.value) })
            }
            className={inputClass}
          />
        </div>

        {/* MA-DCA 설정 */}
        {settings.investmentType === 'ma_dca' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Frequency</label>
                <select
                  value={settings.dcaFrequency}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      dcaFrequency: e.target.value as DCAFrequency,
                    })
                  }
                  className={inputClass}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Amount ($)</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={settings.dcaAmount}
                  onChange={(e) =>
                    setSettings({ ...settings, dcaAmount: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>MA Period (days)</label>
                <input
                  type="number"
                  min="5"
                  max="365"
                  step="1"
                  value={settings.maPeriod}
                  onChange={(e) =>
                    setSettings({ ...settings, maPeriod: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Multiplier</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  step="0.5"
                  value={settings.maMultiplier}
                  onChange={(e) =>
                    setSettings({ ...settings, maMultiplier: Number(e.target.value) })
                  }
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-slate-600 font-mono">
              Price &lt; MA: buy {settings.maMultiplier}x base amount
            </p>
          </>
        )}

        {/* DCA 설정 */}
        {settings.investmentType === 'dca' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Frequency</label>
              <select
                value={settings.dcaFrequency}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dcaFrequency: e.target.value as DCAFrequency,
                  })
                }
                className={inputClass}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Amount ($)</label>
              <input
                type="number"
                min="100"
                step="100"
                value={settings.dcaAmount}
                onChange={(e) =>
                  setSettings({ ...settings, dcaAmount: Number(e.target.value) })
                }
                className={inputClass}
              />
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>Rebalancing</label>
          <select
            value={settings.rebalance}
            onChange={(e) =>
              setSettings({ ...settings, rebalance: e.target.value })
            }
            className={inputClass}
          >
            <option value="none">None</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <button
          onClick={onRun}
          disabled={!canRun || isLoading}
          className={`w-full py-2.5 rounded font-mono text-sm font-bold uppercase tracking-wider transition-all ${
            canRun && !isLoading
              ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/10'
              : 'bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-emerald-400 border-t-transparent rounded-full"></div>
              PROCESSING...
            </span>
          ) : (
            'EXECUTE BACKTEST'
          )}
        </button>
      </div>
    </div>
  );
}
