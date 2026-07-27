import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../../hooks/useApp';
import { useModels } from '../../hooks/useModels';
import { useCharacters } from '../../hooks/useCharacters';
import { useChat } from '../../hooks/useChat';
import { generateId } from '../../utils/id';
import * as Stores from '../../db/stores';
import type { Conversation, MessageNode, Character, StatusBarTemplate, StatusBarSnapshot, ExtensionModule, GalleryCard } from '../../types';
import { StatusBarCard } from './StatusBarCard';
import { GalleryCardView } from './GalleryCardView';
import { isImageSource } from '../../utils/image';

function AvatarImg({ src, alt, size }: { src?: string; alt: string; size: string }) {
  const dims = size === 'lg' ? 'w-10 h-10 text-xl' : 'w-8 h-8 text-base';
  if (isImageSource(src)) {
    return <img src={src} alt={alt} className={dims + " rounded object-cover flex-shrink-0"}/>;
  }
  return <span className={dims + " flex-shrink-0 flex items-center justify-center"}>{alt || '🎭'}</span>;
}

function isDebugMode(): boolean {
  try { return localStorage.getItem('jg2_debug_mode') === 'true'; } catch { return false; }
}



function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

function TokenInfo({ node, txt }: { node: MessageNode; txt: string }) {
  const [showDetail, setShowDetail] = useState(false);
  if (node.tokenCostTotal === undefined) return null;
  return (
    <span className={"text-[10px] cursor-pointer select-none " + txt}
      onMouseEnter={() => setShowDetail(true)} onMouseLeave={() => setShowDetail(false)}
      onClick={() => setShowDetail(!showDetail)}>
      {showDetail
        ? <span>入{node.tokenCostInput ?? '?'} 出{node.tokenCost} = {node.tokenCostTotal} t</span>
        : <span>{node.tokenCostTotal} tokens</span>}
    </span>
  );
}

function MiniAvatar({ avatar, size }: { avatar?: string; size?: string }) {
  const s = size === 'sm' ? 'w-10 h-10 text-xl' : 'w-10 h-10 text-xl';
  if (isImageSource(avatar)) {
    return React.createElement('img', { src: avatar, alt: '', className: s + ' rounded object-cover flex-shrink-0' });
  }
  return React.createElement('span', { className: s + ' flex-shrink-0 flex items-center justify-center' }, avatar || '🎭');
}

export function ChatArea() {
  const { state, dispatch } = useApp();
  const { models } = useModels();
  const { characters } = useCharacters();
  const isDark = state.theme === 'dark';

  const [nodes, setNodes] = useState<MessageNode[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const debugAllowed = isDebugMode() && character?.protectionMode !== 'protected';
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const msgListRef = React.useRef<HTMLDivElement>(null);
  const shouldAutoScroll = React.useRef(true);
  const followReplyRef = React.useRef(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [extensions, setExtensions] = useState<ExtensionModule[]>([]);
  const [galleryCards, setGalleryCards] = useState<GalleryCard[]>([]);
  const [extensionButtonStyle, setExtensionButtonStyle] = useState<NonNullable<ExtensionModule['buttonStyle']>>(() => {
    try { return (localStorage.getItem('jg2_extension_button_style') as NonNullable<ExtensionModule['buttonStyle']>) || 'default'; } catch { return 'default'; }
  });
  const [extensionShowIcons, setExtensionShowIcons] = useState(() => {
    try { return localStorage.getItem('jg2_extension_show_icons') !== 'false'; } catch { return true; }
  });

  const loadConversation = useCallback(async () => {
    if (!state.currentConversationId) {
      setConversation(null); setCharacter(null); setNodes([]); return;
    }
    const conv = await Stores.getConversationById(state.currentConversationId);
    if (!conv) return;
    setConversation(conv);
    const char = conv.characterId ? await Stores.getCharacterById(conv.characterId) : null;
    setCharacter(char || null);
    const msgs = await Stores.getMessageNodesByConversation(conv.id);
    setNodes(msgs);
    shouldAutoScroll.current = true;
    followReplyRef.current = true;
    // Scroll to bottom after loading
    setTimeout(() => {
      const el = msgListRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 100);
  }, [state.currentConversationId]);

  useEffect(() => { loadConversation(); setThinkingEnabled(false); }, [state.currentConversationId, state.activeView]);

  useEffect(() => {
    let active = true;
    const loadExtensions = () => Promise.all([Stores.getAllExtensionModules(), Stores.getAllGalleryCards()]).then(([modules, cards]) => {
      if (active) { setExtensions(modules.filter((module) => module.type === 'model-shortcut' || module.type === 'gallery-shortcut')); setGalleryCards(cards); }
    });
    void loadExtensions();
    window.addEventListener('jg2:extensions-changed', loadExtensions);
    const loadExtensionStyle = () => {
      try {
        setExtensionButtonStyle((localStorage.getItem('jg2_extension_button_style') as NonNullable<ExtensionModule['buttonStyle']>) || 'default');
        setExtensionShowIcons(localStorage.getItem('jg2_extension_show_icons') !== 'false');
      } catch {}
    };
    window.addEventListener('jg2:extensions-style-changed', loadExtensionStyle);
    window.addEventListener('jg2:statusbar-synced', loadConversation);
    return () => {
      active = false;
      window.removeEventListener('jg2:extensions-changed', loadExtensions);
      window.removeEventListener('jg2:extensions-style-changed', loadExtensionStyle);
      window.removeEventListener('jg2:statusbar-synced', loadConversation);
    };
  }, [character?.id, loadConversation]);

  // Scroll on conversation switch
  



  const chatDeps = {
    conversation, getModelById: Stores.getModelById, onNodesRefresh: setNodes,
    memoryEnabled: state.subAIConfig.enabled,
    thinkingEnabled: thinkingEnabled,
    recentRounds: (() => { try { return parseInt(localStorage.getItem('jg2_ctx_rounds') || '20'); } catch { return 20; } })(),
    maxWorldBookEntries: (() => { try { return parseInt(localStorage.getItem('jg2_ctx_wb') || '3'); } catch { return 3; } })(),
    maxMemoryEntries: (() => { try { return parseInt(localStorage.getItem('jg2_ctx_mem') || '5'); } catch { return 5; } })(),
    tplUserWrapper: state.tplUserWrapper, tplIdentityAnchor: state.tplIdentityAnchor,
    tplMemoryPrefix: state.tplMemoryPrefix,
    tplOpeningLinePrefix: state.tplOpeningLinePrefix, tplWorldBookPrefix: state.tplWorldBookPrefix,
    subAIModelId: state.subAIConfig.modelId,
    memoryTriggerInterval: state.subAIConfig.triggerInterval,
    subAIPrompt: state.subAIConfig.customSystemPrompt,
  };

  const { streaming, streamingContent, streamingReasoning, error, setError, sendMessage, abortStream, getLastPrompt } = useChat(chatDeps);
  const [input, setInput] = useState('');
  const [showQuickCommands, setShowQuickCommands] = useState(true);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = msgListRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    shouldAutoScroll.current = true;
    setShowScrollBtn(false);
  }, []);

  // Keep the newest user message and the live reply visible while the DOM grows.
  // A layout effect prevents the one-frame jump that was visible between stream chunks.
  React.useLayoutEffect(() => {
    if (streaming || shouldAutoScroll.current || followReplyRef.current) {
      scrollToLatest('auto');
    }
  }, [nodes, streaming, streamingContent, streamingReasoning, scrollToLatest]);

  const scrollToBottom = () => { scrollToLatest('smooth'); };

  const handleSend = () => {
    const t = input.trim();
    if (!t) return;
    followReplyRef.current = true;
    shouldAutoScroll.current = true;
    setInput('');
    sendMessage(t);
    requestAnimationFrame(() => scrollToLatest('auto'));
  };

  const activeExtensions = character
    ? extensions.filter((module) => module.enabled && module.characterIds.includes(character.id))
    : [];

  const quickButtonClass = (module: ExtensionModule) => {
    const style = extensionButtonStyle;
    if (style === 'black') return isDark ? 'bg-[#111] border-[#444] text-white hover:bg-[#222]' : 'bg-[#111] border-[#111] text-white hover:bg-[#222]';
    if (style === 'white') return 'bg-white border-[#ddd] text-[#333] hover:bg-[#f5f5f5]';
    if (style === 'borderless') return isDark ? 'bg-[#2a2a2a] border-transparent text-[#ddd] hover:bg-[#333]' : 'bg-white border-transparent text-[#555] hover:bg-[#f5f5f5]';
    if (style === 'green') return 'bg-[#3cb371] border-[#3cb371] text-white hover:bg-[#45c181]';
    return isDark ? 'bg-[#2a2a2a] border-[#4a4a4a] text-[#ddd] hover:bg-[#333]' : 'bg-[#fafafa] border-[#ddd] text-[#555] hover:bg-[#f3f3f3]';
  };

  const handleExtensionClick = async (module: ExtensionModule) => {
    if (!conversation || !character || streaming) return;
    if (module.type === 'model-shortcut') {
      if (module.prompt?.trim()) {
        followReplyRef.current = true;
        shouldAutoScroll.current = true;
        await sendMessage(module.prompt.trim(), { hidden: true, source: 'shortcut' });
      }
      return;
    }
    const card = galleryCards.find((item) => item.id === module.galleryCardId);
    if (!card || card.items.length === 0) return;
    const node: MessageNode = {
      id: generateId(), conversationId: conversation.id, role: 'assistant', senderName: character.name,
      content: card.title, isArchived: false, timestamp: Date.now(), source: 'gallery', displayType: 'gallery', gallery: JSON.parse(JSON.stringify(card)),
    };
    await Stores.addMessageNode(node);
    setNodes(await Stores.getMessageNodesByConversation(conversation.id));
    requestAnimationFrame(() => scrollToLatest('smooth'));
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleDeleteNode = async (nodeId: string) => {
    await Stores.deleteMessageNode(nodeId);
    await loadConversation();
  };

  const handleConversationModelChange = async (modelId: string) => {
    if (!conversation || !modelId) return;
    await Stores.updateConversation(conversation.id, { modelId });
    await loadConversation();
  };

  const handleRegenerate = async (nodeId: string) => {
    const idx = nodes.findIndex((n) => n.id === nodeId);
    if (idx <= 0) return;
    const prevNode = nodes[idx - 1];
    if (prevNode?.role !== 'user') return;
    await Stores.deleteMessageNode(nodeId);
    await loadConversation();
    sendMessage(prevNode.content);
  };

  const handleQuickCreate = async (charId: string) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    const existingConversations = await Stores.getAllConversations();
    const usedTitles = new Set(existingConversations.filter((item) => item.characterId === charId).map((item) => item.title));
    let title = char.name;
    let suffix = 2;
    while (usedTitles.has(title)) title = `${char.name} (${suffix++})`;
    const conv: Conversation = {
      id: generateId(), title,
      characterId: char.id, modelId: (() => {
        try {
          const saved = localStorage.getItem('jg2_active_model');
          return (saved && models.some((model) => model.id === saved) ? saved : models[0]?.id) || null;
        } catch { return models[0]?.id || null; }
      })(),
    };
    await Stores.addConversation(conv);
    window.dispatchEvent(new CustomEvent('jg2-conversations-changed'));
    dispatch({ type: 'SET_CONVERSATION', id: conv.id });
  };

  // Colors
  const chatBg = isDark ? 'bg-[#111]' : 'bg-[#f5f5f5]';
  const topBg = isDark ? 'bg-[#2e2e2e] border-b border-[#3a3a3a]' : 'bg-[#f5f5f5] border-b border-[#e2e2e2]';
  const selfBubble = isDark ? 'bg-[#3a5a3a]' : 'bg-[#95ec69]';
  const aiBubble = isDark ? 'bg-[#2a2a2a]' : 'bg-white';
  const aiBubbleBorder = isDark ? '' : 'border border-[#ededed]';
  const txt = isDark ? 'text-[#e0e0e0]' : 'text-[#1a1a1a]';
  const txt2 = isDark ? 'text-[#999]' : 'text-[#888]';
  const txtInfo = isDark ? 'text-[#666]' : 'text-[#b0b0b0]';
  const selfTxt = isDark ? 'text-[#d0f0d0]' : 'text-[#0a3d0a]';
  const errBg = isDark ? 'bg-red-900/30 border-red-800/30 text-red-300' : 'bg-red-50 border-red-200 text-red-600';
  const latestAssistantId = [...nodes].reverse().find((item) => item.role === 'assistant')?.id;
  const featuredCharacters = React.useMemo(() => {
    const shuffled = [...characters];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled.slice(0, 5);
  }, [characters]);

  if (!conversation) {
    return (
      <div className={"relative flex-1 overflow-y-auto " + chatBg}>
        <div className="min-h-full max-w-5xl mx-auto px-3 sm:px-6 py-8 sm:py-12">
          <div className="text-center mb-9">
            <div className="flex justify-center mb-4">
              <div className={"w-[min(65vw,220px)] rounded-2xl overflow-hidden border shadow-sm " + (isDark ? 'border-[#3a3a3a]' : 'border-[#e2e2e2]')}>
                <img src="./welcome.gif" alt="欢迎表情" className="block w-full h-auto object-contain" />
              </div>
            </div>
            <p className={"mt-2 text-sm leading-7 " + txt2}><strong>欢迎来到😊BayouTavern Lite😊</strong><br/>可新建对话选择角色卡游玩，或创建自己的角色卡进行游玩。</p>
          </div>
          {characters.length === 0 ? (
            <div className={"text-center text-sm space-y-2 " + txt2}>
              <p>请先创建角色卡和配置模型</p>
              <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'models' })} className="text-[#3cb371] underline mr-3">模型管理</button>
              <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'characters' })} className="text-[#3cb371] underline">角色管理</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-4xl mx-auto">
              {featuredCharacters.map((char) => (
                <button key={char.id} onClick={() => handleQuickCreate(char.id)} className="group min-w-0 w-full max-w-[160px] mx-auto text-left">
                  <div className={"relative aspect-[2/3] rounded-2xl overflow-hidden border shadow-sm transition-all group-hover:-translate-y-1 group-hover:shadow-lg " + (isDark ? 'border-[#3a3a3a]' : 'border-[#e1e1e1')}>
                    {char.coverImage ? <img src={char.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover"/> : <div className="absolute inset-0 bg-gradient-to-br from-[#d9f5e6] via-[#f7f7f7] to-[#c8e8d5]"/>}
                  </div>
                  <div className="mt-2 px-1">
                    <p className={"text-sm font-medium truncate " + txt}>{char.name}</p>
                    {char.openingLine && <p className={"mt-1 text-xs line-clamp-2 " + txt2}>{char.openingLine}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className={"absolute left-1/2 -translate-x-1/2 bottom-3 text-center text-[10px] whitespace-nowrap " + txtInfo}>本项目Yobak创建并负责后续维护。</p>
      </div>
    );
  }

  return (
    <div className={"flex-1 flex flex-col overflow-hidden relative " + chatBg}>
      {/* Top bar */}
      <div className={"h-12 flex-shrink-0 flex items-center gap-2 px-4 " + topBg}>
        {character && (
          <>
            <MiniAvatar avatar={character?.avatar} size="sm" />
            <span className={"text-sm font-medium " + txt}>{character.name}</span>
            {character.worldBookId && <span className="text-xs text-[#6ecf6e]">📖</span>}
          </>
        )}
        <select value={conversation.modelId || ''} onChange={(event) => void handleConversationModelChange(event.target.value)}
          className={"ml-2 max-w-[180px] bg-transparent text-xs outline-none " + txt2} title="此对话的主模型">
          {!conversation.modelId && <option value="">选择主模型</option>}
          {conversation.modelId && !models.some((item) => item.id === conversation.modelId) && <option value={conversation.modelId}>已删除的模型（请重新选择）</option>}
          {models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="ml-auto"/>
      </div>

      {/* Messages */}
      <div ref={msgListRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 space-y-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          setShowScrollBtn(distFromBottom > 200);
          if (streaming && followReplyRef.current) {
            shouldAutoScroll.current = true;
            if (distFromBottom > 24) el.scrollTop = el.scrollHeight;
          } else {
            shouldAutoScroll.current = distFromBottom < 50;
            if (distFromBottom > 80) followReplyRef.current = false;
          }
        }}>
        {nodes.length === 0 && character?.openingLine && (
          <div className="text-center pt-12">
            <p className={"text-sm whitespace-pre-wrap " + txtInfo}>{character.openingLine}</p>
          </div>
        )}

        {nodes.map((node) => {
          const n = node as any;
          if (node.hidden) return null;
          if (node.displayType === 'gallery' && node.gallery) {
            return <div key={node.id} className="flex justify-start items-start gap-2 max-w-[88%] sm:max-w-[70%]"><AvatarImg src={character?.avatar} alt={character?.avatar || '🤖'} size="lg" /><GalleryCardView card={node.gallery} isDark={isDark} /></div>;
          }
          const isUser = node.role === 'user';
          const isLatestAssistant = !isUser && node.id === latestAssistantId;
          return (
            <React.Fragment key={node.id}>
              {thinkingEnabled && n.reasoning && (
                <div className="flex justify-center">
                  <div className={"max-w-[70%] px-4 py-2 rounded-lg text-xs whitespace-pre-wrap leading-relaxed " +
                    (isDark ? 'bg-purple-900/10 text-purple-300 border border-purple-700/20' : 'bg-purple-50 text-purple-700 border border-purple-200')}>
                    <div className="font-medium mb-1 text-purple-500">🧠 思考过程</div>
                    {n.reasoning}
                  </div>
                </div>
              )}
              <div className={"flex " + (isUser ? 'justify-end' : 'justify-start')}>
                  <div className="flex items-start gap-2 max-w-[88%] sm:max-w-[70%]">
                  {!isUser && <AvatarImg src={character?.avatar} alt={character?.avatar || '🤖'} size="lg" />}
                  <div className="flex flex-col min-w-0">
                    <div className={"px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed break-words " +
                      (isUser
                        ? selfBubble + ' rounded-lg rounded-tr-sm'
                        : aiBubble + ' rounded-lg rounded-tl-sm ' + aiBubbleBorder)}>
                      <span className={isUser ? selfTxt : txt}>{node.content}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 px-1">
                      <TokenInfo node={node} txt={txtInfo} />
                      <span className={"text-[10px] " + txtInfo}>{formatTime(node.timestamp)}</span>
                      {!isUser && (
                        <>
                          {debugAllowed && (
                            <button onClick={() => {
                              const messages = getLastPrompt();
                              if (!messages || messages.length === 0) return;
                              const data = { exportedAt: new Date().toISOString(), messageCount: messages.length, messages: messages.map((m: any) => ({ role: m.role, content: m.content })) };
                              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                              a.download = 'prompt_' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.json';
                              a.click(); URL.revokeObjectURL(a.href);
                            }}
                              className={"text-[10px] px-1 rounded " + (isDark ? 'hover:bg-[#444] text-[#888]' : 'hover:bg-[#e0e0e0] text-[#aaa]')}
                              title="导出原始 Prompt">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
                                <polyline points="7 11 12 16 17 11"/>
                                <line x1="12" y1="4" x2="12" y2="16"/>
                              </svg>
                            </button>
                          )}
                          <button onClick={() => handleRegenerate(node.id)}
                            className={"text-[10px] px-1 rounded " + (isDark ? 'hover:bg-[#444] text-[#888]' : 'hover:bg-[#e0e0e0] text-[#aaa]')}
                            title="重新生成">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/>
                      <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
                    </svg>
                  </button>
                          <button onClick={() => handleDeleteNode(node.id)}
                            className={"text-[10px] px-1 rounded " + (isDark ? 'hover:bg-red-900/30 text-[#888]' : 'hover:bg-red-50 text-[#aaa]')}
                            title="删除">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                  </button>
                        </>
                      )}
                    </div>
                    {isLatestAssistant && character?.statusBarTemplate && (
                      <StatusBarCard
                        template={character.statusBarTemplate}
                        snapshot={node.statusBarData}
                        isDark={isDark}
                      />
                    )}
                  </div>
                  {isUser && (() => {
    const ua = (() => { try { return localStorage.getItem('jg2_user_avatar') || ''; } catch { return ''; } })();
    return <AvatarImg src={ua} alt="👤" size="lg" />;
  })()}
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* streaming thinking */}
        {streaming && streamingReasoning && thinkingEnabled && (
          <div className="flex justify-center">
            <div className={"max-w-[70%] px-4 py-2 rounded-lg text-xs whitespace-pre-wrap leading-relaxed " +
              (isDark ? 'bg-purple-900/10 text-purple-300 border border-purple-700/20' : 'bg-purple-50 text-purple-700 border border-purple-200')}>
              <div className="font-medium mb-1 text-purple-500">🧠 思考过程</div>
              {streamingReasoning}
            </div>
          </div>
        )}

        {/* streaming text */}
        {streaming && streamingContent && (
          <div className="flex justify-start">
            <div className="flex items-start gap-2 max-w-[70%]">
              <AvatarImg src={character?.avatar} alt={character?.avatar || '🤖'} size="lg" />
              <div className={"px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed rounded-lg rounded-tl-sm break-words shadow-sm " + aiBubble + " " + aiBubbleBorder}>
                <span className={txt}>{streamingContent}</span>
                <span className="inline-flex items-center gap-0.5 ml-2 align-middle" aria-label="回复生成中">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3cb371] animate-pulse"/>
                  <span className="w-1 h-1 rounded-full bg-[#3cb371]/60 animate-pulse [animation-delay:120ms]"/>
                </span>
              </div>
            </div>
          </div>
        )}

        {streaming && !streamingContent && !streamingReasoning && (
          <div className="flex justify-start">
            <div className={"px-4 py-2 rounded-lg text-sm " + aiBubble + " " + aiBubbleBorder}>
              <span className={txt2 + " animate-pulse"}>对方正在输入...</span>
            </div>
          </div>
        )}
      </div>


      
      {/* Error */}
      {error && (
        <div className={"px-4 py-2 text-xs flex items-center justify-between border-t " + errBg}>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:opacity-70 font-bold">✕</button>
        </div>
      )}

      {/* Input area - WeChat style */}
      <div className={"relative flex-shrink-0 px-4 py-3 border-t " + (isDark ? 'bg-[#2a2a2a] border-[#3a3a3a]' : 'bg-[#f0f0f0] border-[#e2e2e2]')}>
        {activeExtensions.length > 0 && showQuickCommands && (
          <div className={"absolute bottom-full left-4 right-4 mb-2 z-20 rounded-xl border p-2 shadow-lg " + (isDark ? 'bg-[#202020]/95 border-[#444]' : 'bg-white/95 border-[#ddd]')}>
            <div className="flex gap-2 overflow-x-auto">
              {activeExtensions.map((module) => (
                <button key={module.id} onClick={() => void handleExtensionClick(module)} disabled={streaming}
                  className={"flex-shrink-0 px-3 py-1.5 rounded-lg text-xs border transition-colors " + quickButtonClass(module)}>
                  {!extensionShowIcons ? '' : (module.icon || (module.type === 'gallery-shortcut' ? '🖼️' : '⚡')) + ' '}{module.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={"rounded-xl border " + (isDark ? 'bg-[#1e1e1e] border-[#3a3a3a]' : 'bg-white border-[#ddd]') + " overflow-hidden"}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            className={"w-full px-4 pt-3 pb-1 text-sm resize-none outline-none bg-transparent " + txt}
            style={{ minHeight: '40px', maxHeight: '120px' }}/>
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-2">
              {/* Thinking toggle */}
              <button
                onClick={() => setThinkingEnabled(!thinkingEnabled)}
                className={"p-1 rounded transition-colors " + (thinkingEnabled ? 'text-purple-500' : txt2)}
                title="思考过程开关">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                  <circle cx="12" cy="10" r="2" fill="currentColor"/>
                  <path d="M15 10a3 3 0 11-6 0"/>
                </svg>
              </button>

              {/* Memory toggle */}
              <button
                onClick={() => {
                  const enabled = !state.subAIConfig.enabled;
                  try { localStorage.setItem('jg2_memory_preference_set', '1'); } catch {}
                  dispatch({ type: 'UPDATE_SUB_AI_CONFIG', config: { enabled } });
                }}
                className={"p-1 rounded transition-colors " + (state.subAIConfig.enabled ? 'text-[#3cb371]' : txt2)}
                title="长期记忆开关">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </button>

              {/* Quick command toggle */}
              {activeExtensions.length > 0 && <button
                onClick={() => setShowQuickCommands((visible) => !visible)}
                className={"p-1 rounded transition-colors " + (showQuickCommands ? 'text-amber-500' : txt2)}
                title="快捷指令">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>
                </svg>
              </button>}

              {/* Scroll to bottom */}
              <button
                onClick={scrollToBottom}
                className={"p-1 rounded transition-colors " + (isDark ? 'hover:bg-[#333]' : 'hover:bg-[#e8e8e8]') + " " + txt2}
                title="回到底部">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {streaming ? (
                <button onClick={abortStream}
                  className="px-3 py-1 rounded text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors">停止</button>
              ) : (
                <button onClick={handleSend} disabled={!input.trim()}
                  className={"px-3 py-1 rounded text-xs text-white transition-colors " +
                    (input.trim() ? 'bg-[#3cb371] hover:bg-[#45c181]' : 'bg-[#ccc] dark:bg-[#444] dark:text-[#666]')}>发送</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
