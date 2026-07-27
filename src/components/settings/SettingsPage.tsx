import React, { useEffect, useState } from 'react';
import { MemoryPanel } from '../memory/MemoryPanel';
import { useApp } from '../../hooks/useApp';
import { useModels } from '../../hooks/useModels';
import { useCharacters } from '../../hooks/useCharacters';
import { useConversations } from '../../hooks/useConversations';
import { useWorldBooks } from '../../hooks/useWorldBooks';
import { PING_TIMEOUT, chatCompletionsUrl, SAMPLING_PRESETS } from '../../utils/constants';
import { SUB_AI_SYSTEM_PROMPT } from '../../utils/constants';
import * as Stores from '../../db/stores';
import { cleanupUnreferencedImageAssets } from '../../db';
import { createFullBackup, createCharacterBackup, hasExistingProjectData, restoreFullBackup, restoreCharacterBackup, clearProjectData } from '../../utils/dataTransfer';
import type { ModelConfig } from '../../types';
import { compressImage, isImageSource } from '../../utils/image';

function MiniAvatar({ avatar }: { avatar?: string }) {
  if (isImageSource(avatar)) {
    return React.createElement('img', { src: avatar, alt: '', className: 'w-6 h-6 rounded object-cover flex-shrink-0' });
  }
  return React.createElement('span', { className: 'text-sm' }, avatar || '💬');
}

export function SettingsPage() {
  const { state, dispatch } = useApp();
  const isDark = state.theme === 'dark';
  const { models, loadModels, addModel, updateModel, deleteModel } = useModels();
  const { characters, loadCharacters } = useCharacters();
  const { conversations, loadConversations, deleteConversation } = useConversations();
  const { loadWorldBooks } = useWorldBooks();

  const [settingsTab, setSettingsTab] = useState<'general' | 'memory'>('general');
  const [editing, setEditing] = useState<Partial<ModelConfig> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pingResult, setPingResult] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [characterPackageImporting, setCharacterPackageImporting] = useState(false);
  const [characterPackageExporting, setCharacterPackageExporting] = useState(false);
  const [characterPackageEncrypting, setCharacterPackageEncrypting] = useState(false);
  const [packageCharacterId, setPackageCharacterId] = useState('');
  const [userAvatar, setUserAvatar] = useState<string>(() => {
    try { return localStorage.getItem('jg2_user_avatar') || ''; } catch { return ''; }
  });
  const [selectedConvs, setSelectedConvs] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [activeModelId, setActiveModelId] = useState<string>(() => {
    try { return localStorage.getItem('jg2_active_model') || ''; } catch { return ''; }
  });
  const [debugMode, setDebugMode] = useState(() => { try { return localStorage.getItem('jg2_debug_mode') === 'true'; } catch { return false; } });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [ctxRounds, setCtxRounds] = useState(() => { try { return parseInt(localStorage.getItem('jg2_ctx_rounds') || '20'); } catch { return 20; } });
  const [ctxWbEntries, setCtxWbEntries] = useState(() => { try { return parseInt(localStorage.getItem('jg2_ctx_wb') || '3'); } catch { return 3; } });
  const [ctxMemEntries, setCtxMemEntries] = useState(() => { try { return parseInt(localStorage.getItem('jg2_ctx_mem') || '5'); } catch { return 5; } });
  const [storageInfo, setStorageInfo] = useState<{ browserUsage?: number; browserQuota?: number; imageBytes: number; imageCount: number }>({ imageBytes: 0, imageCount: 0 });
  const hasProtectedCharacters = characters.some((character) => character.protectionMode === 'protected');

  const refreshStorageInfo = async () => {
    const assets = await Stores.getAllImageAssets();
    const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : undefined;
    setStorageInfo({
      browserUsage: estimate?.usage,
      browserQuota: estimate?.quota,
      imageBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
      imageCount: assets.length,
    });
  };

  useEffect(() => { void refreshStorageInfo(); }, []);
  useEffect(() => {
    if (!hasProtectedCharacters) return;
    setDebugMode(false);
    try { localStorage.removeItem('jg2_debug_mode'); } catch { /* restricted storage */ }
  }, [hasProtectedCharacters]);
  useEffect(() => {
    if (!packageCharacterId && characters[0]?.id) setPackageCharacterId(characters[0].id);
    if (packageCharacterId && !characters.some((character) => character.id === packageCharacterId)) setPackageCharacterId(characters[0]?.id || '');
  }, [characters, packageCharacterId]);

  const handleModelSave = async () => {
    if (!editing?.name || !editing?.baseUrl || !editing?.defaultModel) return;
    if (editing.id) {
      await updateModel(editing.id, {
        name: editing.name, baseUrl: editing.baseUrl, apiKey: editing.apiKey || '',
        defaultModel: editing.defaultModel, maxContextTokens: editing.maxContextTokens ?? 4000,
        temperature: editing.temperature ?? 0.8, topP: editing.topP ?? 0.95,
      });
    } else {
      await addModel({
        name: editing.name, baseUrl: editing.baseUrl, apiKey: editing.apiKey || '',
        defaultModel: editing.defaultModel, latency: -1, maxContextTokens: editing.maxContextTokens ?? 4000,
        temperature: editing.temperature ?? 0.8, topP: editing.topP ?? 0.95,
      });
    }
    setEditing(null); setShowForm(false);
  };

  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [modelList, setModelList] = useState<Record<string, string[]>>({});

  const handleFetchModels = async (model: ModelConfig) => {
    setFetchingModels((prev) => ({ ...prev, [model.id]: true }));
    try {
      const resp = await fetch(model.baseUrl.replace(/\/+$/, '') + '/models', {
        headers: { Authorization: `Bearer ${model.apiKey}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        const names = (data.data || []).map((m: any) => m.id).filter(Boolean);
        setModelList((prev) => ({ ...prev, [model.id]: names }));
      }
    } catch {}
    setFetchingModels((prev) => ({ ...prev, [model.id]: false }));
  };

  const setActive = (id: string) => {
    setActiveModelId(id);
    try { localStorage.setItem('jg2_active_model', id); } catch {}
  };
  const handleDeleteModel = async (id: string) => {
    const affected = conversations.filter((conversation) => conversation.modelId === id).length;
    const message = affected > 0
      ? `该模型正被 ${affected} 个对话绑定。删除后这些对话会要求你重新选择模型，是否继续？`
      : '确认删除此主模型配置？';
    if (!confirm(message)) return;
    await deleteModel(id);
    if (activeModelId === id) setActive('');
    await loadModels();
  };

  const handlePing = async (model: ModelConfig) => {
    setPingResult((prev) => ({ ...prev, [model.id]: '⏳' }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
      const resp = await fetch(model.baseUrl.replace(/\/+$/, '') + '/models', {
        headers: { Authorization: `Bearer ${model.apiKey}` }, signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.ok) {
        setPingResult((prev) => ({ ...prev, [model.id]: `✅ ${resp.status}` }));
        await updateModel(model.id, { latency: 100 });
      } else {
        setPingResult((prev) => ({ ...prev, [model.id]: `❌ ${resp.status}` }));
        await updateModel(model.id, { latency: -3 });
      }
    } catch {
      setPingResult((prev) => ({ ...prev, [model.id]: '❌ 超时' }));
      await updateModel(model.id, { latency: -2 });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await createFullBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'bayoutavern2_data_' + new Date().toISOString().slice(0, 10) + '.json';
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { alert('导出失败: ' + e.message); }
    setExporting(false);
  };

  const handleImport = async () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = async (ev: any) => {
      setImporting(true);
      try {
        const file = ev.target.files?.[0];
        if (!file) { setImporting(false); return; }
        const data = JSON.parse(await file.text());
        if (await hasExistingProjectData() && !confirm('导入数据会清理当前对话、角色、世界书、记忆和设置，再恢复文件内容。是否继续？')) { setImporting(false); return; }
        await restoreFullBackup(data, file.size);
        alert('数据导入完成，页面将重新加载。');
        window.location.reload();
      } catch (e: any) { alert('导入失败: ' + e.message); }
      setImporting(false);
    };
    input.click();
  };

  const handleCharacterPackageExport = async () => {
    if (characters.find((character) => character.id === packageCharacterId)?.protectionMode === 'protected') return;
    if (!packageCharacterId) { alert('请先选择要导出的角色卡。'); return; }
    setCharacterPackageExporting(true);
    try {
      const data = await createCharacterBackup(packageCharacterId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const character = characters.find((item) => item.id === packageCharacterId);
      const fileName = (character?.name || 'character').replace(/[\\/:*?"<>|]/g, '_');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `bayoutavern2_${fileName}_package.json`; a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { alert('角色卡导出失败: ' + e.message); }
    setCharacterPackageExporting(false);
  };

  const handleCharacterPackageEncryptedExport = async () => {
    if (!packageCharacterId) return;
    setCharacterPackageEncrypting(true);
    try {
      const data = await createCharacterBackup(packageCharacterId, { encrypted: true, password: 'play-only-package' });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const character = characters.find((item) => item.id === packageCharacterId);
      const fileName = (character?.name || 'character').replace(/[\\/:*?"<>|]/g, '_');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `bayoutavern2_${fileName}_protected_package.json`; a.click(); URL.revokeObjectURL(a.href);
    } catch { /* 受保护角色或导出失败时保持静默 */ }
    setCharacterPackageEncrypting(false);
    return;
    if (!packageCharacterId) { alert('请先选择要导出的角色卡。'); return; }
    const password = window.prompt('请设置加密密码（至少 12 个字符）：') || '';
    if (password.length < 12) { alert('为了避免过于容易被猜中，加密密码至少需要 12 个字符。'); return; }
    const confirmation = window.prompt('请再次输入加密密码：') || '';
    if (password !== confirmation) { alert('两次输入的密码不一致。'); return; }
    setCharacterPackageEncrypting(true);
    try {
      const data = await createCharacterBackup(packageCharacterId, { encrypted: true, password });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const character = characters.find((item) => item.id === packageCharacterId);
      const fileName = (character?.name || 'character').replace(/[\\/:*?"<>|]/g, '_');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `bayoutavern2_${fileName}_protected_package.json`; a.click(); URL.revokeObjectURL(a.href);
    } catch (e: any) { alert('加密角色卡包导出失败: ' + e.message); }
    setCharacterPackageEncrypting(false);
  };

  const handleCharacterPackageImport = async () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.onchange = async (ev: any) => {
      let encryptedImport = false;
      setCharacterPackageImporting(true);
      try {
        const file = ev.target.files?.[0];
        if (!file) { setCharacterPackageImporting(false); return; }
        const data = JSON.parse(await file.text());
        encryptedImport = Boolean(data?.encrypted);
        if (data?.encrypted) {
          if (!confirm('导入角色卡包会新增一张角色卡及其关联数据，不会清除当前项目。是否继续？')) { setCharacterPackageImporting(false); return; }
          await restoreCharacterBackup(data, file.size);
          alert('角色卡数据包导入完成，页面将重新加载。');
          window.location.reload();
          return;
        }
        if (!confirm('导入单角色卡包会新增一张角色卡及其对话、记忆、世界书、状态栏、快捷键和图鉴数据，不会清除当前项目。是否继续？')) { setCharacterPackageImporting(false); return; }
        const password = data?.encrypted
          ? (window.prompt('这是加密角色卡包，请输入密码：') || '')
          : undefined;
        if (data?.encrypted && !password) { setCharacterPackageImporting(false); return; }
        await restoreCharacterBackup(data, file.size, { password });
        alert('角色卡数据包导入完成，页面将重新加载。');
        window.location.reload();
      } catch (e: any) { if (!encryptedImport) alert('角色卡导入失败: ' + e.message); }
      setCharacterPackageImporting(false);
    };
    input.click();
  };

  const handleClearData = async () => {
    if (!confirm('确认清除所有数据？这会删除所有对话、记忆、角色卡、世界书、模型和自定义设置。默认预设会保留。')) return;
    await clearProjectData();
    window.location.reload();
  };

  const toggleConv = (id: string) => { const next = new Set(selectedConvs); if (next.has(id)) next.delete(id); else next.add(id); setSelectedConvs(next); };
  const handleBulkDelete = async () => {
    if (selectedConvs.size === 0 || !confirm(`删除 ${selectedConvs.size} 个对话？`)) return;
    setDeleting(true); for (const id of selectedConvs) { await deleteConversation(id); }
    setSelectedConvs(new Set()); setDeleting(false); await loadConversations();
  };

  const bg = isDark ? 'bg-[#111]' : 'bg-[#f5f5f5]';
  const card = isDark ? 'bg-[#2a2a2a] border-[#3a3a3a]' : 'bg-white border-[#e2e2e2]';
  const formBg = isDark ? 'bg-[#2a2a2a] border-amber-500/30' : 'bg-white border-amber-400/30';
  const inputCls = isDark ? 'bg-[#1a1a1a] border-[#3a3a3a] text-[#e0e0e0]' : 'bg-[#f5f5f5] border-[#ddd] text-[#1a1a1a]';
  const txt = isDark ? 'text-[#e0e0e0]' : 'text-[#1a1a1a]';
  const txt2 = isDark ? 'text-[#888]' : 'text-[#666]';
  const btn = isDark ? 'bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]' : 'bg-[#e8e8e8] hover:bg-[#ddd] text-[#444]';
  const btnGreen = 'bg-[#3cb371] hover:bg-[#45c181] text-white';
  const btnDel = isDark ? 'bg-red-900/30 hover:bg-red-900/50 text-red-300' : 'bg-red-50 hover:bg-red-100 text-red-600';
  const accent = 'bg-amber-500 hover:bg-amber-600 text-white';
  const tabActive = isDark ? 'bg-[#2a2a2a] text-[#e0e0e0]' : 'bg-white text-[#1a1a1a] border-[#ddd]';
  const tabInactive = isDark ? 'text-[#888] hover:text-[#ccc]' : 'text-[#888] hover:text-[#555]';

  return (
    <div className={"flex-1 overflow-y-auto p-3 sm:p-6 " + bg}>
      <div className="max-w-2xl mx-auto">
        <div className="flex gap-1 mb-4 border-b pb-0" style={{borderColor: isDark ? '#3a3a3a' : '#e2e2e2'}}>
          <button onClick={() => setSettingsTab('general')}
            className={"px-4 py-2 text-sm rounded-t-lg border-b-0 transition-colors " + (settingsTab === 'general' ? tabActive : tabInactive)}>通用设置</button>
          <button onClick={() => setSettingsTab('memory')}
            className={"px-4 py-2 text-sm rounded-t-lg border-b-0 transition-colors " + (settingsTab === 'memory' ? tabActive : tabInactive)}>记忆设置</button>
        </div>

        {settingsTab === 'general' && (
          <div className="flex flex-col space-y-4">
            {/* API 模型 */}
            <div className={"p-4 rounded-xl border " + card}>
              <div className="flex items-center justify-between mb-1">
                <h3 className={"text-sm font-medium " + txt}>主模型API配置</h3>
                <button onClick={() => { setEditing({ temperature: 0.8, topP: 0.95, maxContextTokens: 4000 }); setShowForm(true); }}
                  className={"px-3 py-1.5 text-xs rounded-lg " + btnGreen}>+ 新增</button>
              </div>
              <p className={"text-xs mb-3 " + txt2}>用于角色对话的主模型配置。当前默认配置会用于下一轮对话。</p>
              {models.map((m) => (
                <div key={m.id} className={"mb-2 p-3 rounded-lg border " + (activeModelId === m.id
                  ? (isDark ? 'border-[#3cb371] bg-[#203126]' : 'border-[#3cb371] bg-[#f0fff4]')
                  : (isDark ? 'bg-[#1a1a1a] border-[#333]' : 'bg-[#f5f5f5] border-[#eee]'))}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className={"text-xs font-medium truncate " + txt}>{m.name}</span>
                      {activeModelId === m.id && <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#3cb371] text-white">当前</span>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handlePing(m)} className={"px-1.5 py-0.5 text-[10px] rounded " + btn}>Ping {pingResult[m.id] || ''}</button>
                      <button onClick={() => { setEditing({ ...m }); setShowForm(true); }} className={"px-1.5 py-0.5 text-[10px] rounded " + btn}>编辑</button>
                      <button onClick={() => void handleDeleteModel(m.id)} className={"px-1.5 py-0.5 text-[10px] rounded " + btnDel}>删除</button>
                    </div>
                  </div>
                  <div className={"text-[10px] mt-0.5 space-y-0.5 " + txt2}>
                    <div className="truncate">URL: {m.baseUrl}</div>
                    <div>Model: {m.defaultModel}</div>
                    <div>Context: {m.maxContextTokens || 4000} t | T: {m.temperature ?? 0.8} | Top-P: {m.topP ?? 0.95}</div>
                  </div>
                  {activeModelId !== m.id && <button onClick={() => setActive(m.id)} className="mt-2 px-2 py-1 text-[10px] rounded bg-[#3cb371]/15 text-[#2a9a5f] hover:bg-[#3cb371]/25">设为当前</button>}

                </div>
              ))}
              {showForm && editing && (
                <div className={"p-3 rounded-lg border space-y-2 mt-2 " + formBg}>
                  <input placeholder="名称" className={"w-full px-2 py-1.5 rounded text-xs border " + inputCls}
                    value={editing.name || ''} onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}/>
                  <input placeholder="Base URL" className={"w-full px-2 py-1.5 rounded text-xs border " + inputCls}
                    value={editing.baseUrl || ''} onChange={(e) => setEditing((prev) => ({ ...prev, baseUrl: e.target.value }))}/>
                  <input placeholder="API Key" type="password" className={"w-full px-2 py-1.5 rounded text-xs border " + inputCls}
                    value={editing.apiKey || ''} onChange={(e) => setEditing((prev) => ({ ...prev, apiKey: e.target.value }))}/>
                  <input placeholder="模型名称" className={"w-full px-2 py-1.5 rounded text-xs border " + inputCls}
                    value={editing.defaultModel || ''} onChange={(e) => setEditing((prev) => ({ ...prev, defaultModel: e.target.value }))}/>
                  <div className="flex gap-2 items-center flex-wrap">
                    <label className={"text-[10px] " + txt2}>Ctx:</label>
                    <input type="number" min={1000} max={128000} step={1000} className={"w-20 px-2 py-1 rounded text-xs border " + inputCls}
                      value={editing.maxContextTokens ?? 4000} onChange={(e) => setEditing((prev) => ({ ...prev, maxContextTokens: parseInt(e.target.value) || 4000 }))}/>
                    <label className={"text-[10px] " + txt2}>Temperature (0-2):</label>
                    <input type="number" min={0} max={2} step={0.05} className={"w-16 px-2 py-1 rounded text-xs border " + inputCls}
                      value={editing.temperature ?? 0.8} onChange={(e) => setEditing((prev) => ({ ...prev, temperature: parseFloat(e.target.value) || 0 }))}/>
                    <label className={"text-[10px] " + txt2}>Top-P (0-1):</label>
                    <input type="number" min={0} max={1} step={0.05} className={"w-16 px-2 py-1 rounded text-xs border " + inputCls}
                      value={editing.topP ?? 0.95} onChange={(e) => setEditing((prev) => ({ ...prev, topP: parseFloat(e.target.value) || 0 }))}/>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className={"text-[10px] " + txt2}>采样预设：</span>
                    {SAMPLING_PRESETS.map((preset) => (
                      <button key={preset.id} type="button" onClick={() => setEditing((prev) => ({ ...prev, temperature: preset.temperature, topP: preset.topP }))}
                        className={"px-2 py-1 text-[10px] rounded " + btn}>{preset.name}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleModelSave} className={"px-3 py-1 text-xs rounded " + accent}>{editing.id ? '更新' : '保存'}</button>
                    <button onClick={() => { setShowForm(false); setEditing(null); }} className={"px-3 py-1 text-xs rounded " + btn}>取消</button>
                  </div>
                </div>
              )}
              <p className={"text-[10px] mt-3 leading-5 " + txt2}>主模型配置推荐使用<a href="https://platform.deepseek.com/usage" target="_blank" rel="noreferrer" className="text-[#3cb371] underline">DeepSeek模型</a>，低甲，但需要注意每日9:00～12:00 和 14:00～18:00为峰值定价，为平时价格2倍。</p>
            </div>

            {/* 上下文配置 */}
            <div className={"p-4 rounded-xl border " + card}>
              <h3 className={"text-sm font-medium mb-3 " + txt}>上下文配置</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className={"text-xs " + txt}>最近对话轮数</span>
                    <span className={"text-[10px] ml-1 " + txt2}>短期记忆长度，调整发送给模型的历史对话轮数</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="range" min={5} max={50} step={5} className={"jg2-range " + (isDark ? 'jg2-range-dark' : '')}
                      value={ctxRounds} onChange={(e) => { const v = parseInt(e.target.value); setCtxRounds(v); try { localStorage.setItem('jg2_ctx_rounds', String(v)); } catch {} }}/>
                    <span className={"text-xs w-8 " + txt}>{ctxRounds}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={"text-xs " + txt}>世界书条目数</span>
                    <span className={"text-[10px] ml-1 " + txt2}>每轮对话世界书附带的设定条目上限</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={10} step={1} className={"jg2-range " + (isDark ? 'jg2-range-dark' : '')}
                      value={ctxWbEntries} onChange={(e) => { const v = parseInt(e.target.value); setCtxWbEntries(v); try { localStorage.setItem('jg2_ctx_wb', String(v)); } catch {} }}/>
                    <span className={"text-xs w-8 " + txt}>{ctxWbEntries}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className={"text-xs " + txt}>记忆条目数</span>
                    <span className={"text-[10px] ml-1 " + txt2}>长期记忆条目数量，影响角色回想的相关记忆数量</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={20} step={1} className={"jg2-range " + (isDark ? 'jg2-range-dark' : '')}
                      value={ctxMemEntries} onChange={(e) => { const v = parseInt(e.target.value); setCtxMemEntries(v); try { localStorage.setItem('jg2_ctx_mem', String(v)); } catch {} }}/>
                    <span className={"text-xs w-8 " + txt}>{ctxMemEntries}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 用户头像 */}
            <div className={"p-4 rounded-xl border " + card}>
              <h3 className={"text-sm font-medium mb-3 " + txt}>用户头像</h3>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center border" style={{borderColor: isDark ? '#3a3a3a' : '#ddd'}}>
                  {userAvatar ? <img src={userAvatar} alt="" className="w-full h-full object-cover"/> : <span className="text-xl">👤</span>}
                </div>
                <button onClick={() => {
                  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
                  inp.onchange = async (ev: any) => { const file = ev.target.files[0]; if (!file) return;
                    try { const b64 = await compressImage(file, 256, 256); setUserAvatar(b64); try { localStorage.setItem('jg2_user_avatar', b64); } catch {} }
                    catch (error: any) { alert(error?.message || '头像处理失败'); } }; inp.click();
                }} className={"px-3 py-1 text-xs rounded " + btn}>上传</button>
                {userAvatar && <button onClick={() => { setUserAvatar(''); try { localStorage.removeItem('jg2_user_avatar'); } catch {} }} className={"px-3 py-1 text-xs rounded " + btn}>清除</button>}
              </div>
            </div>

            <div className={"p-4 rounded-xl border " + card}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className={"text-sm font-medium " + txt}>存储占用</h3>
                  <p className={"text-xs mt-1 " + txt2}>
                    图片资源 {storageInfo.imageCount} 个 · {(storageInfo.imageBytes / 1024 / 1024).toFixed(2)} MB
                    {storageInfo.browserQuota ? ` · 浏览器估算 ${((storageInfo.browserUsage || 0) / 1024 / 1024).toFixed(1)} / ${(storageInfo.browserQuota / 1024 / 1024).toFixed(1)} MB` : ''}
                  </p>
                </div>
                <button onClick={async () => { await cleanupUnreferencedImageAssets(); await refreshStorageInfo(); }}
                  className={"px-3 py-1.5 text-xs rounded " + btn}>清理未引用图片</button>
              </div>
            </div>

            {/* 对话管理 */}
            <div className={"p-4 rounded-xl border " + card}>
              <h3 className={"text-sm font-medium mb-3 " + txt}>对话管理</h3>
              {conversations.length === 0 ? <p className={"text-xs " + txt2}>暂无对话。</p> : (
                <>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setSelectedConvs(new Set(conversations.map((c: any) => c.id)))} className={"px-2 py-1 text-[10px] rounded " + btn}>全选</button>
                    <button onClick={() => setSelectedConvs(new Set())} className={"px-2 py-1 text-[10px] rounded " + btn}>取消</button>
                    <button onClick={handleBulkDelete} disabled={selectedConvs.size === 0 || deleting} className={"px-2 py-1 text-[10px] rounded " + btnDel}>{deleting ? '删除中...' : `删除 (${selectedConvs.size})`}</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {conversations.map((conv: any) => {
                      const chr = characters.find((c: any) => c.id === conv.characterId);
                      return (
                        <label key={conv.id} className={"flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs " + txt} style={{backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5'}}>
                          <input type="checkbox" checked={selectedConvs.has(conv.id)} onChange={() => toggleConv(conv.id)} className="rounded accent-[#3cb371]"/>
                          <MiniAvatar avatar={chr?.avatar} /><span className="truncate">{conv.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 数据管理 */}
            <div className={"p-4 rounded-xl border " + card}>
              <h3 className={"text-sm font-medium mb-3 " + txt}>数据管理</h3>
              <div className="flex gap-2 flex-wrap">
                <button onClick={handleExport} disabled={exporting} className={"flex-1 min-w-[110px] px-3 py-1.5 text-xs rounded " + btnGreen}>{exporting ? '导出中...' : '📥 导出数据'}</button>
                <button onClick={handleImport} disabled={importing} className={"flex-1 min-w-[110px] px-3 py-1.5 text-xs rounded " + btnGreen}>{importing ? '导入中...' : '📤 导入数据'}</button>
                <button onClick={handleClearData} className={"flex-1 min-w-[110px] px-3 py-1.5 text-xs rounded " + btnDel}>🗑 清除数据</button>
              </div>
              <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10">
                <div className="flex gap-2 flex-wrap">
                  <select value={packageCharacterId} onChange={(e) => setPackageCharacterId(e.target.value)} className={"flex-1 min-w-[160px] px-2 py-1.5 text-xs rounded border " + inputCls}>
                    <option value="">选择角色卡</option>
                    {characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
                  </select>
                  <button onClick={handleCharacterPackageEncryptedExport} disabled={characterPackageExporting || characterPackageEncrypting || !packageCharacterId} className="px-3 py-1.5 text-xs rounded bg-transparent text-transparent border border-transparent hover:bg-transparent focus:outline-none" aria-label="加密导出">加密导出</button>
                  <button onClick={handleCharacterPackageExport} disabled={characterPackageExporting || !packageCharacterId} className={"px-3 py-1.5 text-xs rounded " + btnGreen}>{characterPackageExporting ? '导出中...' : '📤 导出角色卡包'}</button>
                  <button onClick={handleCharacterPackageImport} disabled={characterPackageImporting} className={"px-3 py-1.5 text-xs rounded " + btnGreen}>{characterPackageImporting ? '导入中...' : '📥 导入角色卡包'}</button>
                </div>
              </div>
            </div>
            <div className={"p-4 rounded-xl border " + card} style={{ display: hasProtectedCharacters ? 'none' : undefined }}>
              <h3 className={"text-sm font-medium mb-3 " + txt}>调试模式</h3>
              <div className="flex items-center justify-between" style={{ display: hasProtectedCharacters ? 'none' : undefined }}>
                <p className={"text-xs " + txt}>开启后可下载完整 messages 数组，本功能仅供测试使用，正常用户无需开启。</p>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={debugMode} onChange={(e) => {
                    setDebugMode(e.target.checked);
                    try { localStorage.setItem('jg2_debug_mode', String(e.target.checked)); } catch {}
                  }} className="rounded accent-[#3cb371]"/>
                </label>
              </div>
            </div>
            <div className={"p-4 rounded-xl border " + card}>
              <button onClick={() => setAboutOpen((open) => !open)} className="w-full flex items-center justify-between text-left">
                <h3 className={"text-sm font-medium " + txt}>使用声明与免责协议</h3>
                <span className={"text-xs " + txt2}>{aboutOpen ? '▾' : '▸'}</span>
              </button>
              {!aboutOpen && <p className={"text-[10px] mt-2 " + txt2}>点击展开查看完整使用声明、版权免责、第三方服务与 Token 消耗相关条款。</p>}
              {aboutOpen && <div className={"mt-3 space-y-4 text-[11px] leading-5 " + txt}>
                <p>本项目遵循以下原则开源，旨在为 AI 角色扮演爱好者提供一个自由、纯粹的工具。</p>
                <div><h4 className="font-semibold text-amber-500 mb-1">【第一部分：开源分发与反篡改协议】</h4><ol className="list-decimal list-inside space-y-1"><li><b>免费派发原则</b>：保留本项目署名信息和官方渠道说明的前提下，任何人均可免费下载、体验和分享。</li><li><b>绝对非商用</b>：严禁将本项目用于盈利性贩卖、商业托管或植入商业广告。</li><li><b>渠道防伪与投毒免责</b>：本项目唯一正版官方发布渠道为B站 Bayou_x264。任何从第三方不明渠道下载导致的文件篡改、API Key 被盗、隐私泄露或设备中毒等后果，由使用者自行承担。</li></ol></div>
                <div><h4 className="font-semibold text-amber-500 mb-1">【第二部分：内容生成与版权免责】</h4><ol className="list-decimal list-inside space-y-1"><li><b>纯工具属性</b>：本项目仅提供本地前端工具框架，不提供 AI 算力、中转服务器或具有版权争议的第三方资产。</li><li><b>资产自备原则</b>：角色设定、世界书、图片、视频及其他素材由用户自行配置或调用。因导入、生成涉嫌侵权内容引发的纠纷，由用户自行承担责任。</li><li><b>文本不背书</b>：AI 生成的对白、剧情和文本属于概率生成结果，本项目不对其真实性、合法性或健康性提供保证。</li></ol></div>
                <div><h4 className="font-semibold text-amber-500 mb-1">【第三部分：法律红线与行为规范】</h4><ol className="list-decimal list-inside space-y-1"><li>使用商业或本地 AI 服务时，必须遵守所在地法律法规和服务商使用协议。</li><li>严禁利用本项目及关联 AI 生成、传播违法违规、危害安全、暴力恐怖或涉及未成年人色情等不合规内容。</li><li>角色互动基于虚构情境，请区分虚拟与现实，理性使用，避免过度沉溺。</li></ol></div>
                <div><h4 className="font-semibold text-amber-500 mb-1">【第四部分：第三方 AI 服务与 Token 消耗声明】</h4><ol className="list-decimal list-inside space-y-1"><li>界面和示例中的 AI 产品名称仅作技术配置参考，不构成商业广告、品牌推荐或利益背书。</li><li>本项目不提供内建 API Key。API Key 和服务地址由用户本地浏览器直接发送至用户配置的目标服务。</li><li>因服务商计费、模型 Token 机制、网络攻击或代码缺陷造成的费用与损失，请用户自行核对并承担相应风险。</li></ol></div>
                <p className={"p-3 rounded-lg border text-[10px] " + (isDark ? 'border-amber-700/40 bg-amber-950/20 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-800')}>※ 凡进入本软件、配置模型或开始对话者，即视为已阅读并同意上述条款。如不同意，请立即关闭并删除本项目。</p>
              </div>}
            </div>
            <p className={"text-[10px] text-center px-2 pb-1 " + txt2}>本项目开发参考自B站Up橙橙乔乔的 [Easy酒馆Pro]，在此表示感谢。</p>
          </div>
        )}

        {settingsTab === 'memory' && (
          <MemoryPanel />
        )}
      </div>
    </div>
  );
}
