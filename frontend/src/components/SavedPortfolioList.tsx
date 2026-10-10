import { useState, useEffect } from 'react';
import type { PortfolioItem, SavedPortfolio, SimulatorSettings } from '../types';
import { MAX_COMPARE } from '../utils/htmlExport';

const SAVED_PORTFOLIOS_KEY = 'saved-portfolios';

interface Props {
  currentPortfolio: PortfolioItem[];
  currentSettings: SimulatorSettings;
  onLoad: (portfolio: PortfolioItem[], settings?: SimulatorSettings) => void;
  onCompare: (selected: SavedPortfolio[]) => void;
  isComparing: boolean;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function SavedPortfolioList({
  currentPortfolio,
  currentSettings,
  onLoad,
  onCompare,
  isComparing,
}: Props) {
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem(SAVED_PORTFOLIOS_KEY);
    if (saved) {
      try {
        setSavedPortfolios(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved portfolios:', e);
      }
    }
  }, []);

  const persist = (updated: SavedPortfolio[]) => {
    setSavedPortfolios(updated);
    localStorage.setItem(SAVED_PORTFOLIOS_KEY, JSON.stringify(updated));
  };

  const existingWithName = savedPortfolios.find((p) => p.name === newName.trim());

  const handleSave = () => {
    if (!newName.trim() || currentPortfolio.length === 0) return;

    const now = new Date().toISOString();
    const name = newName.trim();
    let updated: SavedPortfolio[];
    if (existingWithName) {
      // 동일 이름은 덮어쓰기 (id·생성일 유지)
      updated = savedPortfolios.map((p) =>
        p.name === name
          ? { ...p, portfolio: currentPortfolio, settings: currentSettings, updatedAt: now }
          : p,
      );
    } else {
      updated = [
        ...savedPortfolios,
        {
          id: generateId(),
          name,
          portfolio: currentPortfolio,
          settings: currentSettings,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
    persist(updated);
    setNewName('');
    setShowSaveModal(false);
  };

  const handleDelete = (id: string) => {
    persist(savedPortfolios.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id);
      return next;
    });
  };

  const selectedList = savedPortfolios.filter((p) => selectedIds.has(p.id));
  const canCompare = selectedList.length >= 2 && !isComparing;

  return (
    <div className="bg-[#111827] border border-slate-700/50 rounded-lg p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono">Saved</h3>
        </div>
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={currentPortfolio.length === 0}
          className={`px-3 py-1 text-sm font-mono rounded transition-colors ${
            currentPortfolio.length > 0
              ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30'
              : 'bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed'
          }`}
        >
          SAVE
        </button>
      </div>

      {/* 저장 모달 */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#111827] border border-slate-600/50 rounded-lg p-6 w-96 shadow-2xl shadow-black/50">
            <h4 className="text-sm font-bold text-slate-300 mb-4 uppercase tracking-wider font-mono">Save Portfolio</h4>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Portfolio name..."
              className="w-full px-3 py-2 bg-[#0a0e17] border border-slate-600/50 rounded text-slate-200 text-sm font-mono placeholder-slate-600 mb-2 focus:border-cyan-500 focus:outline-none"
              autoFocus
            />
            {existingWithName && (
              <p className="text-xs text-amber-400 font-mono mb-2">
                같은 이름이 있습니다 — 저장하면 덮어씁니다
              </p>
            )}
            <p className="text-xs text-slate-600 font-mono mb-4">
              현재 비중과 시뮬레이션 설정(기간·금액·리밸런싱)이 함께 저장됩니다
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setNewName('');
                }}
                className="px-4 py-1.5 text-sm text-slate-500 hover:text-slate-400 font-mono rounded border border-slate-700 hover:border-slate-600 transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={!newName.trim()}
                className={`px-4 py-1.5 text-sm font-mono rounded transition-colors ${
                  newName.trim()
                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'
                    : 'bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed'
                }`}
              >
                {existingWithName ? 'OVERWRITE' : 'SAVE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 저장된 포트폴리오 목록 */}
      {savedPortfolios.length === 0 ? (
        <p className="text-slate-600 text-xs text-center py-4 font-mono">
          No saved portfolios
        </p>
      ) : (
        <>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {savedPortfolios.map((saved) => {
              const checked = selectedIds.has(saved.id);
              const selectDisabled = !checked && selectedIds.size >= MAX_COMPARE;
              return (
                <div
                  key={saved.id}
                  className={`flex items-center justify-between p-2.5 bg-[#0d1117] border rounded transition-colors ${
                    checked ? 'border-amber-500/50' : 'border-slate-700/30 hover:border-slate-600/50'
                  }`}
                >
                  <label
                    className={`flex items-center mr-2 ${selectDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                    title="비교 대상으로 선택"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={selectDisabled}
                      onChange={() => toggleSelect(saved.id)}
                      className="accent-amber-400 w-3.5 h-3.5"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-slate-300 truncate" title={saved.name}>{saved.name}</p>
                    <p
                      className="text-xs text-slate-600 font-mono truncate"
                      title={saved.portfolio.map((p) => `${p.symbol} ${p.weight}%`).join(' · ')}
                    >
                      {saved.portfolio.map((p) => `${p.symbol} ${p.weight}`).join(' | ')}
                    </p>
                  </div>
                  <div className="flex gap-1.5 ml-2">
                    <button
                      onClick={() => onLoad(saved.portfolio, saved.settings)}
                      className="px-2 py-1 text-sm bg-cyan-500/10 text-cyan-400 rounded hover:bg-cyan-500/20 font-mono border border-cyan-500/30 transition-colors"
                    >
                      LOAD
                    </button>
                    <button
                      onClick={() => handleDelete(saved.id)}
                      className="px-2 py-1 text-sm bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 font-mono border border-red-500/30 transition-colors"
                    >
                      DEL
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 비교 실행 */}
          <button
            onClick={() => onCompare(selectedList)}
            disabled={!canCompare}
            className={`w-full mt-3 px-3 py-2 text-sm font-mono rounded transition-colors ${
              canCompare
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                : 'bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed'
            }`}
          >
            {isComparing
              ? 'COMPARING...'
              : `COMPARE${selectedList.length > 0 ? ` (${selectedList.length})` : ''}`}
          </button>
          <p className="text-xs text-slate-600 font-mono mt-1.5 text-center">
            체크 2~{MAX_COMPARE}개 선택 → 현재 설정으로 동시 백테스트
          </p>
        </>
      )}
    </div>
  );
}
