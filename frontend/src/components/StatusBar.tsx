import { useState, useEffect } from 'react';

/**
 * @implements REQ-008
 * 하단 상태바 - 시스템 정보 표시
 */

interface StatusBarProps {
  collapsed: boolean;
}

export function StatusBar({ collapsed }: StatusBarProps) {
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const timer = setInterval(() => {
      setDateStr(new Date().toISOString().split('T')[0]);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  if (collapsed) {
    return (
      <div className="px-2 py-3 border-t border-slate-700/30">
        <div className="flex justify-center">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="System Active"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-slate-700/30 space-y-1">
      <div className="flex items-center gap-2 text-sm font-mono text-slate-600">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
        <span className="text-emerald-400/70">ONLINE</span>
      </div>
      <div className="text-sm font-mono text-slate-700">
        {dateStr}
      </div>
      <div className="text-sm font-mono text-slate-700">
        v1.0.0
      </div>
    </div>
  );
}
