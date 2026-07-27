import React from 'react';
import { AppProvider, useApp } from './hooks/useApp';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { SettingsPage } from './components/settings/SettingsPage';
import { CharacterManager } from './components/characters/CharacterManager';

import { ChatArea } from './components/chat/ChatArea';

function AppInner() {
  const { state, dispatch } = useApp();
  const isDark = state.theme === 'dark';

  const renderMainContent = () => {
    switch (state.activeView) {
      case 'chat': return <ChatArea />;
      case 'models': return <SettingsPage />;
      case 'characters': return <CharacterManager />;
      case 'worldbook': return <CharacterManager />;
      default: return <ChatArea />;
    }
  };
  const isChatView = state.activeView === 'chat';

  return (
    <div className={"h-screen w-screen flex flex-col overflow-hidden " + (isDark ? 'bg-[#111]' : 'bg-[#f5f5f5]')}>
      <TopBar />
      <div className="flex-1 flex overflow-hidden relative">
        {state.isMobile && state.sidebarOpen && <button aria-label="关闭侧栏" className="absolute inset-0 z-20 bg-black/30" onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })} />}
        {(isChatView || !state.isMobile || state.sidebarOpen) && (
      <div className={state.isMobile ? 'absolute inset-y-0 left-0 z-30 h-full shadow-2xl' : 'relative z-10 h-full'}>
            <Sidebar
              activeView={state.activeView}
              onViewChange={(view) => { dispatch({ type: 'SET_VIEW', view }); }}
            />
          </div>
        )}
        <main className={"relative flex-1 flex flex-col min-w-0 overflow-hidden " + (isChatView ? 'z-0' : 'z-20')}>
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
