import { ETFSearch } from './ETFSearch';
import type { PortfolioItem } from '../types';
import { isKoreanSymbol } from '../utils/stockUtils';

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
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400"></div>
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">Holdings</h2>
      </div>

      <ETFSearch
        onAdd={handleAdd}
        existingSymbols={portfolio.map((p) => p.symbol)}
      />

      <div className="mt-4 space-y-1">
        {portfolio.length === 0 ? (
          <p className="text-slate-600 text-center py-4 text-sm font-mono">
            Add securities to build portfolio
          </p>
        ) : (
          portfolio.map((item) => (
            <div
              key={item.symbol}
              className="flex items-center gap-3 p-2.5 bg-[#0d1117] border border-slate-700/30 rounded hover:border-slate-600/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                {isKoreanSymbol(item.symbol) ? (
                  <>
                    <span className="font-semibold text-cyan-400 text-sm truncate" title={item.name}>{item.name}</span>
                    <span className="ml-2 text-slate-600 text-xs font-mono">{item.symbol}</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-cyan-400 text-sm font-mono">{item.symbol}</span>
                    <span className="ml-2 text-slate-500 text-xs truncate" title={item.name}>{item.name}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={item.weight}
                  onChange={(e) =>
                    handleWeightChange(item.symbol, Number(e.target.value))
                  }
                  className="w-16 px-2 py-1 bg-[#0a0e17] border border-slate-600/50 rounded text-right text-emerald-400 font-mono text-sm focus:border-cyan-500 focus:outline-none"
                />
                <span className="text-slate-500 text-xs font-mono">%</span>

                <button
                  onClick={() => handleRemove(item.symbol)}
                  className="ml-1 text-slate-600 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {portfolio.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/30">
          <div className="flex justify-between items-center">
            <span className={`font-mono text-sm font-bold ${totalWeight === 100 ? 'text-emerald-400 glow-green' : 'text-amber-400'}`}>
              TOTAL: {totalWeight}%
            </span>
            {totalWeight !== 100 && totalWeight > 0 && (
              <button
                onClick={handleNormalize}
                className="text-sm text-cyan-400 hover:text-cyan-300 font-mono"
              >
                [NORMALIZE]
              </button>
            )}
          </div>
          {totalWeight !== 100 && (
            <p className="text-xs text-amber-400/70 mt-1 font-mono">
              ! Weight sum != 100%
            </p>
          )}
        </div>
      )}
    </div>
  );
}
