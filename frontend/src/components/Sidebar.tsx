import { StatusBar } from './StatusBar';
import type { SidebarProps } from '../types/navigation';

/**
 * @implements REQ-001, REQ-002, REQ-003, REQ-005, REQ-009
 * 사이드바 네비게이션 컴포넌트
 */
export function Sidebar({
  menuItems,
  activeMenu,
  onMenuChange,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <div
      data-testid="sidebar"
      className={`bg-[#0d1117] border-r border-slate-700/50 flex flex-col h-screen transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[60px]' : 'w-[260px]'
      }`}
    >
      {/* Logo / Brand */}
      <div className="px-3 py-4 border-b border-slate-700/30">
        {collapsed ? (
          <div className="flex justify-center">
            <span className="text-emerald-400 font-mono font-bold text-lg">P</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span className="text-emerald-400 font-mono font-bold text-sm tracking-wider uppercase">
              Terminal
            </span>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = activeMenu === item.id;

          return (
            <button
              key={item.id}
              data-testid={`menu-item-${item.id}`}
              onClick={() => onMenuChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-200 relative group ${
                isActive
                  ? 'bg-cyan-500/10 border-l-2 border-l-cyan-400 text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border-l-2 border-l-transparent'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                <svg
                  className="w-[18px] h-[18px]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d={item.icon}
                  />
                </svg>
              </div>

              {/* Label - 펼침 모드에서만 표시 */}
              {!collapsed && (
                <span className="text-sm font-mono uppercase tracking-wider">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Status Bar */}
      <StatusBar collapsed={collapsed} />

      {/* Toggle Button */}
      <button
        data-testid="sidebar-toggle"
        onClick={onToggleCollapse}
        className="px-3 py-2.5 border-t border-slate-700/30 text-slate-600 hover:text-slate-400 transition-colors flex items-center justify-center"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
    </div>
  );
}
