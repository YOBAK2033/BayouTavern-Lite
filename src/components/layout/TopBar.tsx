import React, { useEffect, useState } from 'react';
import { useApp } from '../../hooks/useApp';
import { safeGetLocalStorage, safeSetLocalStorage } from '../../utils/safeStorage';

export function TopBar() {
  const { state, dispatch } = useApp();
  const isDark = state.theme === 'dark';
  const [showTutorialHint, setShowTutorialHint] = useState(false);

  useEffect(() => {
    if (safeGetLocalStorage('jg2_tutorial_hint_seen') === '1') return;
    setShowTutorialHint(true);
    const timer = window.setTimeout(() => {
      safeSetLocalStorage('jg2_tutorial_hint_seen', '1');
      setShowTutorialHint(false);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, []);

  const topTabs = [
    { view: 'tutorial' as const, label: '教程' },
    { view: 'characters' as const, label: '卡包' },
    { view: 'models' as const, label: '设置' },
  ];

  const bg = isDark ? 'bg-[#2e2e2e] border-[#3a3a3a]' : 'bg-[#f5f5f5] border-[#e2e2e2]';
  const txt = isDark ? 'text-[#e0e0e0]' : 'text-[#1a1a1a]';
  const btn = isDark ? 'hover:bg-[#3a3a3a] text-[#999]' : 'hover:bg-[#e0e0e0] text-[#555]';
  const activeBtn = isDark ? 'bg-[#3a5a3a] text-[#6ecf6e]' : 'bg-[#d4f5d4] text-[#2a7a2a]';
  const inactiveBtn = isDark ? 'text-[#999] hover:bg-[#3a3a3a]' : 'text-[#555] hover:bg-[#e0e0e0]';
  const themeBtn = isDark ? 'bg-[#3a3a3a] text-[#ccc] hover:bg-[#4a4a4a]' : 'bg-[#e0e0e0] text-[#444] hover:bg-[#d0d0d0]';
  const toggleTheme = () => {
    safeSetLocalStorage('jg2_theme_preference_set', '1');
    dispatch({ type: 'SET_THEME', theme: isDark ? 'light' : 'dark' });
  };

  return (
    <header className={"h-12 flex-shrink-0 flex items-center justify-between px-4 border-b " + bg}>
      <div className="flex items-center gap-3">
        <button onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className={"p-1.5 rounded " + btn}
          aria-label={state.sidebarOpen ? '收起侧栏' : '展开侧栏'}
          title={state.sidebarOpen ? '收起侧栏' : '展开侧栏'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>
        <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'chat' })}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="返回主页" title="返回主页">
          <h1 className={"text-base font-semibold " + txt}>BayouTavern Lite</h1><span className={"px-1.5 py-0.5 rounded text-[9px] font-medium " + (isDark ? 'bg-[#3a3a3a] text-[#aaa]' : 'bg-[#e5e5e5] text-[#777]')}>经典版</span>
        </button>
      </div>
      <div className="flex items-center gap-1">
        {topTabs.map((tab) => (
          <div key={tab.view} className="relative">
            {tab.view === 'tutorial' && showTutorialHint && (
              <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-44 animate-bounce rounded-lg border border-[#3cb371]/40 bg-white px-3 py-2 text-center text-[11px] font-medium text-[#2a7a2a] shadow-lg dark:border-[#6ecf6e]/40 dark:bg-[#242424] dark:text-[#9be59b]">
                👋 新手先来看看教程吧！✨
                <span className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-[#3cb371]/40 bg-white dark:border-[#6ecf6e]/40 dark:bg-[#242424]" />
              </div>
            )}
            <button key={tab.view} onClick={() => {
              if (tab.view === 'tutorial') {
                safeSetLocalStorage('jg2_tutorial_hint_seen', '1');
                setShowTutorialHint(false);
              }
              dispatch({ type: 'SET_VIEW', view: tab.view });
            }}
              className={"px-2.5 py-1 text-xs rounded transition-colors " +
                (state.activeView === tab.view ? activeBtn : inactiveBtn)}>
              {tab.label}
            </button>
          </div>
        ))}
        <button onClick={toggleTheme}
          className={"ml-1 px-2 py-1 text-xs rounded transition-colors " + themeBtn}
          title={isDark ? '切换到日间模式' : '切换到夜间模式'}>
          {isDark ? '☀' : '🌙'}
        </button>
      </div>
    </header>
  );
}
