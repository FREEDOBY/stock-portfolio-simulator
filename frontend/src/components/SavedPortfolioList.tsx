import { useState, useEffect } from 'react';
import type { PortfolioItem, SavedPortfolio } from '../types';

const SAVED_PORTFOLIOS_KEY = 'saved-portfolios';

interface Props {
  currentPortfolio: PortfolioItem[];
  onLoad: (portfolio: PortfolioItem[]) => void;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function SavedPortfolioList({ currentPortfolio, onLoad }: Props) {
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newName, setNewName] = useState('');

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

  const handleSave = () => {
    if (!newName.trim() || currentPortfolio.length === 0) return;

    const now = new Date().toISOString();
    const newPortfolio: SavedPortfolio = {
      id: generateId(),
      name: newName.trim(),
      portfolio: currentPortfolio,
      createdAt: now,
      updatedAt: now,
    };

    const updated = [...savedPortfolios, newPortfolio];
    setSavedPortfolios(updated);
    localStorage.setItem(SAVED_PORTFOLIOS_KEY, JSON.stringify(updated));

    setNewName('');
    setShowSaveModal(false);
  };

  const handleDelete = (id: string) => {
    const updated = savedPortfolios.filter((p) => p.id !== id);
    setSavedPortfolios(updated);
    localStorage.setItem(SAVED_PORTFOLIOS_KEY, JSON.stringify(updated));
  };

  const handleLoad = (portfolio: PortfolioItem[]) => {
    onLoad(portfolio);
  };

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
              className="w-full px-3 py-2 bg-[#0a0e17] border border-slate-600/50 rounded text-slate-200 text-sm font-mono placeholder-slate-600 mb-4 focus:border-cyan-500 focus:outline-none"
              autoFocus
            />
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
                SAVE
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
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {savedPortfolios.map((saved) => (
            <div
              key={saved.id}
              className="flex items-center justify-between p-2.5 bg-[#0d1117] border border-slate-700/30 rounded hover:border-slate-600/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm text-slate-300 truncate" title={saved.name}>{saved.name}</p>
                <p className="text-xs text-slate-600 font-mono">
                  {saved.portfolio.map((p) => p.symbol).join(' | ')}
                </p>
              </div>
              <div className="flex gap-1.5 ml-2">
                <button
                  onClick={() => handleLoad(saved.portfolio)}
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
          ))}
        </div>
      )}
    </div>
  );
}
