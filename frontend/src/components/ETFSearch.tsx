import { useState, useEffect, useRef } from 'react';
import { searchETF, validateSymbol } from '../api';
import type { ETFInfo, PortfolioItem } from '../types';

interface Props {
  onAdd: (item: PortfolioItem) => void;
  existingSymbols: string[];
}

export function ETFSearch({ onAdd, existingSymbols }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ETFInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 1) {
        setIsLoading(true);
        try {
          const data = await searchETF(query);
          setResults(data.filter(etf => !existingSymbols.includes(etf.symbol)));
          setIsOpen(true);
        } catch (error) {
          console.error('Search failed:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, existingSymbols]);

  const handleSelect = (etf: ETFInfo) => {
    onAdd({
      symbol: etf.symbol,
      name: etf.name,
      weight: 0,
    });
    setQuery('');
    setIsOpen(false);
    setValidationError('');
  };

  const handleDirectAdd = async () => {
    const symbol = query.trim().toUpperCase();

    if (!symbol) return;

    if (existingSymbols.includes(symbol)) {
      setValidationError('이미 추가된 종목입니다.');
      return;
    }

    setIsValidating(true);
    setValidationError('');

    try {
      const etfInfo = await validateSymbol(symbol);

      if (etfInfo) {
        onAdd({
          symbol: etfInfo.symbol,
          name: etfInfo.name,
          weight: 0,
        });
        setQuery('');
        setIsOpen(false);
      } else {
        setValidationError(`"${symbol}" 종목을 찾을 수 없습니다.`);
      }
    } catch {
      setValidationError('종목 확인 중 오류가 발생했습니다.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative overflow-hidden">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setValidationError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) {
              e.preventDefault();
              handleDirectAdd();
            }
          }}
          placeholder="SPY, 삼성전자..."
          className="flex-1 min-w-0 px-2 py-2 bg-[#0a0e17] border border-slate-600/50 rounded text-slate-200 text-sm font-mono placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
        />
        <button
          onClick={handleDirectAdd}
          disabled={!query.trim() || isValidating}
          className="flex-shrink-0 px-3 py-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 rounded text-sm font-mono hover:bg-cyan-600/30 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700 disabled:cursor-not-allowed transition-colors"
        >
          {isValidating ? '...' : 'ADD'}
        </button>
      </div>

      {(isLoading || isValidating) && (
        <div className="absolute right-20 top-2.5">
          <div className="animate-spin h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full"></div>
        </div>
      )}

      {validationError && (
        <p className="mt-1 text-xs text-red-400 font-mono">{validationError}</p>
      )}

      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-[#111827] border border-slate-600/50 rounded shadow-xl shadow-black/50 max-h-60 overflow-auto">
          {results.map((etf) => (
            <li
              key={etf.symbol}
              onClick={() => handleSelect(etf)}
              className="px-3 py-2 hover:bg-cyan-500/10 cursor-pointer border-b border-slate-700/30 last:border-b-0 transition-colors"
            >
              <span className="font-bold text-cyan-400 font-mono text-sm">{etf.symbol}</span>
              {etf.is_korean && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded font-mono">KR</span>
              )}
              <span className="ml-2 text-slate-400 text-sm">{etf.name}</span>
              {etf.market && (
                <span className="ml-1 text-slate-600 text-xs font-mono">({etf.market})</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOpen && results.length === 0 && query.length >= 1 && !isLoading && (
        <div className="absolute z-10 w-full mt-1 bg-[#111827] border border-slate-600/50 rounded shadow-xl p-3 text-center">
          <p className="text-sm text-slate-500 font-mono">No results found</p>
          <p className="text-xs mt-1 text-slate-600 font-mono">Enter exact symbol & click ADD</p>
        </div>
      )}
    </div>
  );
}
