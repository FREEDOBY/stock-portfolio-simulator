import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { menuItems } from '../config/menuItems';

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

/**
 * @implements REQ-001, REQ-002, REQ-004, REQ-006, REQ-007
 * 전체 앱 레이아웃 - 사이드바 + 메인 콘텐츠
 */
export function Layout() {
  const [activeMenu, setActiveMenu] = useState(
    () => menuItems.find((m) => !m.disabled)?.id ?? ''
  );
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<string | undefined>(undefined);

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  const handleMenuChange = (id: string) => {
    setActiveMenu(id);
    setMobileMenuOpen(false);
    if (id !== 'macro-detail') {
      setDetailTab(undefined);
    }
  };

  const handleNavigateToDetail = (tab: string) => {
    setDetailTab(tab);
    setActiveMenu('macro-detail');
  };

  // 활성 메뉴 항목
  const activeItem = useMemo(() => {
    return menuItems.find((m) => m.id === activeMenu) ?? null;
  }, [activeMenu]);

  const ActiveComponent = activeItem?.component ?? null;
  const activeLabel = activeItem?.label ?? '';

  // ESC 키로 모바일 메뉴 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="flex h-screen bg-[#0a0e17] overflow-hidden">
      {/* 모바일 햄버거 버튼 */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-[#111827] border border-slate-700/50 rounded text-slate-400 hover:text-slate-200"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {mobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* 모바일 오버레이 */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 사이드바 - 데스크톱 */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar
          menuItems={menuItems}
          activeMenu={activeMenu}
          onMenuChange={handleMenuChange}
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* 사이드바 - 모바일 (오버레이) */}
      <div
        className={`md:hidden fixed left-0 top-0 z-40 transition-transform duration-300 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          menuItems={menuItems}
          activeMenu={activeMenu}
          onMenuChange={handleMenuChange}
          collapsed={false}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 min-w-0 overflow-y-auto" data-testid="main-content">
        {/* 콘텐츠 헤더 */}
        <div className="sticky top-0 z-10 bg-[#0a0e17]/95 backdrop-blur-sm border-b border-slate-700/30 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* 모바일 여백 */}
              <div className="md:hidden w-8"></div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <h1 className="text-base font-bold text-slate-300 uppercase tracking-wider font-mono">
                  {activeLabel}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm font-mono text-slate-600">
              <span>SESSION: <span className="text-amber-400">ACTIVE</span></span>
              <span className="hidden sm:inline">DATA: <span className="text-cyan-400">LIVE</span></span>
            </div>
          </div>
        </div>

        {/* 뷰 콘텐츠 */}
        <div className="p-6">
          {ActiveComponent && (
            <ActiveComponent
              initialTab={detailTab}
              onNavigateToDetail={handleNavigateToDetail}
            />
          )}
        </div>
      </div>
    </div>
  );
}
