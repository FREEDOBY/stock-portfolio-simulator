interface Settings {
  startDate: string;
  endDate: string;
  initialAmount: number;
  rebalance: string;
}

interface Props {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  onRun: () => void;
  isLoading: boolean;
  canRun: boolean;
}

export function SimulationSettings({
  settings,
  setSettings,
  onRun,
  isLoading,
  canRun,
}: Props) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">시뮬레이션 설정</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            시작일
          </label>
          <input
            type="date"
            value={settings.startDate}
            onChange={(e) =>
              setSettings({ ...settings, startDate: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            종료일
          </label>
          <input
            type="date"
            value={settings.endDate}
            onChange={(e) =>
              setSettings({ ...settings, endDate: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            초기 투자금 ($)
          </label>
          <input
            type="number"
            min="1000"
            step="1000"
            value={settings.initialAmount}
            onChange={(e) =>
              setSettings({ ...settings, initialAmount: Number(e.target.value) })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            리밸런싱 주기
          </label>
          <select
            value={settings.rebalance}
            onChange={(e) =>
              setSettings({ ...settings, rebalance: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="none">리밸런싱 없음</option>
            <option value="monthly">월별</option>
            <option value="quarterly">분기별</option>
            <option value="yearly">연별</option>
          </select>
        </div>

        <button
          onClick={onRun}
          disabled={!canRun || isLoading}
          className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
            canRun && !isLoading
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
              시뮬레이션 중...
            </span>
          ) : (
            '시뮬레이션 실행'
          )}
        </button>
      </div>
    </div>
  );
}
