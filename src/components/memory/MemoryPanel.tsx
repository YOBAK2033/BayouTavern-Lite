import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../hooks/useApp';
import { useMemory, getMemories, saveMemories, ensureMemoryKeywords, type MemoryEntry } from '../../hooks/useMemory';
import { useConversations } from '../../hooks/useConversations';
import { useCharacters } from '../../hooks/useCharacters';
import { generateId } from '../../utils/id';
import type { ModelConfig } from '../../types';
import { getStoredSubAIModels, saveStoredSubAIModels } from '../../utils/subAI';
import { SUB_AI_SYSTEM_PROMPT, PING_TIMEOUT, SAMPLING_PRESETS } from '../../utils/constants';
import { isImageSource } from '../../utils/image';
import { fetchAvailableModels } from '../../utils/modelDiscovery';
import { safeSetLocalStorage } from '../../utils/safeStorage';

function MiniAvatar({ avatar }: { avatar?: string }) {
  if (isImageSource(avatar)) {
    return React.createElement('img', { src: avatar, alt: '', className: 'w-5 h-5 rounded object-cover flex-shrink-0' });
  }
  return React.createElement('span', { className: 'text-sm flex-shrink-0' }, avatar || '💬');
}

export function MemoryPanel() {
  const { state, dispatch } = useApp();
  const isDark = state.theme === 'dark';
  const { conversations } = useConversations();
  const { characters } = useCharacters();

  const [subAIModels, setSubAIModels] = useState<ModelConfig[]>([]);
  const activeSubAIModelId = state.subAIConfig.modelId || '';
  const [editingSubAIModel, setEditingSubAIModel] = useState<Partial<ModelConfig> | null>(null);
  const [showSubAIForm, setShowSubAIForm] = useState(false);
  const [subAIPrompt, setSubAIPrompt] = useState(state.subAIConfig.customSystemPrompt || SUB_AI_SYSTEM_PROMPT);
  const [saved, setSaved] = useState(false);
  const [subAIPing, setSubAIPing] = useState<Record<string, string>>({});
  const [subAIModelOptions, setSubAIModelOptions] = useState<string[]>([]);
  const [fetchingSubAIModels, setFetchingSubAIModels] = useState(false);
  const [subAIModelFetchError, setSubAIModelFetchError] = useState('');

  useEffect(() => {
    void getStoredSubAIModels().then(setSubAIModels);
  }, []);

  useEffect(() => {
    setSubAIPrompt(state.subAIConfig.customSystemPrompt || SUB_AI_SYSTEM_PROMPT);
  }, [state.subAIConfig.customSystemPrompt]);

  const convId = state.currentConversationId;
  const { memories: currentMemories, loadMemories } = useMemory(convId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editKeywords, setEditKeywords] = useState('');

  const [allMemories, setAllMemories] = useState<Record<string, MemoryEntry[]>>({});
  const [expandedConvs, setExpandedConvs] = useState<Record<string, boolean>>({});


  const refreshAllMemories = useCallback(async () => {
    const grouped: Record<string, MemoryEntry[]> = {};
    for (const conv of conversations) {
      const stored = await getMemories(conv.id);
      const character = conv.characterId ? characters.find((item) => item.id === conv.characterId) : undefined;
      const excludedRoleNames = character?.memoryRoleNames?.filter(Boolean).length
        ? character.memoryRoleNames.filter(Boolean)
        : character?.memoryViewpoint === 'third-person'
          ? []
          : character?.name
            ? [character.name]
            : [];
      const normalized = ensureMemoryKeywords(stored, excludedRoleNames);
      if (JSON.stringify(stored) !== JSON.stringify(normalized)) await saveMemories(conv.id, normalized);
      grouped[conv.id] = normalized;
    }
    setAllMemories(grouped);
  }, [characters, conversations]);

  useEffect(() => {
    void refreshAllMemories();
    const handleMemoryUpdate = () => { void refreshAllMemories(); };
    window.addEventListener('jg2:memories-updated', handleMemoryUpdate);
    return () => window.removeEventListener('jg2:memories-updated', handleMemoryUpdate);
  }, [refreshAllMemories]);

  const handleSavePrompt = () => {
    dispatch({ type: 'UPDATE_SUB_AI_CONFIG', config: { customSystemPrompt: subAIPrompt.trim() || SUB_AI_SYSTEM_PROMPT } });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const handleRestorePrompt = () => {
    setSubAIPrompt(SUB_AI_SYSTEM_PROMPT);
    dispatch({ type: 'UPDATE_SUB_AI_CONFIG', config: { customSystemPrompt: SUB_AI_SYSTEM_PROMPT } });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveSubAIModel = async () => {
    if (!editingSubAIModel?.name || !editingSubAIModel.baseUrl || !editingSubAIModel.apiKey || !editingSubAIModel.defaultModel) return;
    const model: ModelConfig = {
      id: editingSubAIModel.id || generateId(),
      name: editingSubAIModel.name.trim(),
      baseUrl: editingSubAIModel.baseUrl.trim(),
      apiKey: editingSubAIModel.apiKey.trim(),
      defaultModel: editingSubAIModel.defaultModel.trim(),
      latency: editingSubAIModel.latency ?? -1,
      maxContextTokens: editingSubAIModel.maxContextTokens ?? 4000,
      temperature: editingSubAIModel.temperature ?? 0.3,
      topP: editingSubAIModel.topP ?? 0.95,
    };
    const next = model.id && subAIModels.some((item) => item.id === model.id)
      ? subAIModels.map((item) => item.id === model.id ? model : item)
      : [...subAIModels, model];
    const nextActiveId = activeSubAIModelId && next.some((item) => item.id === activeSubAIModelId)
      ? activeSubAIModelId : model.id;
    await saveStoredSubAIModels(next);
    dispatch({ type: 'UPDATE_SUB_AI_CONFIG', config: { modelId: nextActiveId || null } });
    setSubAIModels(next);
    setEditingSubAIModel(null);
    setShowSubAIForm(false);
  };

  const handleFetchSubAIModelOptions = async () => {
    if (!editingSubAIModel) return;
    setFetchingSubAIModels(true);
    setSubAIModelFetchError('');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
      const options = await fetchAvailableModels(editingSubAIModel.baseUrl || '', editingSubAIModel.apiKey || '', controller.signal);
      setSubAIModelOptions(options);
      if (options.length === 0) setSubAIModelFetchError('接口没有返回可选模型，请检查地址或手动填写模型名称。');
    } catch (error: any) {
      setSubAIModelOptions([]);
      setSubAIModelFetchError(error?.name === 'AbortError' ? '获取模型超时。' : (error?.message || '获取模型失败，请检查地址、Key 和跨域设置。'));
    } finally {
      if (timeout) clearTimeout(timeout);
      setFetchingSubAIModels(false);
    }
  };

  const handleDeleteSubAIModel = async (id: string) => {
    const next = subAIModels.filter((item) => item.id !== id);
    const nextActiveId = id === activeSubAIModelId ? (next[0]?.id || '') : activeSubAIModelId;
    await saveStoredSubAIModels(next);
    dispatch({ type: 'UPDATE_SUB_AI_CONFIG', config: { modelId: nextActiveId || null } });
    setSubAIModels(next);
  };

  const handleSelectSubAIModel = (id: string) => {
    dispatch({ type: 'UPDATE_SUB_AI_CONFIG', config: { modelId: id } });
  };

  const startEdit = (mem: MemoryEntry) => {
    setEditingId(mem.id); setEditText(mem.content); setEditKeywords(mem.keywords.join(', '));
  };

  const saveEdit = async (mem: MemoryEntry) => {
    if (!editText.trim()) return;
    const all = await getMemories(mem.conversationId);
    const idx = all.findIndex((m) => m.id === mem.id);
    if (idx === -1) { setEditingId(null); return; }
    all[idx] = { ...all[idx], content: editText.trim(), keywords: editKeywords.split(',').map((k: string) => k.trim()).filter(Boolean) };
    await saveMemories(mem.conversationId, all);
    setEditingId(null);
    const fresh: Record<string, MemoryEntry[]> = {};
    for (const cId of Object.keys(allMemories)) fresh[cId] = await getMemories(cId);
    if (!fresh[mem.conversationId]) fresh[mem.conversationId] = await getMemories(mem.conversationId);
    setAllMemories(fresh);
  };

  const handleSubAIPing = async (model: ModelConfig) => {
    setSubAIPing((prev) => ({ ...prev, [model.id]: '⏳' }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
      const resp = await fetch(model.baseUrl.replace(/\/+$/, '') + '/models', {
        headers: { Authorization: `Bearer ${model.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setSubAIPing((prev) => ({ ...prev, [model.id]: resp.ok ? `✅ ${resp.status}` : `❌ ${resp.status}` }));
    } catch { setSubAIPing((prev) => ({ ...prev, [model.id]: '❌ 连接失败' })); }
    setTimeout(() => setSubAIPing((prev) => ({ ...prev, [model.id]: '' })), 5000);
  };


  const bg = isDark ? 'bg-[#111]' : 'bg-[#f5f5f5]';
  const card = isDark ? 'bg-[#2a2a2a] border-[#3a3a3a]' : 'bg-white border-[#e2e2e2]';
  const inputCls = isDark ? 'bg-[#1a1a1a] border-[#3a3a3a] text-[#e0e0e0]' : 'bg-[#f5f5f5] border-[#ddd] text-[#1a1a1a]';
  const txt = isDark ? 'text-[#e0e0e0]' : 'text-[#1a1a1a]';
  const txt2 = isDark ? 'text-[#888]' : 'text-[#666]';
  const btn = isDark ? 'bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]' : 'bg-[#e8e8e8] hover:bg-[#ddd] text-[#444]';
  const btnGreen = 'bg-[#3cb371] hover:bg-[#45c181] text-white';
  const btnDel = isDark ? 'bg-red-900/30 hover:bg-red-900/50 text-red-300' : 'bg-red-50 hover:bg-red-100 text-red-600';
  const entryBg = isDark ? 'bg-[#1a1a1a] border-[#333]' : 'bg-[#f5f5f5] border-[#eee]';
  const defaultPrompt = SUB_AI_SYSTEM_PROMPT;

  const totalCount = Object.values(allMemories).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className={"flex-1 overflow-y-auto " + bg}>
      <div className="max-w-2xl mx-auto flex flex-col">
        <div style={{ order: 2 }} className={"order-2 p-4 rounded-xl border mb-4 " + card}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className={"text-sm font-medium " + txt}>长期记忆</h3>
              <p className={"text-xs mt-1 " + txt2}>开启后，记忆官会按设定轮次汇总新对话，供主模型检索参考；设为 1 轮时只总结当前轮。</p>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <span className={txt}>启用</span>
              <input type="checkbox" checked={state.subAIConfig.enabled}
                onChange={(e) => { safeSetLocalStorage('jg2_memory_preference_set', '1'); dispatch({ type: 'UPDATE_SUB_AI_CONFIG', config: { enabled: e.target.checked } }); }}
                className="rounded accent-[#3cb371]" />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <label className={"text-xs whitespace-nowrap " + txt}>总结间隔</label>
            <input type="range" min={1} max={10} step={1} value={state.subAIConfig.triggerInterval}
              disabled={!state.subAIConfig.enabled}
              onChange={(e) => dispatch({ type: 'UPDATE_SUB_AI_CONFIG', config: { triggerInterval: Number(e.target.value) } })}
              className={"flex-1 jg2-range " + (isDark ? 'jg2-range-dark ' : '') + 'disabled:opacity-40'} />
            <span className={"text-xs w-14 text-right " + txt}>{state.subAIConfig.triggerInterval === 1 ? '每轮' : `${state.subAIConfig.triggerInterval} 轮`}</span>
          </div>
        </div>
        {/* Independent SubAI API */}
        <div style={{ order: 1 }} className={"order-1 p-4 rounded-xl border mb-4 " + card}>
          <div className="flex items-center justify-between mb-1">
            <h3 className={"text-sm font-medium " + txt}>记忆官模型配置</h3>
            <button onClick={() => { setEditingSubAIModel({ temperature: 0.3, topP: 0.95, maxContextTokens: 4000 }); setShowSubAIForm(true); }}
              className={"px-3 py-1.5 text-xs rounded-lg " + btnGreen}>+ 新增</button>
          </div>
          <p className={"text-xs mb-3 " + txt2}>独立连接，仅供记忆书记官使用。当前选中的配置会用于下一轮记忆提取。</p>
          {subAIModels.length === 0 && !showSubAIForm && <p className={"text-xs text-center py-4 " + txt2}>还没有配置副 AI 模型。</p>}
          <div className="space-y-2">
            {subAIModels.map((model) => (
              <div key={model.id} className={"p-3 rounded-lg border " + (model.id === activeSubAIModelId
                ? (isDark ? 'border-[#3cb371] bg-[#203126]' : 'border-[#3cb371] bg-[#f0fff4]') : entryBg)}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={"text-xs font-medium truncate " + txt}>{model.name}</span>
                    {model.id === activeSubAIModelId && <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#3cb371] text-white">当前</span>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => handleSubAIPing(model)} className={"px-2 py-0.5 text-[10px] rounded " + btn}>Ping {subAIPing[model.id] || ''}</button>
                    <button onClick={() => { setEditingSubAIModel({ ...model }); setShowSubAIForm(true); }} className={"px-2 py-0.5 text-[10px] rounded " + btn}>编辑</button>
                    <button onClick={() => handleDeleteSubAIModel(model.id)} className={"px-2 py-0.5 text-[10px] rounded " + btnDel}>删除</button>
                  </div>
                </div>
                <div className={"text-[10px] truncate " + txt2}>{model.baseUrl} · {model.defaultModel}</div>
                {model.id !== activeSubAIModelId && <button onClick={() => handleSelectSubAIModel(model.id)} className="mt-2 px-2 py-1 text-[10px] rounded bg-[#3cb371]/15 text-[#2a9a5f] hover:bg-[#3cb371]/25">设为当前</button>}
              </div>
            ))}
          </div>
          {showSubAIForm && editingSubAIModel && (
            <div className={"mt-3 p-3 rounded-lg border space-y-2 " + (isDark ? 'border-amber-500/30 bg-[#242424]' : 'border-amber-400/40 bg-[#fffdf5]')}>
              <input placeholder="名称" className={"w-full px-3 py-2 rounded-lg text-xs border "+inputCls} value={editingSubAIModel.name || ''} onChange={(e)=>setEditingSubAIModel((prev)=>({...prev, name:e.target.value}))}/>
              <input placeholder="Base URL" className={"w-full px-3 py-2 rounded-lg text-xs border "+inputCls} value={editingSubAIModel.baseUrl || ''} onChange={(e)=>setEditingSubAIModel((prev)=>({...prev, baseUrl:e.target.value}))}/>
              <input placeholder="API Key" type="password" className={"w-full px-3 py-2 rounded-lg text-xs border "+inputCls} value={editingSubAIModel.apiKey || ''} onChange={(e)=>setEditingSubAIModel((prev)=>({...prev, apiKey:e.target.value}))}/>
              <div className="flex gap-2">
                <input placeholder="模型名称（也可手动填写）" className={"min-w-0 flex-1 px-3 py-2 rounded-lg text-xs border "+inputCls} value={editingSubAIModel.defaultModel || ''} onChange={(e)=>setEditingSubAIModel((prev)=>({...prev, defaultModel:e.target.value}))}/>
                <button type="button" onClick={() => void handleFetchSubAIModelOptions()} disabled={fetchingSubAIModels} className={"px-2.5 py-2 text-xs rounded-lg whitespace-nowrap "+btn}>{fetchingSubAIModels ? '获取中…' : '获取模型'}</button>
              </div>
              {subAIModelOptions.length > 0 && (
                <select aria-label="选择已拉取的记忆官模型" className={"w-full px-3 py-2 rounded-lg text-xs border "+inputCls} value={subAIModelOptions.includes(editingSubAIModel.defaultModel || '') ? editingSubAIModel.defaultModel : ''} onChange={(e)=>setEditingSubAIModel((prev)=>({...prev, defaultModel:e.target.value}))}>
                  <option value="">从接口返回的模型中选择</option>
                  {subAIModelOptions.map((modelName) => <option key={modelName} value={modelName}>{modelName}</option>)}
                </select>
              )}
              {subAIModelFetchError && <p className="text-[10px] text-amber-600">{subAIModelFetchError}</p>}
              <label className={"text-[10px] block "+txt2}>Max context tokens: {editingSubAIModel.maxContextTokens ?? 4000}
                <input type="number" min={1000} max={128000} step={1000} className={"w-full mt-1 px-2 py-1 rounded border text-xs "+inputCls} value={editingSubAIModel.maxContextTokens ?? 4000} onChange={(e)=>setEditingSubAIModel((prev)=>({...prev, maxContextTokens:parseInt(e.target.value)||4000}))}/>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={"text-[10px] "+txt2}>Temperature
                  <input type="number" min={0} max={2} step={0.05} className={"w-full mt-1 px-2 py-1 rounded border text-xs "+inputCls} value={editingSubAIModel.temperature ?? 0.3} onChange={(e)=>setEditingSubAIModel((prev)=>({...prev, temperature:parseFloat(e.target.value)||0}))}/>
                </label>
                <label className={"text-[10px] "+txt2}>Top-P
                  <input type="number" min={0} max={1} step={0.05} className={"w-full mt-1 px-2 py-1 rounded border text-xs "+inputCls} value={editingSubAIModel.topP ?? 0.95} onChange={(e)=>setEditingSubAIModel((prev)=>({...prev, topP:parseFloat(e.target.value)||0}))}/>
                </label>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className={"text-[10px] "+txt2}>采样预设：</span>
                {SAMPLING_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => setEditingSubAIModel((prev)=>({...prev, temperature:preset.temperature, topP:preset.topP}))}
                    className={"px-2 py-1 text-[10px] rounded "+btn}>{preset.name}</button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveSubAIModel} className={"px-3 py-1.5 text-xs rounded "+btnGreen}>{editingSubAIModel.id ? '更新' : '保存'}</button>
                <button onClick={()=>{setShowSubAIForm(false);setEditingSubAIModel(null);}} className={"px-3 py-1.5 text-xs rounded "+btn}>取消</button>
              </div>
            </div>
          )}
        </div>

        {/* Clerk prompt */}
        <div style={{ order: 5 }} className={"order-5 p-4 rounded-xl border mb-4 " + card}>
          <h3 className={"text-sm font-medium mb-1 " + txt}>记忆官提示词</h3>
          <p className={"text-xs mb-3 " + txt2}>用于提取当轮对话摘要和记忆关键词。</p>
          <textarea className={"w-full px-3 py-2 rounded-lg text-xs border min-h-32 resize-y "+inputCls} value={subAIPrompt||defaultPrompt} onChange={(e)=>setSubAIPrompt(e.target.value)} placeholder={defaultPrompt}/>
          <div className="flex gap-2 mt-2">
            <button onClick={handleRestorePrompt} className={"px-3 py-1.5 text-xs rounded "+btn}>恢复默认</button>
            <button onClick={handleSavePrompt} className={"px-3 py-1.5 text-xs rounded "+btnGreen}>{saved?'已保存':'保存提示词'}</button>
          </div>
        </div>

        {/* Memory list */}
        <div style={{ order: 4 }} className={"order-4 p-4 rounded-xl border mb-4 " + card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={"text-lg font-semibold "+txt}>记忆列表</h2>
          <span className={"text-xs "+txt2}>共 {totalCount} 条 · {Object.keys(allMemories).length} 个对话</span>
        </div>

        {Object.keys(allMemories).length===0 ? (
          <p className={"text-xs text-center py-6 "+txt2}>暂无对话或记忆。</p>
        ) : (
          Object.entries(allMemories).map(([cId, mems]) => {
            const conv = conversations.find((c)=>c.id===cId);
            const chr = conv ? characters.find((ch)=>ch.id===conv.characterId) : null;
            const isExpanded = expandedConvs[cId]===true;
            return (
              <div key={cId} className={"mb-3 rounded-xl border overflow-hidden "+card}>
                <div className="flex items-center justify-between p-3 cursor-pointer hover:opacity-80"
                  onClick={()=>setExpandedConvs((prev)=>({...prev,[cId]:!isExpanded}))}>
                  <div className="flex items-center gap-2">
                    <MiniAvatar avatar={chr?.avatar}/>
                    <div><span className={"text-sm font-medium "+txt}>{conv?.title||'未知对话'}</span><span className={"text-xs ml-2 "+txt2}>{mems.length} 条</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"text-xs "+txt2}>{isExpanded?'▲':'▼'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className={"p-3 pt-0 space-y-2 border-t "+(isDark?'border-[#3a3a3a]':'border-[#eee]')}>
                    {mems.length===0 ? (
                      <p className={"text-xs text-center py-2 "+txt2}>暂无记忆。</p>
                    ) : (
                      mems.sort((a,b)=>b.timestamp-a.timestamp).map((mem)=>(
                        <div key={mem.id} className={"p-2.5 rounded-lg border " + entryBg}>
                          <div className="flex items-start gap-2">
                            <div className="flex items-start justify-between gap-2 flex-1">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap mb-1">
                                  {mem.keywords.map((k)=>(
                                    <span key={k} className={"px-1.5 py-0.5 rounded text-[10px] "+(isDark?'bg-amber-500/20 text-amber-400':'bg-amber-100 text-amber-700')}>{k}</span>
                                  ))}
                                  <span className={"text-[10px] ml-1 "+txt2}>{new Date(mem.timestamp).toLocaleString('zh-CN')}</span>
                                </div>
                                {editingId===mem.id ? (
                                  <div className="space-y-1">
                                    <input className={"w-full px-2 py-1 rounded text-xs border "+inputCls} value={editKeywords} onChange={(e)=>setEditKeywords(e.target.value)} placeholder="关键词"/>
                                    <textarea className={"w-full px-2 py-1 rounded text-xs border "+inputCls} rows={2} value={editText} onChange={(e)=>setEditText(e.target.value)}/>
                                    <div className="flex gap-1"><button onClick={()=>saveEdit(mem)} className={"px-2 py-0.5 text-[10px] rounded "+btnGreen}>保存</button><button onClick={()=>setEditingId(null)} className={"px-2 py-0.5 text-[10px] rounded "+btn}>取消</button></div>
                                  </div>
                                ) : (
                                  <p className={"text-xs whitespace-pre-wrap "+txt}>{mem.content}</p>
                                )}
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                {editingId===mem.id ? (
                                  <button onClick={(e)=>{e.stopPropagation();saveEdit(mem);}} className={"px-1.5 py-0.5 text-[10px] rounded "+btnGreen}>更新</button>
                                ) : (
                                  <button onClick={(e)=>{e.stopPropagation();startEdit(mem);}} className={"px-1.5 py-0.5 text-[10px] rounded "+btn}>编辑</button>
                                )}
                                <button onClick={async (e)=>{e.stopPropagation();
                                  const a=await getMemories(mem.conversationId); const f=a.filter((m)=>m.id!==mem.id); await saveMemories(mem.conversationId,f);
                                  const fr:Record<string,any>={}; for(const c of Object.keys(allMemories))fr[c]=await getMemories(c); setAllMemories(fr as any);
                                }} className={"px-1.5 py-0.5 text-[10px] rounded "+btnDel}>删除</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        </div>

      </div>
    </div>
  );
}
