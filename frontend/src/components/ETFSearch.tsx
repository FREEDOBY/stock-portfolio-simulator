import { useState, useEffect, useRef } from 'react';
import { searchETF } from '../api';
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
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ETF 검색 (예: SPY, QQQ)"
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {isLoading && (
        <div className="absolute right-3 top-2.5">
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
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
              <span className="ml-2 text-gray-600 text-sm">{etf.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
