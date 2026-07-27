import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ViewType } from '../../types';
import { useApp } from '../../hooks/useApp';
import { useConversations } from '../../hooks/useConversations';
import { useCharacters } from '../../hooks/useCharacters';
import { useModels } from '../../hooks/useModels';
import { generateId } from '../../utils/id';
import * as Stores from '../../db/stores';
import type { Conversation } from '../../types';
import { isImageSource } from '../../utils/image';

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

function MiniAvatar({ avatar }: { avatar?: string }) {
  if (isImageSource(avatar)) {
    return <img src={avatar} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />;
  }
  return <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center text-lg">{avatar || '💬'}</span>;
}

function compactText(value: string, max = 32): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function sidebarTime(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { state, dispatch } = useApp();
  const { conversations, loadConversations, deleteConversation } = useConversations();
  const { characters } = useCharacters();
  const { models } = useModels();
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingConvTitle, setEditingConvTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<Record<string, string>>({});
  const [conversationMeta, setConversationMeta] = useState<Record<string, { snippet: string; timestamp?: number }>>({});
  const [donateOpen, setDonateOpen] = useState(false);
  const isDark = state.theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    const query = searchQuery.trim().toLowerCase();
    const loadConversationIndex = async () => {
      const results = await Promise.all(conversations.map(async (conv) => {
        const nodes = await Stores.getMessageNodesByConversation(conv.id);
        const last = nodes[nodes.length - 1];
        const titleHit = query && conv.title.toLowerCase().includes(query);
        const messageHit = query
          ? [...nodes].reverse().find((node) => node.content.toLowerCase().includes(query))
          : undefined;
        const matchedText = messageHit?.content || (titleHit ? '匹配对话标题' : '');
        return {
          id: conv.id,
          meta: { snippet: compactText(last?.content || ''), timestamp: last?.timestamp },
          matchedText: compactText(matchedText, 42),
          matched: Boolean(titleHit || messageHit),
        };
      }));
      if (cancelled) return;
      const meta: Record<string, { snippet: string; timestamp?: number }> = {};
      const matches: Record<string, string> = {};
      for (const result of results) {
        meta[result.id] = result.meta;
        if (result.matched) matches[result.id] = result.matchedText;
      }
      setConversationMeta(meta);
      setSearchMatches(matches);
    };
    loadConversationIndex();
    return () => { cancelled = true; };
  }, [conversations, searchQuery]);

  useEffect(() => {
    if (!deletingId) return;
    const clearDeleteConfirm = () => setDeletingId(null);
    document.addEventListener('click', clearDeleteConfirm);
    return () => document.removeEventListener('click', clearDeleteConfirm);
  }, [deletingId]);

  const handleRenameStart = (conv: Conversation) => {
    setEditingConvId(conv.id);
    setEditingConvTitle(conv.title);
    setTimeout(() => titleInputRef.current?.select(), 10);
  };
  const handleRenameSave = async (id: string) => {
    if (!editingConvTitle.trim()) { setEditingConvId(null); return; }
    await Stores.updateConversation(id, { title: editingConvTitle.trim() });
    await loadConversations();
    setEditingConvId(null);
  };

  if (!state.sidebarOpen) return null;

  const handleDeleteConv = async (id: string) => {
    if (deletingId !== id) { setDeletingId(id); return; }
    await deleteConversation(id);
    if (state.currentConversationId === id) { dispatch({ type: 'SET_CONVERSATION', id: null }); }
    await loadConversations();
    setDeletingId(null);
  };

  const handleCreate = async (charId: string) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    const modelId = models.length > 0 ? models[0].id : null;
    const existing = await Stores.getAllConversations();
    const usedTitles = new Set(existing.filter((item) => item.characterId === charId).map((item) => item.title));
    let title = char.name;
    let suffix = 2;
    while (usedTitles.has(title)) title = `${char.name} (${suffix++})`;
    const conv: Conversation = {
      id: generateId(),
      title,
      characterId: char.id,
      modelId,
    };
    await Stores.addConversation(conv);
    window.dispatchEvent(new CustomEvent('jg2-conversations-changed'));
    await loadConversations();
    dispatch({ type: 'SET_CONVERSATION', id: conv.id });
    if (state.isMobile && state.sidebarOpen) dispatch({ type: 'TOGGLE_SIDEBAR' });
    setShowNewConvModal(false);
  };

  const sideBg = isDark ? 'bg-[#242424]' : 'bg-[#f0f0f0]';
  const sideBorder = isDark ? 'border-[#383838]' : 'border-[#dedede]';
  const convHover = isDark ? 'hover:bg-[#303030]' : 'hover:bg-[#e6e6e6]';
  const convActive = isDark ? 'bg-[#277b57]' : 'bg-[#12b76a]';
  const txt = isDark ? 'text-[#d8d8d8]' : 'text-[#1a1a1a]';
  const txt2 = isDark ? 'text-[#888]' : 'text-[#777]';
  const visibleConversations = searchQuery.trim()
    ? conversations.filter((conv) => Boolean(searchMatches[conv.id]))
    : conversations;

  return (
    <aside onClick={() => { if (deletingId) setDeletingId(null); }} className={"w-[240px] h-full flex-shrink-0 flex flex-col border-r " + sideBorder + " " + sideBg}>
      <div className={"px-3 pt-3 pb-2 border-b " + sideBorder}>
        <div className="flex items-center gap-2">
          <div className={"flex-1 h-8 flex items-center gap-1.5 px-2 rounded-lg " + (isDark ? 'bg-[#303030]' : 'bg-white')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={txt2}>
              <circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>
            </svg>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索" className={"min-w-0 flex-1 bg-transparent outline-none text-xs " + txt}/>
          </div>
          <button onClick={() => {
            if (characters.length === 0) { onViewChange('characters'); return; }
            setShowNewConvModal(true);
          }} className="w-9 h-9 flex items-center justify-center rounded-[10px] bg-[#07c160] hover:bg-[#06ad56] text-white shadow-md transition-all hover:scale-105" title="新建对话" aria-label="新建对话">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {visibleConversations.length === 0 ? (
          <p className={"text-xs text-center mt-8 px-3 " + txt2}>{searchQuery.trim() ? '没有找到相关消息' : '暂无对话'}</p>
        ) : (
          visibleConversations.map((conv) => {
            const char = characters.find((c) => c.id === conv.characterId);
            const isActive = state.currentConversationId === conv.id;
            return (
              <div key={conv.id}
                className={"group px-3 py-2.5 cursor-pointer transition-colors " + (isActive ? convActive : convHover)}
                onClick={() => { dispatch({ type: 'SET_CONVERSATION', id: conv.id }); if (state.isMobile && state.sidebarOpen) dispatch({ type: 'TOGGLE_SIDEBAR' }); }}>
                <div className="flex items-center gap-2.5">
                  <MiniAvatar avatar={char?.avatar} />
                  <div className="flex-1 min-w-0" onDoubleClick={(e) => { e.stopPropagation(); handleRenameStart(conv); }}>
                    {editingConvId === conv.id ? (
                      <input ref={titleInputRef} value={editingConvTitle}
                        onChange={(e) => setEditingConvTitle(e.target.value)}
                        onBlur={() => handleRenameSave(conv.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSave(conv.id); if (e.key === 'Escape') setEditingConvId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className={"w-full text-sm px-1 py-0.5 rounded outline-none " + (isDark ? 'bg-[#1a1a1a] text-[#e0e0e0]' : 'bg-white text-[#333] border border-[#ddd]')}/>
                    ) : (
                      <div className={"flex items-center justify-between gap-1 text-sm truncate " + (isActive ? 'text-white' : txt)}>
                        <span className="truncate">{conv.title}</span>
                        <span className={"flex-shrink-0 text-[10px] " + (isActive ? 'text-white/70' : txt2)}>{sidebarTime(conversationMeta[conv.id]?.timestamp)}</span>
                      </div>
                    )}
                    <div className={"text-[11px] truncate mt-0.5 " + (isActive ? 'text-white/75' : txt2)}>
                      {searchQuery.trim() ? searchMatches[conv.id] : conversationMeta[conv.id]?.snippet || '暂无消息'}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteConv(conv.id); }}
                    className={"flex-shrink-0 ml-1 rounded text-[10px] transition-colors " + (deletingId === conv.id ? 'px-2 py-1 font-medium bg-red-500 hover:bg-red-600 text-white shadow-sm' : (isDark ? 'px-1.5 py-0.5 text-[#555] opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-900/20' : 'px-1.5 py-0.5 text-[#bbb] opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50'))}
                    title={deletingId === conv.id ? '再次点击确认删除' : '删除对话'}>
                    {deletingId === conv.id ? '确认' : '✕'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button onClick={() => setDonateOpen(true)} className={"flex-shrink-0 px-3 py-2.5 border-t text-xs text-center transition-colors " + sideBorder + " " + (isDark ? 'text-[#c9a227] hover:bg-[#303030]' : 'text-[#9a7410] hover:bg-[#e8e8e8]')}>
        ☕ 请作者喝杯咖啡
      </button>

      {showNewConvModal && createPortal((
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4" onClick={() => setShowNewConvModal(false)}>
          <div className={"rounded-xl p-4 w-72 max-h-80 overflow-y-auto shadow-xl " + (isDark ? 'bg-[#2e2e2e] border border-[#3a3a3a]' : 'bg-white border border-[#e0e0e0]')}
            onClick={(e) => e.stopPropagation()}>
            <h3 className={"text-sm font-semibold mb-3 " + txt}>选择角色卡</h3>
            {characters.length === 0 ? (
              <p className={"text-xs " + txt2}>还没有角色卡。</p>
            ) : (
              <div className="space-y-0.5">
                {characters.map((char) => (
                  <button key={char.id} onClick={() => handleCreate(char.id)}
                    className={"w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left " +
                      (isDark ? 'hover:bg-[#3a3a3a]' : 'hover:bg-[#f0f0f0]')}>
                    <MiniAvatar avatar={char.avatar} />
                    <span className={"text-sm " + txt}>{char.name}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowNewConvModal(false)}
              className={"w-full mt-3 py-1.5 text-xs rounded-lg transition-colors " +
                (isDark ? 'bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#999]' : 'bg-[#eee] hover:bg-[#ddd] text-[#666]')}>取消</button>
          </div>
        </div>
      ), document.body)}

      {donateOpen && createPortal((
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4" onClick={() => setDonateOpen(false)}>
          <div className={"w-[min(92vw,360px)] rounded-2xl p-4 shadow-2xl text-center " + (isDark ? 'bg-[#252525] text-[#e0e0e0]' : 'bg-white text-[#222]')} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold">☕ 请作者喝杯咖啡</h3><button onClick={() => setDonateOpen(false)} className="text-lg leading-none opacity-60 hover:opacity-100">×</button></div>
            <p className={"text-xs leading-5 mb-3 " + (isDark ? 'text-[#bbb]' : 'text-[#666]')}>如果这个项目对你有帮助，欢迎支持继续开发与维护。</p>
            <img src="./donate-qr.jpg" alt="捐赠二维码" className="w-full max-h-[58vh] object-contain rounded-lg" />
          </div>
        </div>
      ), document.body)}
    </aside>
  );
}
