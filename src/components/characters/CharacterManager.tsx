import React, { useState, useRef } from 'react';
import { useCharacters } from '../../hooks/useCharacters';
import { useWorldBooks } from '../../hooks/useWorldBooks';
import { useApp } from '../../hooks/useApp';
import type { Character, WorldBookEntry, StatusBarTemplate } from '../../types';
import { StatusBarBuilder } from './StatusBarBuilder';
import { ExtensionsPanel } from './ExtensionsPanel';
import { generateId } from '../../utils/id';
import * as Stores from '../../db/stores';
import { DEFAULT_STATUS_BAR_TEMPLATES } from '../../utils/constants';
import { compressImageBlob, isImageSource } from '../../utils/image';
import { restoreCharacterBackup } from '../../utils/dataTransfer';

const defaultPrompt = '<role>\n你是一个AI角色。请根据以下设定扮演。\n</role>\n\n<task>\n请以角色的身份自然流畅地回复用户。\n</task>';

function cloneTemplate(template: StatusBarTemplate): StatusBarTemplate {
  return JSON.parse(JSON.stringify(template));
}

function isProtectedCharacter(character?: { protectionMode?: Character['protectionMode'] } | null): boolean {
  return character?.protectionMode === 'protected';
}

function getStatusBarTemplates(): Record<string, StatusBarTemplate> {
  let saved: Record<string, StatusBarTemplate> = {};
  try {
    const raw = localStorage.getItem('jg2_sbtpl');
    if (raw) saved = JSON.parse(raw);
  } catch { /* ignore malformed local templates */ }
  delete saved.adventure;
  return { ...(DEFAULT_STATUS_BAR_TEMPLATES as Record<string, StatusBarTemplate>), ...saved };
}

function MiniAvatar({ avatar, size }: { avatar?: string; size?: string }) {
  const s = size === 'lg' ? 'w-20 h-20 text-3xl' : 'w-10 h-10 text-xl';
  if (isImageSource(avatar)) {
    return React.createElement('img', { src: avatar, alt: '', className: s + ' rounded object-cover flex-shrink-0' });
  }
  return React.createElement('span', { className: s + ' flex-shrink-0 flex items-center justify-center' }, avatar || '🎭');
}

export function CharacterManager() {
  const { characters, addCharacter, updateCharacter, deleteCharacter, loadCharacters } = useCharacters();
  const { worldbooks, loadWorldBooks, addWorldBook, deleteWorldBook, addEntry, updateEntry, deleteEntry, bulkAddEntries } = useWorldBooks();
  const { state } = useApp();
  const isDark = state.theme === 'dark';
  const [tab, setTab] = useState<'characters' | 'worldbooks' | 'statusbar' | 'extensions'>('characters');
  const [editing, setEditing] = useState<Partial<Character> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const [showWbForm, setShowWbForm] = useState(false);
  const [wbName, setWbName] = useState('');
  const [activeWbId, setActiveWbId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({ keys: '', value: '', priority: '5', pinned: false });
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
  const [characterSelectionMode, setCharacterSelectionMode] = useState(false);

  const handleSave = async () => {
    if (!editing?.name) return;
    if (isProtectedCharacter(editing)) return;
    if (editing.protectionMode === 'protected') { alert('该角色卡属于加密游玩包，无法编辑角色卡参数。'); return; }
    // Check duplicate name
    const nameConflict = characters.some((c) => c.name === editing.name && c.id !== editing.id);
    if (nameConflict) { alert('已存在同名角色卡，请使用不同的名称。'); return; }

    const previous = editing.id ? characters.find((character) => character.id === editing.id) : undefined;
    const data = {
      name: editing.name,
      avatar: editing.avatarAssetId ? '🎭' : (editing.avatar || '🎭'),
      avatarAssetId: editing.avatarAssetId,
      coverImage: editing.coverAssetId ? undefined : (editing.coverImage || undefined),
      coverAssetId: editing.coverAssetId,
      galleryAssetIds: editing.galleryAssetIds,
      systemPrompt: editing.systemPrompt || defaultPrompt,
      openingLine: editing.openingLine || '',
      memoryRoleNames: editing.memoryRoleNames?.length ? editing.memoryRoleNames : undefined,
      memoryViewpoint: editing.memoryViewpoint || 'auto',
      worldBookId: editing.worldBookId || undefined,
      statusBarTemplate: editing.statusBarTemplate,
      statusBarTemplateName: editing.statusBarTemplateName || undefined,
      protectionMode: editing.protectionMode,
      protectionMeta: editing.protectionMeta,
    };
    if (editing.id) await updateCharacter(editing.id, data);
    else await addCharacter(data);
    const obsoleteAssetIds = [previous?.avatarAssetId, previous?.coverAssetId]
      .filter((assetId): assetId is string => Boolean(assetId))
      .filter((assetId) => assetId !== editing.avatarAssetId && assetId !== editing.coverAssetId);
    await Promise.all(obsoleteAssetIds.map((assetId) => Stores.deleteImageAsset(assetId)));
    setEditing(null); setShowForm(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const blob = await compressImageBlob(file, 256, 256, 0.78);
      const assetId = await Stores.addImageAsset({ kind: 'avatar', mimeType: blob.type, width: 256, height: 256, blob });
      setEditing((prev) => ({ ...prev, avatar: URL.createObjectURL(blob), avatarAssetId: assetId }));
    } catch (error: any) { alert(error?.message || '头像处理失败'); }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const blob = await compressImageBlob(file, 512, 768, 0.78);
      const assetId = await Stores.addImageAsset({ kind: 'cover', mimeType: blob.type, width: 512, height: 768, blob });
      setEditing((prev) => ({ ...prev, coverImage: URL.createObjectURL(blob), coverAssetId: assetId }));
    } catch (error: any) { alert(error?.message || '封面处理失败'); }
  };

  // Auto-detect matching worldbook when opening edit
  const openEdit = (char: Character) => {
    if (isProtectedCharacter(char)) return;
    if (char.protectionMode === 'protected') { alert('该角色卡属于加密游玩包，无法打开编辑页面。'); return; }
    const matchWb = worldbooks.find((wb) => wb.name === char.name);
    setEditing({ ...char, worldBookId: char.worldBookId || matchWb?.id });
    setShowForm(true);
  };

  const handleImportCharacter = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (event) => {
      let encryptedImport = false;
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        encryptedImport = Boolean(data?.encrypted);
        if (data?.encrypted) {
          if (!confirm('导入角色卡包会新增一张角色卡及其关联数据，不会清除当前项目。是否继续？')) return;
          await restoreCharacterBackup(data, file.size);
          alert('角色卡导入完成，页面将重新加载。');
          window.location.reload();
          return;
        }
        if (!confirm('导入角色卡包会新增角色卡及其对话、记忆、世界书、状态栏、快捷键和图鉴数据，不会清除当前项目。是否继续？')) return;
        const password = data?.encrypted ? (window.prompt('这是加密角色卡包，请输入密码：') || '') : undefined;
        if (data?.encrypted && !password) return;
        await restoreCharacterBackup(data, file.size, { password });
        alert('角色卡导入完成，页面将重新加载。');
        window.location.reload();
      } catch (error: any) {
        if (!encryptedImport) alert('角色卡导入失败：' + (error?.message || String(error)));
      }
    };
    input.click();
  };

  const handleCreateCharacter = () => {
    setEditing({ avatar: '🎭', systemPrompt: defaultPrompt });
    setShowForm(true);
  };

  const handleDeleteSelectedCharacters = async () => {
    if (!characterSelectionMode) { setCharacterSelectionMode(true); return; }
    if (selectedCharacterIds.size === 0) { setCharacterSelectionMode(false); return; }
    const selected = characters.filter((character) => selectedCharacterIds.has(character.id));
    if (!confirm(`确定删除选中的 ${selected.length} 张角色卡吗？关联对话、记忆、快捷键、图鉴以及符合级联条件的世界书也会删除，此操作不可恢复。`)) return;
    for (const character of selected) await deleteCharacter(character.id);
    setSelectedCharacterIds(new Set());
    setCharacterSelectionMode(false);
    await loadCharacters();
    await loadWorldBooks();
  };

  // WorldBook handlers
  const handleAddWb = async () => {
    if (!wbName.trim()) return;
    if (worldbooks.some((wb) => wb.name === wbName.trim())) { alert('已存在同名世界书。'); return; }
    const wb = await addWorldBook(wbName.trim());
    setWbName(''); setShowWbForm(false); setActiveWbId(wb.id);
    setExpanded((prev) => ({ ...prev, [wb.id]: true }));
  };
  const handleDeleteWorldBook = async (id: string) => {
    if (protectedWorldBookIds.has(id)) return;
    if (protectedWorldBookIds.has(id)) { alert('该世界书属于加密角色卡，无法查看或删除。'); return; }
    try {
      await deleteWorldBook(id);
    } catch (error: any) {
      alert(error?.message || '世界书删除失败');
    }
  };
  const handleAddEntry = async () => {
    if (!activeWbId || !entryForm.value.trim()) return;
    if (protectedWorldBookIds.has(activeWbId)) { alert('该世界书属于加密角色卡，无法编辑条目。'); return; }
    if (!entryForm.pinned && !entryForm.keys.trim()) return;
    const keys = entryForm.pinned ? ['常驻'] : entryForm.keys.split(',').map((k) => k.trim()).filter(Boolean);
    if (editingEntryId) {
      await updateEntry(activeWbId, editingEntryId, { keys, value: entryForm.value, priority: parseInt(entryForm.priority) || 5, pinned: entryForm.pinned });
      setEditingEntryId(null);
    } else {
      await addEntry(activeWbId, { keys, value: entryForm.value, priority: parseInt(entryForm.priority) || 5, pinned: entryForm.pinned });
    }
    setEntryForm({ keys: '', value: '', priority: '5', pinned: false }); setShowEntryForm(false);
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
  const entryBg = isDark ? 'bg-[#1a1a1a] border-[#333]' : 'bg-[#f5f5f5] border-[#eee]';
  const statusBarTemplates = getStatusBarTemplates();
  const protectedWorldBookIds = new Set(
    characters.filter((character) => character.protectionMode === 'protected' && character.worldBookId).map((character) => character.worldBookId as string),
  );

  return (
    <div className={"flex-1 overflow-y-auto p-3 sm:p-6 " + bg}>
      <div className="max-w-4xl mx-auto">
        <div className="flex gap-1 mb-4 border-b pb-0" style={{borderColor: isDark ? '#3a3a3a' : '#e2e2e2'}}>
          <button onClick={() => setTab('characters')}
            className={"px-4 py-2 text-sm rounded-t-lg border-b-0 transition-colors " + (tab === 'characters' ? tabActive : tabInactive)}>角色卡</button>
          <button onClick={() => { setTab('worldbooks'); loadWorldBooks(); }}
            className={"px-4 py-2 text-sm rounded-t-lg border-b-0 transition-colors " + (tab === 'worldbooks' ? tabActive : tabInactive)}>世界书</button>
          <button onClick={() => setTab('statusbar')}
            className={"px-4 py-2 text-sm rounded-t-lg border-b-0 transition-colors " + (tab === 'statusbar' ? tabActive : tabInactive)}>状态栏</button>
          <button onClick={() => setTab('extensions')}
            className={"px-4 py-2 text-sm rounded-t-lg border-b-0 transition-colors " + (tab === 'extensions' ? tabActive : tabInactive)}>拓展库</button>
        </div>

        {tab === 'characters' && (
          <>
            <div className="flex items-center justify-between mb-4 gap-3">
              <span className={"text-sm " + txt2}>{characters.length} 个角色</span>
              <div className="flex items-center gap-2">
                <button onClick={handleCreateCharacter} className={"px-3 py-1.5 text-sm rounded-lg " + btnGreen}>新建角色</button>
                <button onClick={handleImportCharacter} className={"px-3 py-1.5 text-sm rounded-lg " + btn}>导入角色</button>
                <button onClick={() => void handleDeleteSelectedCharacters()} className={"px-3 py-1.5 text-sm rounded-lg " + btnDel}>{characterSelectionMode ? (selectedCharacterIds.size > 0 ? '确认删除' : '取消选择') : '删除角色'}</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
              {characters.map((char) => (
                <div key={char.id} className="group cursor-pointer" onClick={() => openEdit(char)}>
                  <div className={"relative w-full max-w-[180px] mx-auto aspect-[2/3] rounded-2xl overflow-hidden border mb-2 transition-shadow " + card + " group-hover:shadow-lg"}
                    style={{boxShadow: isDark ? '' : '0 2px 8px rgba(0,0,0,0.06)'}}>
                    {characterSelectionMode && <label className="absolute top-2 left-2 z-10 flex items-center justify-center w-6 h-6 rounded-md bg-white/85 shadow-sm cursor-pointer" onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" checked={selectedCharacterIds.has(char.id)} onChange={(event) => {
                        event.stopPropagation();
                        setSelectedCharacterIds((previous) => {
                          const next = new Set(previous);
                          if (event.target.checked) next.add(char.id); else next.delete(char.id);
                          return next;
                        });
                      }} className="accent-[#3cb371]" aria-label={`选择${char.name}`}/>
                    </label>}
                    {char.coverImage ? (
                      <img src={char.coverImage} alt="" className="absolute inset-0 w-full h-full object-cover"/>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#d9f5e6] via-[#f7f7f7] to-[#c8e8d5]"/>
                    )}
                  </div>
                  <div className="text-center px-1">
                    <p className={"text-sm font-medium truncate " + txt}>{char.name}</p>
                  </div>
                </div>
              ))}
            </div>

            {characters.length === 0 && !showForm && (
              <p className={"text-sm text-center py-8 " + txt2}>还没有角色。点"新建角色"开始。</p>
            )}

            {showForm && editing && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowForm(false); setEditing(null); }}>
                <div className={"rounded-xl p-4 sm:p-6 w-[calc(100vw-1.5rem)] sm:w-[640px] max-h-[85vh] overflow-y-auto shadow-xl " + formBg} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={"text-sm font-semibold " + txt}>{editing.id ? '编辑角色' : '新建角色'}</h3>
                    {editing.id && (
                      <button onClick={async () => {
                        const conversationCount = (await Stores.getAllConversations()).filter((conversation) => conversation.characterId === editing.id).length;
                        const warning = `删除“${editing.name}”将同时删除 ${conversationCount} 个关联对话、全部关联消息和记忆条目。` +
                          '若存在未被其他角色绑定的同名世界书，也会一并删除。此操作不可恢复，是否继续？';
                        if (!confirm(warning)) return;
                        await deleteCharacter(editing.id!);
                        setShowForm(false);
                        setEditing(null);
                      }}
                        className={"px-3 py-1 text-xs rounded " + btnDel}>删除</button>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 items-start">
                      <div>
                        <label className={"text-xs block mb-1 " + txt2}>角色卡名字</label>
                        <input placeholder="角色名称" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
                          value={editing.name || ''} onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}/>
                      </div>
                      <div>
                        <label className={"text-xs block mb-1 " + txt2}>角色头像</label>
                        <div className="flex items-center gap-3 h-10">
                          <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center border"
                            style={{borderColor: isDark ? '#3a3a3a' : '#ddd'}}>
                            {isImageSource(editing.avatar) ? <img src={editing.avatar} alt="" className="w-full h-full object-cover"/> : <span className="text-xl">{editing.avatar || '🎭'}</span>}
                          </div>
                          <button onClick={() => fileRef.current?.click()} className={"px-3 py-1.5 text-xs rounded " + btn}>上传头像</button>
                          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload}/>
                        </div>
                      </div>
                      <div>
                        <label className={"text-xs block mb-1 " + txt2}>页面封面</label>
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-28 rounded-lg overflow-hidden flex items-center justify-center border bg-black/5"
                            style={{borderColor: isDark ? '#3a3a3a' : '#ddd'}}>
                            {editing.coverImage ? <img src={editing.coverImage} alt="" className="w-full h-full object-cover"/> : <span className={"text-[10px] " + txt2}>暂无封面</span>}
                          </div>
                          <div>
                            <button onClick={() => coverFileRef.current?.click()} className={"px-3 py-1.5 text-xs rounded " + btn}>上传封面</button>
                            <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload}/>
                            <p className={"text-[10px] mt-1 " + txt2}>仅显示在角色卡页面</p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className={"text-xs block mb-1 " + txt2}>开场白</label>
                        <textarea placeholder="你好！欢迎来到..." className={"w-full px-3 py-2 rounded-lg text-sm border h-28 resize-y " + inputCls}
                          value={editing.openingLine || ""} onChange={(e) => setEditing((prev) => ({ ...prev, openingLine: e.target.value }))}/>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={"text-xs block mb-1 " + txt2}>记忆识别角色名（可选）</label>
                      <input
                        placeholder="填写 AI 实际扮演角色；多角色用逗号分隔"
                        className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
                        value={(editing.memoryRoleNames || []).join(', ')}
                        onChange={(e) => setEditing((prev) => ({
                          ...prev,
                          memoryRoleNames: e.target.value.split(/[,，、]/).map((name) => name.trim()).filter(Boolean),
                        }))}
                      />
                    </div>
                    <div>
                      <label className={"text-xs block mb-1 " + txt2}>记忆叙事视角</label>
                      <select
                        className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
                        value={editing.memoryViewpoint || 'auto'}
                        onChange={(e) => setEditing((prev) => ({ ...prev, memoryViewpoint: e.target.value as Character['memoryViewpoint'] }))}
                      >
                        <option value="auto">自动跟随本轮回复</option>
                        <option value="first-person">第一人称</option>
                        <option value="third-person">第三人称</option>
                      </select>
                    </div>
                    </div>
                    <p className={"text-[10px] -mt-2 " + txt2}>第一人称留空时默认参考“当前角色”锚点；若卡名与 AI 实际身份不同，请填写实际角色名。第三人称可留空。</p>
                    <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={"text-xs block mb-1 " + txt2}>世界书绑定</label>
                      <select className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
                        value={editing.worldBookId || ''} onChange={async (e) => {
                          const val = e.target.value;
                          if (val === '__new__') {
                            if (!editing.name) return;
                            const wb = await addWorldBook(editing.name);
                            setEditing((prev) => ({ ...prev, worldBookId: wb.id }));
                            loadWorldBooks();
                          } else {
                            setEditing((prev) => ({ ...prev, worldBookId: val || undefined }));
                          }
                        }}>
                        <option value="">不绑定</option>
                        {!worldbooks.some((wb) => wb.name === editing.name) && (
                          <option value="__new__">+ 新建 "{editing.name}" 世界书</option>
                        )}
                        {worldbooks.map((wb) => (<option key={wb.id} value={wb.id}>{wb.name} ({wb.entries.length}条)</option>))}
                      </select>
                    </div>
                    <div>
                      <label className={"text-xs block mb-1 " + txt2}>状态栏绑定</label>
                      <select
                        className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
                        value={editing.statusBarTemplateName || (editing.statusBarTemplate ? '__current__' : '')}
                        onChange={(e) => {
                          const name = e.target.value;
                          if (!name) {
                            setEditing((prev) => ({ ...prev, statusBarTemplate: undefined, statusBarTemplateName: undefined }));
                            return;
                          }
                          if (name === '__current__') return;
                          const template = statusBarTemplates[name];
                          if (template) {
                            setEditing((prev) => ({
                              ...prev,
                              statusBarTemplate: cloneTemplate(template),
                              statusBarTemplateName: name,
                            }));
                          }
                        }}
                      >
                        <option value="">不绑定</option>
                        {editing.statusBarTemplate && !editing.statusBarTemplateName && (
                          <option value="__current__">当前已绑定状态栏</option>
                        )}
                        {Object.keys(statusBarTemplates).map((name) => (
                          <option key={name} value={name}>{name === 'dynamic-multi' ? '动态多人' : name}</option>
                        ))}
                      </select>
                    </div>
                    </div>
                    <div>
                      <label className={"text-xs block mb-1 " + txt2}>System Prompt</label>
                      <textarea className={"w-full px-3 py-2 rounded-lg text-sm border h-96 resize-y " + inputCls}
                        value={editing.systemPrompt || ''} onChange={(e) => setEditing((prev) => ({ ...prev, systemPrompt: e.target.value }))}/>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSave} className={"px-4 py-1.5 rounded-lg text-sm " + accent}>{editing.id ? '更新' : '保存'}</button>
                      <button onClick={() => { setShowForm(false); setEditing(null); }} className={"px-4 py-1.5 rounded-lg text-sm " + btn}>取消</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}


        {tab === 'statusbar' && (
          <>
            <StatusBarBuilder
              template={undefined}
              onSave={() => { loadCharacters(); }}
            />
          </>
        )}

        {tab === 'extensions' && (
          <ExtensionsPanel />
        )}

                {tab === 'worldbooks' && (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className={"text-sm " + txt2}>{worldbooks.length} 本世界书</span>
              <button onClick={() => setShowWbForm(true)} className={"px-3 py-1.5 text-sm rounded-lg " + btnGreen}>+ 新建</button>
            </div>
            {worldbooks.map((wb) => (
              <div key={wb.id} className={"mb-3 rounded-xl border overflow-hidden " + card}>
                <div className="flex items-center justify-between p-4 cursor-pointer hover:opacity-80"
                  onClick={() => { if (protectedWorldBookIds.has(wb.id)) return; setActiveWbId(wb.id); setExpanded((prev) => ({ ...prev, [wb.id]: !prev[wb.id] })); }}>
                  <div><span className={"font-medium " + txt}>{wb.name}</span><span className={"text-xs ml-2 " + txt2}>{wb.entries.length} 条目</span></div>
                  <button onClick={(e) => { e.stopPropagation(); void handleDeleteWorldBook(wb.id); }} className={"px-2 py-0.5 text-xs rounded " + btnDel}>删除</button>
                </div>
                {!protectedWorldBookIds.has(wb.id) && expanded[wb.id] && (
                  <div className={"p-4 pt-0 space-y-2 border-t " + (isDark ? 'border-[#3a3a3a]' : 'border-[#eee]')}>
                    {wb.entries.length === 0 && <p className={"text-xs " + txt2}>暂无条目。</p>}
                    {wb.entries.sort((a, b) => b.priority - a.priority).map((entry) => {
                      const e = entry as WorldBookEntry;
                      return (
                        <div key={e.id} className={"p-3 rounded-lg border flex items-start justify-between gap-2 " + entryBg}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap mb-1">
                              {e.keys.map((k: string) => {
                                const isPinned = e.pinned;
                                return <span key={k} className={"px-1.5 py-0.5 rounded text-xs " + (isPinned ? (isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700') : (isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'))}>{k}</span>;
                              })}
                              <span className={"text-xs ml-1 " + txt2}>P:{e.priority}</span>
                                
                            </div>
                            <p className={"text-xs line-clamp-2 " + txt}>{e.value}</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => { setEntryForm({ keys: e.keys.join(', '), value: e.value, priority: String(e.priority), pinned: e.pinned || false }); setEditingEntryId(e.id); setShowEntryForm(true); }}
                              className={"px-1.5 py-0.5 text-xs rounded " + btn}>编</button>
                            <button onClick={() => deleteEntry(wb.id, e.id)}
                              className={"px-1.5 py-0.5 text-xs rounded " + btnDel}>删</button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => { setShowEntryForm(true); setEditingEntryId(null); setEntryForm({ keys: '', value: '', priority: '5', pinned: false }); }}
                        className={"px-3 py-1 text-xs rounded " + btn}>+ 添加条目</button>
                      <button onClick={() => { const el = document.getElementById('imp-wb-' + wb.id); if (el) el.classList.toggle('hidden'); }}
                        className={"px-3 py-1 text-xs rounded " + btn}>导入 JSON</button>
                    </div>
                    <div id={'imp-wb-' + wb.id} className="hidden space-y-2 mt-2">
                      <textarea className={"w-full px-3 py-2 rounded-lg text-xs border h-24 resize-y " + inputCls}
                        placeholder='[{"keys":["关键词"],"value":"描述","priority":5}]'
                        value={importText} onChange={(e) => setImportText(e.target.value)}/>
                      {importError && <p className="text-red-500 text-xs">{importError}</p>}
                      <button onClick={async () => {
                        if (!activeWbId) return; if (protectedWorldBookIds.has(activeWbId)) { alert('该世界书属于加密角色卡，无法编辑条目。'); return; } setImportError('');
                        try { const data = JSON.parse(importText); const arr = Array.isArray(data) ? data : [data];
                          await bulkAddEntries(activeWbId, arr.map((e: any) => ({ keys: Array.isArray(e.keys) ? e.keys : [String(e.keys || '')], value: String(e.value || ''), priority: Number(e.priority) || 5 })));
                          setImportText(''); } catch { setImportError('JSON 格式无效'); }
                      }} className={"px-3 py-1 text-xs rounded " + accent}>确认导入</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {showWbForm && (
              <div className={"p-4 rounded-xl border space-y-3 " + formBg}>
                <input placeholder="世界书名称" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
                  value={wbName} onChange={(e) => setWbName(e.target.value)}/>
                <div className="flex gap-2">
                  <button onClick={handleAddWb} className={"px-4 py-1.5 rounded-lg text-sm " + accent}>创建</button>
                  <button onClick={() => setShowWbForm(false)} className={"px-4 py-1.5 rounded-lg text-sm " + btn}>取消</button>
                </div>
              </div>
            )}
            {showEntryForm && activeWbId && (
              <div className={"p-4 rounded-xl border space-y-3 mt-3 " + formBg}>
                <div className="flex gap-2 mb-2">
                <label className={"flex items-center gap-1 text-xs cursor-pointer " + txt}>
                  <input type="radio" checked={!entryForm.pinned} onChange={() => setEntryForm((prev) => ({ ...prev, pinned: false }))} className="accent-[#3cb371]"/>关键词触发
                </label>
                <label className={"flex items-center gap-1 text-xs cursor-pointer " + txt}>
                  <input type="radio" checked={entryForm.pinned} onChange={() => setEntryForm((prev) => ({ ...prev, pinned: true }))} className="accent-amber-500"/>📌 常驻
                </label>
              </div>
              {!entryForm.pinned && (
                <input placeholder="关键词（逗号分隔）" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
                  value={entryForm.keys} onChange={(e) => setEntryForm((prev) => ({ ...prev, keys: e.target.value }))}/>
              )}
                <textarea placeholder="条目内容" className={"w-full px-3 py-2 rounded-lg text-sm border h-24 resize-y " + inputCls}
                  value={entryForm.value} onChange={(e) => setEntryForm((prev) => ({ ...prev, value: e.target.value }))}/>
                <label className={"text-xs " + txt2}>优先级: <input type="number" min={1} max={10}
                  className={"w-16 ml-1 px-2 py-1 rounded text-sm border " + inputCls}
                  value={entryForm.priority} onChange={(e) => setEntryForm((prev) => ({ ...prev, priority: e.target.value }))}/></label>
                <div className="flex gap-2">
                  <button onClick={handleAddEntry} className={"px-4 py-1.5 rounded-lg text-sm " + accent}>{editingEntryId ? '更新' : '添加'}</button>
                  <button onClick={() => { setShowEntryForm(false); setEditingEntryId(null); }} className={"px-4 py-1.5 rounded-lg text-sm " + btn}>取消</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
