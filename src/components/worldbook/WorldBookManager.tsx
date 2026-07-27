import React, { useState, useEffect } from 'react';
import { useWorldBooks } from '../../hooks/useWorldBooks';
import { useApp } from '../../hooks/useApp';
import type { WorldBook, WorldBookEntry } from '../../types';

export function WorldBookManager() {
  const { worldbooks, loadWorldBooks, addWorldBook, deleteWorldBook, addEntry, updateEntry, deleteEntry, bulkAddEntries } = useWorldBooks();
  const { state } = useApp();
  const isDark = state.theme === 'dark';
  const [showForm, setShowForm] = useState(false);
  const [wbName, setWbName] = useState('');
  const [activeWbId, setActiveWbId] = useState<string | null>(null);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({ keys: '', value: '', priority: '5' });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  useEffect(() => { loadWorldBooks(); }, [loadWorldBooks]);

  const handleAddWb = async () => {
    if (!wbName.trim()) return;
    const wb = await addWorldBook(wbName.trim());
    setWbName(''); setShowForm(false); setActiveWbId(wb.id);
    setExpanded((prev) => ({ ...prev, [wb.id]: true }));
  };

  const handleAddEntry = async () => {
    if (!activeWbId || !entryForm.keys.trim() || !entryForm.value.trim()) return;
    const keys = entryForm.keys.split(',').map((k) => k.trim()).filter(Boolean);
    if (editingEntryId) {
      await updateEntry(activeWbId, editingEntryId, { keys, value: entryForm.value, priority: parseInt(entryForm.priority) || 5 });
      setEditingEntryId(null);
    } else {
      await addEntry(activeWbId, { keys, value: entryForm.value, priority: parseInt(entryForm.priority) || 5 });
    }
    setEntryForm({ keys: '', value: '', priority: '5' }); setShowEntryForm(false);
  };
  const handleDeleteWorldBook = async (id: string) => {
    try { await deleteWorldBook(id); } catch (error: any) { alert(error?.message || '世界书删除失败'); }
  };

  const bg = isDark ? 'bg-[#111]' : 'bg-[#f5f5f5]';
  const card = isDark ? 'bg-[#2a2a2a] border-[#3a3a3a]' : 'bg-white border-[#e2e2e2]';
  const formBg = isDark ? 'bg-[#2a2a2a] border-amber-500/30' : 'bg-white border-amber-400/30';
  const inputCls = isDark ? 'bg-[#1a1a1a] border-[#3a3a3a] text-[#e0e0e0]' : 'bg-[#f5f5f5] border-[#ddd] text-[#1a1a1a]';
  const txt = isDark ? 'text-[#e0e0e0]' : 'text-[#1a1a1a]';
  const txt2 = isDark ? 'text-[#888]' : 'text-[#666]';
  const btn = isDark ? 'bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]' : 'bg-[#e8e8e8] hover:bg-[#ddd] text-[#444]';
  const btnAdd = 'bg-[#3cb371] hover:bg-[#45c181] text-white';
  const btnDel = isDark ? 'bg-red-900/30 hover:bg-red-900/50 text-red-300' : 'bg-red-50 hover:bg-red-100 text-red-600';
  const accent = 'bg-amber-500 hover:bg-amber-600 text-white';
  const entryBg = isDark ? 'bg-[#1a1a1a] border-[#333]' : 'bg-[#f5f5f5] border-[#eee]';

  return (
    <div className={"flex-1 overflow-y-auto p-6 " + bg}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className={"text-lg font-semibold " + txt}>世界书管理</h2>
          <button onClick={() => setShowForm(true)} className={"px-3 py-1.5 text-sm rounded-lg " + btnAdd}>+ 新建世界书</button>
        </div>
        {worldbooks.length === 0 && <p className={"text-sm text-center py-8 " + txt2}>还没有世界书。</p>}
        {worldbooks.map((wb) => (
          <div key={wb.id} className={"mb-3 rounded-xl border overflow-hidden " + card}>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:opacity-80"
              onClick={() => { setActiveWbId(wb.id); setExpanded((prev) => ({ ...prev, [wb.id]: !prev[wb.id] })); }}>
              <div>
                <span className={"font-medium " + txt}>{wb.name}</span>
                <span className={"text-xs ml-2 " + txt2}>{wb.entries.length} 条目</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); void handleDeleteWorldBook(wb.id); }}
                className={"px-2 py-0.5 text-xs rounded " + btnDel}>删除</button>
            </div>
            {expanded[wb.id] && (
              <div className={"p-4 pt-0 space-y-2 border-t " + (isDark ? 'border-[#3a3a3a]' : 'border-[#eee]')}>
                {wb.entries.length === 0 && <p className={"text-xs " + txt2}>暂无条目。</p>}
                {wb.entries.sort((a, b) => b.priority - a.priority).map((entry) => (
                  <div key={entry.id} className={"p-3 rounded-lg border flex items-start justify-between gap-2 " + entryBg}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap mb-1">
                        {entry.keys.map((k) => (
                          <span key={k} className={"px-1.5 py-0.5 rounded text-xs " + (isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')}>{k}</span>
                        ))}
                        <span className={"text-xs ml-1 " + txt2}>P:{entry.priority}</span>
                      </div>
                      <p className={"text-xs line-clamp-2 " + txt}>{entry.value}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => { setEntryForm({ keys: entry.keys.join(', '), value: entry.value, priority: String(entry.priority) }); setEditingEntryId(entry.id); setShowEntryForm(true); }}
                        className={"px-1.5 py-0.5 text-xs rounded " + btn}>编</button>
                      <button onClick={() => deleteEntry(wb.id, entry.id)}
                        className={"px-1.5 py-0.5 text-xs rounded " + btnDel}>删</button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <button onClick={() => { setShowEntryForm(true); setEditingEntryId(null); setEntryForm({ keys: '', value: '', priority: '5' }); }}
                    className={"px-3 py-1 text-xs rounded " + btn}>+ 添加条目</button>
                  <button onClick={() => { const el = document.getElementById('imp-' + wb.id); if (el) el.classList.toggle('hidden'); }}
                    className={"px-3 py-1 text-xs rounded " + btn}>导入 JSON</button>
                </div>
                <div id={'imp-' + wb.id} className="hidden space-y-2 mt-2">
                  <textarea className={"w-full px-3 py-2 rounded-lg text-xs border h-24 resize-y " + inputCls}
                    placeholder='[{"keys":["关键词"],"value":"描述","priority":5}]'
                    value={importText} onChange={(e) => setImportText(e.target.value)}/>
                  {importError && <p className="text-red-500 text-xs">{importError}</p>}
                  <button onClick={async () => {
                    if (!activeWbId) return; setImportError('');
                    try { const data = JSON.parse(importText); const arr = Array.isArray(data) ? data : [data];
                      await bulkAddEntries(activeWbId, arr.map((e: any) => ({ keys: Array.isArray(e.keys) ? e.keys : [String(e.keys || '')], value: String(e.value || ''), priority: Number(e.priority) || 5 })));
                      setImportText(''); } catch { setImportError('JSON 格式无效'); }
                  }} className={"px-3 py-1 text-xs rounded " + accent}>确认导入</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {showForm && (
          <div className={"p-4 rounded-xl border space-y-3 " + formBg}>
            <input placeholder="世界书名称" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
              value={wbName} onChange={(e) => setWbName(e.target.value)}/>
            <div className="flex gap-2">
              <button onClick={handleAddWb} className={"px-4 py-1.5 rounded-lg text-sm " + accent}>创建</button>
              <button onClick={() => setShowForm(false)} className={"px-4 py-1.5 rounded-lg text-sm " + btn}>取消</button>
            </div>
          </div>
        )}
        {showEntryForm && activeWbId && (
          <div className={"p-4 rounded-xl border space-y-3 mt-3 " + formBg}>
            <input placeholder="关键词（逗号分隔）" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
              value={entryForm.keys} onChange={(e) => setEntryForm((prev) => ({ ...prev, keys: e.target.value }))}/>
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
    </div>
  );
}
