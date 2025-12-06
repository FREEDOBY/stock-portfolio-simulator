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

  // 저장된 포트폴리오 로드
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

  // 포트폴리오 저장
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

  // 포트폴리오 삭제
  const handleDelete = (id: string) => {
    const updated = savedPortfolios.filter((p) => p.id !== id);
    setSavedPortfolios(updated);
    localStorage.setItem(SAVED_PORTFOLIOS_KEY, JSON.stringify(updated));
  };

  // 포트폴리오 로드
  const handleLoad = (portfolio: PortfolioItem[]) => {
    onLoad(portfolio);
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">저장된 포트폴리오</h3>
        <button
          onClick={() => setShowSaveModal(true)}
          disabled={currentPortfolio.length === 0}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            currentPortfolio.length > 0
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          현재 포트폴리오 저장
        </button>
      </div>

      {/* 저장 모달 */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 shadow-xl">
            <h4 className="text-lg font-semibold mb-4">포트폴리오 저장</h4>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="포트폴리오 이름"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setNewName('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!newName.trim()}
                className={`px-4 py-2 rounded-lg ${
                  newName.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 저장된 포트폴리오 목록 */}
      {savedPortfolios.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">
          저장된 포트폴리오가 없습니다
        </p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {savedPortfolios.map((saved) => (
            <div
              key={saved.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{saved.name}</p>
                <p className="text-xs text-gray-500">
                  {saved.portfolio.map((p) => p.symbol).join(', ')}
                </p>
              </div>
              <div className="flex gap-2 ml-2">
                <button
                  onClick={() => handleLoad(saved.portfolio)}
                  className="px-2 py-1 text-xs bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                >
                  불러오기
                </button>
                <button
                  onClick={() => handleDelete(saved.id)}
                  className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
