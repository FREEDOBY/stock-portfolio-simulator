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
    <div ref={wrapperRef} className="relative">
      <div className="flex gap-2">
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
          placeholder="ETF/주식 검색 (예: SPY, 삼성전자, 005930)"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={handleDirectAdd}
          disabled={!query.trim() || isValidating}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isValidating ? '확인중...' : '직접 추가'}
        </button>
      </div>

      {(isLoading || isValidating) && (
        <div className="absolute right-28 top-2.5">
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      )}

      {validationError && (
        <p className="mt-1 text-sm text-red-500">{validationError}</p>
      )}

      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {results.map((etf) => (
            <li
              key={etf.symbol}
              onClick={() => handleSelect(etf)}
              className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <span className="font-semibold text-blue-600">{etf.symbol}</span>
              {etf.is_korean && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded">KR</span>
              )}
              <span className="ml-2 text-gray-600 text-sm">{etf.name}</span>
              {etf.market && (
                <span className="ml-1 text-gray-400 text-xs">({etf.market})</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOpen && results.length === 0 && query.length >= 1 && !isLoading && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-center text-gray-500">
          <p className="text-sm">검색 결과가 없습니다.</p>
          <p className="text-xs mt-1">심볼을 정확히 입력 후 "직접 추가"를 클릭하세요.</p>
        </div>
      )}
    </div>
  );
}
