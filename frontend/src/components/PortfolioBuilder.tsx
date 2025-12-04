import { ETFSearch } from './ETFSearch';
import type { PortfolioItem } from '../types';

interface Props {
  portfolio: PortfolioItem[];
  setPortfolio: (portfolio: PortfolioItem[]) => void;
}

export function PortfolioBuilder({ portfolio, setPortfolio }: Props) {
  const totalWeight = portfolio.reduce((sum, item) => sum + item.weight, 0);

  const handleAdd = (item: PortfolioItem) => {
    setPortfolio([...portfolio, item]);
  };

  const handleRemove = (symbol: string) => {
    setPortfolio(portfolio.filter((item) => item.symbol !== symbol));
  };

  const handleWeightChange = (symbol: string, weight: number) => {
    setPortfolio(
      portfolio.map((item) =>
        item.symbol === symbol ? { ...item, weight } : item
      )
    );
  };

  const handleNormalize = () => {
    if (totalWeight === 0) return;
    setPortfolio(
      portfolio.map((item) => ({
        ...item,
        weight: Math.round((item.weight / totalWeight) * 100),
      }))
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">포트폴리오 구성</h2>

      <ETFSearch
        onAdd={handleAdd}
        existingSymbols={portfolio.map((p) => p.symbol)}
      />

      <div className="mt-4 space-y-2">
        {portfolio.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            ETF를 검색하여 추가하세요
          </p>
        ) : (
          portfolio.map((item) => (
            <div
              key={item.symbol}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex-1">
                <span className="font-semibold text-blue-600">{item.symbol}</span>
                <span className="ml-2 text-gray-500 text-sm">{item.name}</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.weight}
                  onChange={(e) =>
                    handleWeightChange(item.symbol, Number(e.target.value))
                  }
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                />
                <span className="text-gray-600">%</span>

                <button
                  onClick={() => handleRemove(item.symbol)}
                  className="ml-2 text-red-500 hover:text-red-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {portfolio.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <span className={`font-semibold ${totalWeight === 100 ? 'text-green-600' : 'text-orange-500'}`}>
              합계: {totalWeight}%
            </span>
            {totalWeight !== 100 && totalWeight > 0 && (
              <button
                onClick={handleNormalize}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                100%로 정규화
              </button>
            )}
          </div>
          {totalWeight !== 100 && (
            <p className="text-sm text-orange-500 mt-1">
              비중 합계가 100%가 아닙니다
            </p>
          )}
        </div>
      )}
    </div>
  );
}
