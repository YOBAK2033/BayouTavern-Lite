import React, { useEffect, useState } from 'react';
import { useApp } from '../../hooks/useApp';
import { useCharacters } from '../../hooks/useCharacters';
import type { ExtensionModule, GalleryCard, GalleryItem, GalleryRow } from '../../types';
import * as Stores from '../../db/stores';
import { generateId } from '../../utils/id';
import { GalleryCardView } from '../chat/GalleryCardView';

type ModuleType = 'model-shortcut' | 'gallery-shortcut';

function selectIds(event: React.ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.target.selectedOptions).map((option) => option.value);
}

export function ExtensionsPanel() {
  const { state } = useApp();
  const { characters } = useCharacters();
  const isDark = state.theme === 'dark';
  const [modules, setModules] = useState<ExtensionModule[]>([]);
  const [cards, setCards] = useState<GalleryCard[]>([]);
  const [moduleForm, setModuleForm] = useState<ExtensionModule | null>(null);
  const [cardForm, setCardForm] = useState<GalleryCard | null>(null);
  const [activeRowId, setActiveRowId] = useState('');
  const [itemDraft, setItemDraft] = useState({ type: 'image' as 'image' | 'video', url: '', title: '', caption: '' });
  const [buttonStyle, setButtonStyle] = useState<NonNullable<ExtensionModule['buttonStyle']>>(() => {
    try { return (localStorage.getItem('jg2_extension_button_style') as NonNullable<ExtensionModule['buttonStyle']>) || 'default'; } catch { return 'default'; }
  });
  const [showPrefixIcons, setShowPrefixIcons] = useState<boolean>(() => {
    try { return localStorage.getItem('jg2_extension_show_icons') !== 'false'; } catch { return true; }
  });

  const panel = isDark ? 'bg-[#111]' : 'bg-[#f5f5f5]';
  const card = isDark ? 'bg-[#2a2a2a] border-[#3a3a3a]' : 'bg-white border-[#e2e2e2]';
  const input = isDark ? 'bg-[#1a1a1a] border-[#3a3a3a] text-[#e0e0e0]' : 'bg-[#f5f5f5] border-[#ddd] text-[#1a1a1a]';
  const text = isDark ? 'text-[#e0e0e0]' : 'text-[#1a1a1a]';
  const muted = isDark ? 'text-[#999]' : 'text-[#777]';
  const button = isDark ? 'bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ddd]' : 'bg-[#e8e8e8] hover:bg-[#ddd] text-[#444]';
  const green = 'bg-[#3cb371] hover:bg-[#45c181] text-white';
  const danger = isDark ? 'bg-red-900/30 hover:bg-red-900/50 text-red-300' : 'bg-red-50 hover:bg-red-100 text-red-600';

  const load = async () => {
    const [rawModules, nextCards] = await Promise.all([Stores.getAllExtensionModules(), Stores.getAllGalleryCards()]);
    setModules(rawModules.filter((module) => module.type === 'model-shortcut' || module.type === 'gallery-shortcut')); setCards(nextCards);
  };
  useEffect(() => { void load(); }, []);

  const characterNames = (ids: string[]) => ids.map((id) => characters.find((character) => character.id === id)?.name || id).join('、');
  const newModule = (type: ModuleType) => setModuleForm({
    id: generateId(), type, name: type === 'model-shortcut' ? '新快捷指令' : '新图鉴快捷指令', characterIds: [], enabled: true,
    createdAt: Date.now(), updatedAt: Date.now(), prompt: type === 'model-shortcut' ? '时间跳到第二天' : undefined,
    showIcon: true, icon: type === 'gallery-shortcut' ? '🖼️' : '⚡', buttonStyle: 'default',
  });

  const saveModule = async () => {
    if (!moduleForm?.name.trim()) { alert('请填写名称。'); return; }
    if (moduleForm.type === 'model-shortcut' && !moduleForm.prompt?.trim()) { alert('快捷键需要填写隐藏指令。'); return; }
    if (moduleForm.type === 'gallery-shortcut' && !moduleForm.galleryCardId) { alert('请选择要显示的图鉴卡片。'); return; }
    if (modules.some((item) => item.id === moduleForm.id)) await Stores.updateExtensionModule(moduleForm.id, moduleForm);
    else await Stores.addExtensionModule(moduleForm);
    setModuleForm(null); await load();
  };

  const deleteModule = async (module: ExtensionModule) => {
    if (!confirm(`删除“${module.name}”？`)) return;
    try { await Stores.deleteExtensionModule(module.id); await load(); } catch (error: any) { alert(error?.message || '拓展删除失败'); }
  };
  const unbindModule = async (module: ExtensionModule) => {
    await Stores.updateExtensionModule(module.id, { characterIds: [] });
    await load();
  };

  const syncGalleryRows = (galleryCard: GalleryCard, preferredRowId = activeRowId): GalleryRow[] => {
    const itemIds = new Set(galleryCard.items.map((item) => item.id));
    const existing = galleryCard.rows?.length
      ? galleryCard.rows.map((row) => ({ ...row, itemIds: row.itemIds.filter((id) => itemIds.has(id)) }))
      : [{ id: generateId(), title: '', itemIds: galleryCard.items.map((item) => item.id) }];
    const rows = existing.length ? existing : [{ id: generateId(), title: '', itemIds: [] }];
    const assigned = new Set(rows.flatMap((row) => row.itemIds));
    const orphanIds = galleryCard.items.map((item) => item.id).filter((id) => !assigned.has(id));
    if (orphanIds.length) {
      const target = rows.find((row) => row.id === preferredRowId) || rows[0];
      target.itemIds = [...target.itemIds, ...orphanIds];
    }
    return rows;
  };

  useEffect(() => {
    if (!cardForm) { setActiveRowId(''); return; }
    const rows = syncGalleryRows(cardForm);
    const wantedCount = cardForm.layout === 'stacked' && !cardForm.items.some((item) => item.type === 'video')
      ? Math.max(1, Math.min(5, cardForm.gridRows || rows.length)) : 1;
    let nextRows = rows;
    if (wantedCount > rows.length) {
      nextRows = [...rows, ...Array.from({ length: wantedCount - rows.length }, () => ({ id: generateId(), title: '', itemIds: [] }))];
    } else if (wantedCount < rows.length) {
      const kept = rows.slice(0, wantedCount);
      rows.slice(wantedCount).forEach((row) => { kept[kept.length - 1].itemIds.push(...row.itemIds); });
      nextRows = kept;
    }
    const same = JSON.stringify(nextRows) === JSON.stringify(cardForm.rows || []);
    const normalizedGridRows = cardForm.layout === 'stacked' && !cardForm.items.some((item) => item.type === 'video') ? nextRows.length : cardForm.gridRows;
    if (!same || normalizedGridRows !== cardForm.gridRows) setCardForm({ ...cardForm, rows: nextRows, gridRows: normalizedGridRows });
    if (!activeRowId || !nextRows.some((row) => row.id === activeRowId)) setActiveRowId(nextRows[0]?.id || '');
  }, [cardForm?.id, cardForm?.items.length, cardForm?.gridRows, cardForm?.layout, cardForm?.rows?.length]);

  const updateGalleryRow = (rowId: string, patch: Partial<GalleryRow>) => {
    if (!cardForm) return;
    setCardForm({ ...cardForm, rows: syncGalleryRows(cardForm).map((row) => row.id === rowId ? { ...row, ...patch } : row) });
  };
  const addGalleryRow = () => {
    if (!cardForm || cardForm.items.some((item) => item.type === 'video')) return;
    const row: GalleryRow = { id: generateId(), title: '', itemIds: [] };
    setCardForm({ ...cardForm, layout: 'stacked', gridRows: (cardForm.rows?.length || 1) + 1, rows: [...syncGalleryRows(cardForm), row] });
    setActiveRowId(row.id);
  };
  const removeGalleryRow = (rowId: string) => {
    if (!cardForm || (cardForm.rows?.length || 1) <= 1) return;
    const rows = syncGalleryRows(cardForm);
    const removed = rows.find((row) => row.id === rowId);
    const kept = rows.filter((row) => row.id !== rowId);
    if (removed) kept[0].itemIds = [...kept[0].itemIds, ...removed.itemIds];
    setCardForm({ ...cardForm, gridRows: kept.length, rows: kept });
    setActiveRowId(kept[0].id);
  };
  const removeCardItem = (itemId: string) => {
    if (!cardForm) return;
    setCardForm({ ...cardForm, items: cardForm.items.filter((item) => item.id !== itemId), rows: syncGalleryRows(cardForm).map((row) => ({ ...row, itemIds: row.itemIds.filter((id) => id !== itemId) })) });
  };

  const newCard = () => setCardForm({ id: generateId(), title: '新图鉴卡片', characterIds: [], items: [], layout: 'stacked', createdAt: Date.now(), updatedAt: Date.now() });
  const addRemoteItem = () => {
    if (!cardForm || !itemDraft.url.trim()) return;
    try { const url = new URL(itemDraft.url.trim()); if (url.protocol !== 'https:') throw new Error(); } catch { alert('在线媒体必须使用有效的 HTTPS 链接。'); return; }
    const item: GalleryItem = { id: generateId(), type: itemDraft.type, source: 'remote', url: itemDraft.url.trim(), title: itemDraft.title.trim(), caption: itemDraft.caption.trim() };
    setCardForm({ ...cardForm, items: [...cardForm.items, item], layout: item.type === 'video' ? 'carousel' : cardForm.layout });
    setItemDraft({ ...itemDraft, url: '', title: '', caption: '' });
  };

  const handleLocalItem = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !cardForm) return;
    if (itemDraft.type === 'video' && file.size > 20 * 1024 * 1024) { alert('本地视频不能超过 20MB。'); return; }
    if (itemDraft.type === 'image' && !file.type.startsWith('image/')) { alert('请选择图片或 GIF 文件。'); return; }
    if (itemDraft.type === 'video' && !file.type.startsWith('video/')) { alert('请选择视频文件。'); return; }
    const assetId = await Stores.addImageAsset({ kind: itemDraft.type === 'video' ? 'video' : 'gallery', mimeType: file.type, width: 0, height: 0, blob: file });
    const item: GalleryItem = { id: generateId(), type: itemDraft.type, source: 'local', assetId, title: itemDraft.title.trim(), caption: itemDraft.caption.trim() };
    setCardForm({ ...cardForm, items: [...cardForm.items, item], layout: item.type === 'video' ? 'carousel' : cardForm.layout });
    setItemDraft({ ...itemDraft, title: '', caption: '' }); event.target.value = '';
  };

  const saveCard = async () => {
    if (!cardForm?.title.trim() || cardForm.items.length === 0) { alert('请填写标题并至少添加一项媒体。'); return; }
    if (cards.some((item) => item.id === cardForm.id)) await Stores.updateGalleryCard(cardForm.id, cardForm);
    else await Stores.addGalleryCard(cardForm);
    setCardForm(null); await load();
  };
  const cardHasVideo = Boolean(cardForm?.items.some((item) => item.type === 'video'));

  const deleteCard = async (galleryCard: GalleryCard) => {
    if (!confirm(`删除图鉴卡片“${galleryCard.title}”？`)) return;
    try { await Stores.deleteGalleryCard(galleryCard.id); await load(); } catch (error: any) { alert(error?.message || '图鉴删除失败'); }
  };

  const moduleList = (type: ModuleType) => modules.filter((module) => module.type === type);
  const moduleEditor = (type: ModuleType) => moduleForm?.type === type && (
    <div className={'mt-3 rounded-lg border p-3 ' + (isDark ? 'border-[#444] bg-[#202020]' : 'border-[#eee] bg-[#fafafa]')}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input className={'px-2.5 py-1 rounded border text-xs ' + input} value={moduleForm.name} onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })} placeholder="名称" />
        <select multiple size={Math.min(2, Math.max(1, characters.length))} className={'h-10 px-2 py-1 rounded border text-xs ' + input} value={moduleForm.characterIds} onChange={(e) => setModuleForm({ ...moduleForm, characterIds: selectIds(e) })}>
          {characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
        </select>
        {type === 'model-shortcut' ? (
          <textarea className={'md:col-span-2 px-2.5 py-1.5 rounded border text-xs h-16 resize-y ' + input} value={moduleForm.prompt || ''} onChange={(e) => setModuleForm({ ...moduleForm, prompt: e.target.value })} placeholder="发送给模型的隐藏指令，例如：时间跳到第二天" />
        ) : (
          <select className={'md:col-span-2 px-2.5 py-1.5 rounded border text-xs ' + input} value={moduleForm.galleryCardId || ''} onChange={(e) => setModuleForm({ ...moduleForm, galleryCardId: e.target.value })}>
            <option value="">选择图鉴卡片</option>{cards.map((galleryCard) => <option key={galleryCard.id} value={galleryCard.id}>{galleryCard.title}</option>)}
          </select>
        )}
        <div className="md:col-span-2 flex flex-wrap items-center gap-2 pt-1"><input className={'w-16 px-2 py-1 rounded border text-xs ' + input} value={moduleForm.icon || ''} onChange={(e) => setModuleForm({ ...moduleForm, icon: e.target.value })} placeholder="图标" /></div>
      </div>
      <div className="flex gap-2 mt-2"><button onClick={() => void saveModule()} className={'px-3 py-1 text-xs rounded ' + green}>保存</button><button onClick={() => setModuleForm(null)} className={'px-3 py-1 text-xs rounded ' + button}>取消</button></div>
    </div>
  );

  const renderModuleSection = (type: ModuleType, title: string, icon: string) => (
    <section className={'rounded-xl border p-4 ' + card}>
      <div className="flex items-center justify-between gap-3">
        <div><h2 className={'text-sm font-semibold ' + text}>{icon} {title}</h2><p className={'text-[11px] mt-1 ' + muted}>{type === 'model-shortcut' ? '发送隐藏指令给模型，用户不会看到这条指令。' : '点击后直接显示图鉴，不调用模型。'}</p></div>
        <button onClick={() => newModule(type)} className={'px-2.5 py-1 text-xs rounded ' + green}>+ 新建</button>
      </div>
      <div className="space-y-2 mt-3">
        {moduleList(type).map((module) => <div key={module.id} className={'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ' + (isDark ? 'border-[#3a3a3a] bg-[#202020]' : 'border-[#eee] bg-[#fafafa]')}>
          <div className="min-w-0"><div className={'text-xs font-medium truncate ' + text}>{module.name}</div><div className={'text-[10px] mt-0.5 truncate ' + muted}>绑定：{characterNames(module.characterIds) || '未绑定'}</div></div>
          <div className="flex gap-1 flex-shrink-0"><button onClick={() => void unbindModule(module)} disabled={module.characterIds.length === 0} className={'px-2 py-1 text-[10px] rounded ' + button}>解除绑定</button><button onClick={() => setModuleForm({ ...module })} className={'px-2 py-1 text-[10px] rounded ' + button}>编辑</button><button onClick={() => void deleteModule(module)} className={'px-2 py-1 text-[10px] rounded ' + danger}>删除</button></div>
        </div>)}
        {moduleList(type).length === 0 && <p className={'text-xs py-3 text-center ' + muted}>暂无内容</p>}
      </div>
      {moduleEditor(type)}
    </section>
  );

  const unifiedButtonClass = (style: NonNullable<ExtensionModule['buttonStyle']>) => {
    if (style === 'white') return 'bg-white border-[#ddd] text-[#333]';
    if (style === 'black') return 'bg-[#111] border-[#111] text-white';
    if (style === 'borderless') return isDark ? 'bg-[#2a2a2a] border-transparent text-[#ddd]' : 'bg-white border-transparent text-[#555]';
    if (style === 'green') return 'bg-[#3cb371] border-[#3cb371] text-white';
    return isDark ? 'bg-[#2a2a2a] border-[#4a4a4a] text-[#ddd]' : 'bg-[#fafafa] border-[#ddd] text-[#555]';
  };

  const updateButtonStyle = (style: NonNullable<ExtensionModule['buttonStyle']>) => {
    setButtonStyle(style);
    try { localStorage.setItem('jg2_extension_button_style', style); } catch {}
    window.dispatchEvent(new Event('jg2:extensions-style-changed'));
  };
  const updatePrefixIcons = (enabled: boolean) => {
    setShowPrefixIcons(enabled);
    try { localStorage.setItem('jg2_extension_show_icons', String(enabled)); } catch {}
    window.dispatchEvent(new Event('jg2:extensions-style-changed'));
  };

  return (
    <div className={'flex-1 overflow-y-auto p-5 ' + panel}>
      <div className="max-w-5xl mx-auto space-y-4">
        <section className={'rounded-xl border p-3 ' + card}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0"><h2 className={'text-sm font-semibold ' + text}>✨ 快捷键样式</h2><p className={'text-[11px] mt-1 ' + muted}>指令快捷键和图鉴快捷键共用此样式。</p></div>
            <select className={'px-2 py-1.5 rounded border text-xs ' + input} value={buttonStyle} onChange={(e) => updateButtonStyle(e.target.value as NonNullable<ExtensionModule['buttonStyle']>)}>
              <option value="default">标准</option><option value="white">白色</option><option value="black">黑色</option><option value="borderless">透明</option><option value="green">绿色</option>
            </select>
            <label className={'flex items-center gap-1 text-xs whitespace-nowrap ' + muted}><input type="checkbox" checked={showPrefixIcons} onChange={(e) => updatePrefixIcons(e.target.checked)} />显示前缀</label>
            <div className="flex gap-2 overflow-x-auto">
              <span className={'px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ' + unifiedButtonClass(buttonStyle)}>{showPrefixIcons ? '⚡ ' : ''}快捷指令</span>
              <span className={'px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ' + unifiedButtonClass(buttonStyle)}>{showPrefixIcons ? '🖼️ ' : ''}图鉴快捷键</span>
            </div>
          </div>
        </section>
        {renderModuleSection('model-shortcut', '快捷键指令', '⚡')}
        {renderModuleSection('gallery-shortcut', '图鉴快捷键', '🖼️')}

        <section className={'rounded-xl border p-4 ' + card}>
          <div className="flex items-center justify-between gap-3"><div><h2 className={'text-sm font-semibold ' + text}>📚 图鉴卡片册</h2><p className={'text-[11px] mt-1 ' + muted}>每张卡片可放多张图片、GIF 或视频，并在对话中横向滑动查看。</p></div><button onClick={newCard} className={'px-2.5 py-1 text-xs rounded ' + green}>+ 新建卡片</button></div>
          <div className="space-y-2 mt-3">
            {cards.map((galleryCard) => <div key={galleryCard.id} className={'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ' + (isDark ? 'border-[#3a3a3a] bg-[#202020]' : 'border-[#eee] bg-[#fafafa]')}><div className="min-w-0"><div className={'text-xs font-medium truncate ' + text}>{galleryCard.title}</div><div className={'text-[10px] mt-0.5 truncate ' + muted}>{galleryCard.items.length} 项媒体 · 可被图鉴快捷键引用</div></div><div className="flex gap-1 flex-shrink-0"><button onClick={() => setCardForm({ ...galleryCard })} className={'px-2 py-1 text-[10px] rounded ' + button}>编辑</button><button onClick={() => void deleteCard(galleryCard)} className={'px-2 py-1 text-[10px] rounded ' + danger}>删除</button></div></div>)}
            {cards.length === 0 && <p className={'text-xs py-3 text-center ' + muted}>暂无图鉴卡片</p>}
          </div>

          {cardForm && <div className={'mt-3 rounded-lg border p-3 ' + (isDark ? 'border-[#444] bg-[#202020]' : 'border-[#eee] bg-[#fafafa]')}>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-4">
              <div className="space-y-2 min-w-0">
                {!cardHasVideo && <div className={'rounded-lg border p-2 space-y-2 ' + (isDark ? 'border-[#444]' : 'border-[#eee]')}>
                  <div className="flex items-center justify-between gap-2">
                    <div><div className={'text-xs font-medium ' + text}>行分组</div><div className={'text-[10px] mt-0.5 ' + muted}>每一行可以有自己的标题和任意数量的图片；每行内部可横向滑动。</div></div>
                    <button onClick={addGalleryRow} className={'px-2 py-1 text-[10px] rounded ' + button}>+ 添加一行</button>
                  </div>
                  {(cardForm.rows || []).map((row, index) => <div key={row.id} className={'grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1.5 rounded border p-1.5 ' + (isDark ? 'border-[#444] bg-[#1a1a1a]' : 'border-[#eee] bg-white')}>
                    <input className={'min-w-0 px-2 py-1 rounded border text-xs ' + input} value={row.title} onChange={(e) => updateGalleryRow(row.id, { title: e.target.value })} placeholder={`第${index + 1}行标题（可选）`} />
                    <button onClick={() => setActiveRowId(row.id)} className={'px-2 py-1 text-[10px] rounded ' + (activeRowId === row.id ? green : button)}>{activeRowId === row.id ? '当前行' : '选择本行'}</button>
                    <span className={'text-[10px] whitespace-nowrap ' + muted}>{row.itemIds.length}项</span>
                    <button onClick={() => removeGalleryRow(row.id)} disabled={(cardForm.rows || []).length <= 1} className={'px-2 py-1 text-[10px] rounded ' + danger}>删除</button>
                  </div>)}
                  <div className={'text-[10px] ' + muted}>新媒体会加入“当前行”：{(cardForm.rows || []).find((row) => row.id === activeRowId)?.title || '未命名行'}</div>
                </div>}
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2"><input className={'px-2.5 py-1.5 rounded border text-xs ' + input} value={cardForm.title} onChange={(e) => setCardForm({ ...cardForm, title: e.target.value })} placeholder="图鉴标题（固定靠左）" /><select className={'px-2 py-1.5 rounded border text-xs ' + input} value={cardHasVideo ? 'carousel' : (cardForm.layout || 'carousel')} disabled={cardHasVideo} onChange={(e) => setCardForm({ ...cardForm, layout: e.target.value as GalleryCard['layout'] })}><option value="carousel">横向滑动</option><option value="stacked">多行排列</option></select>{!cardHasVideo && cardForm.layout === 'stacked' && <select className={'px-2 py-1.5 rounded border text-xs ' + input} value={cardForm.gridRows || 2} onChange={(e) => setCardForm({ ...cardForm, gridRows: Number(e.target.value) })}><option value={1}>1行</option><option value={2}>2行</option><option value={3}>3行</option><option value={4}>4行</option><option value={5}>5行</option></select>}<label className={'flex items-center gap-1 text-xs whitespace-nowrap ' + muted}><input type="checkbox" checked={!cardForm.hideTitle} onChange={(e) => setCardForm({ ...cardForm, hideTitle: !e.target.checked })} />显示头部标题</label><label className={'flex items-center gap-1 text-xs whitespace-nowrap ' + muted}><input type="checkbox" checked={Boolean(cardForm.mediaTextBold)} onChange={(e) => setCardForm({ ...cardForm, mediaTextBold: e.target.checked })} />媒体说明加粗</label></div>
                <textarea className={'w-full px-2.5 py-1.5 rounded border text-xs h-12 resize-y ' + input} value={cardForm.description || ''} onChange={(e) => setCardForm({ ...cardForm, description: e.target.value })} placeholder="图鉴说明（可选）" />
                <div className={'rounded-lg border p-2 space-y-2 ' + (isDark ? 'border-[#444]' : 'border-[#eee')}>
                  <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-2"><select className={'px-2 py-1 rounded border text-xs ' + input} value={itemDraft.type} onChange={(e) => setItemDraft({ ...itemDraft, type: e.target.value as 'image' | 'video' })}><option value="image">图片/GIF</option><option value="video">视频</option></select><input className={'px-2 py-1 rounded border text-xs ' + input} value={itemDraft.title} onChange={(e) => setItemDraft({ ...itemDraft, title: e.target.value })} placeholder="媒体标题" /></div>
                  <input className={'w-full px-2 py-1 rounded border text-xs ' + input} value={itemDraft.url} onChange={(e) => setItemDraft({ ...itemDraft, url: e.target.value })} placeholder="HTTPS 在线图片/视频/GIF 链接" /><input className={'w-full px-2 py-1 rounded border text-xs ' + input} value={itemDraft.caption} onChange={(e) => setItemDraft({ ...itemDraft, caption: e.target.value })} placeholder="媒体说明（可选）" />
                  <div className="flex gap-2"><button onClick={addRemoteItem} className={'px-2 py-1 text-[10px] rounded ' + button}>添加在线媒体</button><label className={'px-2 py-1 text-[10px] rounded cursor-pointer ' + button}>上传本地<input type="file" accept={itemDraft.type === 'video' ? 'video/*' : 'image/*'} className="hidden" onChange={(e) => void handleLocalItem(e)} /></label></div>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto">{cardForm.items.map((item) => <div key={item.id} className={'flex items-center justify-between gap-2 text-[10px] p-1.5 rounded ' + (isDark ? 'bg-[#1a1a1a]' : 'bg-[#f5f5f5')}><span className={'truncate ' + text}>{item.type === 'video' ? '🎬' : '🖼️'} {item.title || item.url || '本地媒体'}</span><button onClick={() => removeCardItem(item.id)} className="text-red-500 flex-shrink-0">删除</button></div>)}</div>
                <div className="flex gap-2"><button onClick={() => void saveCard()} className={'px-3 py-1 text-xs rounded ' + green}>保存卡片</button><button onClick={() => setCardForm(null)} className={'px-3 py-1 text-xs rounded ' + button}>取消</button></div>
              </div>
              <div className="min-w-0"><div className={'text-[11px] mb-2 ' + muted}>实时预览</div><GalleryCardView card={cardForm} isDark={isDark} /></div>
            </div>
            <p className={'text-[10px] mt-2 ' + muted}>在线媒体需要 HTTPS；第三方链接可能失效，重要素材建议上传本地或使用稳定 CDN。</p>
          </div>}
        </section>
      </div>
    </div>
  );
}
