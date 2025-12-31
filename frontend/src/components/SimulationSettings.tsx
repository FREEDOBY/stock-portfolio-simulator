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

        {/* 투자 방식 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            투자 방식
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="investmentType"
                value="lump_sum"
                checked={settings.investmentType === 'lump_sum'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    investmentType: e.target.value as InvestmentType,
                  })
                }
                className="mr-2 w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">거치식 (일시 투자)</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="investmentType"
                value="dca"
                checked={settings.investmentType === 'dca'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    investmentType: e.target.value as InvestmentType,
                  })
                }
                className="mr-2 w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">적립식 (DCA)</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="investmentType"
                value="ma_dca"
                checked={settings.investmentType === 'ma_dca'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    investmentType: e.target.value as InvestmentType,
                  })
                }
                className="mr-2 w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">이동평균 적립식 (MA-DCA)</span>
            </label>
          </div>
        </div>

        {/* 초기 투자금 - 거치식/적립식 모두 표시 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {settings.investmentType === 'lump_sum'
              ? '초기 투자금 ($)'
              : '초기 투자금 ($, 선택)'}
          </label>
          <input
            type="number"
            min={settings.investmentType === 'lump_sum' ? '1000' : '0'}
            step="1000"
            value={settings.initialAmount}
            onChange={(e) =>
              setSettings({ ...settings, initialAmount: Number(e.target.value) })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        {/* 이동평균 적립식 설정 - MA-DCA 선택 시에만 표시 */}
        {settings.investmentType === 'ma_dca' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                투자 주기
              </label>
              <select
                value={settings.dcaFrequency}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dcaFrequency: e.target.value as DCAFrequency,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="daily">매일</option>
                <option value="weekly">매주</option>
                <option value="biweekly">격주 (2주)</option>
                <option value="monthly">매월</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                주기별 기본 투자금액 ($)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={settings.dcaAmount}
                onChange={(e) =>
                  setSettings({ ...settings, dcaAmount: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이동평균 기간 (일)
              </label>
              <input
                type="number"
                min="5"
                max="365"
                step="1"
                value={settings.maPeriod}
                onChange={(e) =>
                  setSettings({ ...settings, maPeriod: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                현재가가 이 기간의 이동평균선 아래일 때 추가 매수
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                저가 매수 배수
              </label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.5"
                value={settings.maMultiplier}
                onChange={(e) =>
                  setSettings({ ...settings, maMultiplier: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                현재가 &lt; 이동평균 시 기본금액의 {settings.maMultiplier}배 매수
              </p>
            </div>
          </>
        )}

        {/* 적립식 설정 - DCA 선택 시에만 표시 */}
        {settings.investmentType === 'dca' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                투자 주기
              </label>
              <select
                value={settings.dcaFrequency}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dcaFrequency: e.target.value as DCAFrequency,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="daily">매일</option>
                <option value="weekly">매주</option>
                <option value="biweekly">격주 (2주)</option>
                <option value="monthly">매월</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                주기별 투자 금액 ($)
              </label>
              <input
                type="number"
                min="100"
                step="100"
                value={settings.dcaAmount}
                onChange={(e) =>
                  setSettings({ ...settings, dcaAmount: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </>
        )}

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
