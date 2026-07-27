import React, { useState } from 'react';
import { useModels } from '../../hooks/useModels';
import { useApp } from '../../hooks/useApp';
import { apiFetch } from '../../utils/apiFetch';
import { PING_TIMEOUT } from '../../utils/constants';
import type { ModelConfig } from '../../types';

export function ModelManager() {
  const { models, addModel, updateModel, deleteModel } = useModels();
  const { state } = useApp();
  const isDark = state.theme === 'dark';
  const [editing, setEditing] = useState<Partial<ModelConfig> | null>(null);
  const [pingResult, setPingResult] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);

  const handleSave = async () => {
    if (!editing?.name || !editing?.baseUrl || !editing?.defaultModel) return;
    if (editing.id) {
      await updateModel(editing.id, {
        name: editing.name, baseUrl: editing.baseUrl, apiKey: editing.apiKey || '',
        defaultModel: editing.defaultModel,
        maxContextTokens: editing.maxContextTokens ?? 4000,
        temperature: editing.temperature ?? 0.8, topP: editing.topP ?? 0.95,
      });
    } else {
      await addModel({
        name: editing.name, baseUrl: editing.baseUrl, apiKey: editing.apiKey || '',
        defaultModel: editing.defaultModel, latency: -1,
        maxContextTokens: editing.maxContextTokens ?? 4000,
        temperature: editing.temperature ?? 0.8, topP: editing.topP ?? 0.95,
      });
    }
    setEditing(null); setShowForm(false);
  };

  const handlePing = async (model: ModelConfig) => {
    setPingResult((prev) => ({ ...prev, [model.id]: '⏳' }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);
      const resp = await fetch(model.baseUrl.replace(/\/+$/, '') + '/models', {
        headers: { Authorization: `Bearer ${model.apiKey}` },
        signal: controller.signal,
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

  return (
    <div className={"flex-1 overflow-y-auto p-6 " + bg}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className={"text-lg font-semibold " + txt}>API 模型配置</h2>
          <button onClick={() => { setEditing({ temperature: 0.8, topP: 0.95, maxContextTokens: 4000 }); setShowForm(true); }}
            className={"px-3 py-1.5 text-sm rounded-lg " + btnAdd}>+ 新增</button>
        </div>

        {models.length === 0 && !showForm && (
          <p className={"text-sm text-center py-8 " + txt2}>还没有配置任何 AI 模型。</p>
        )}

        {models.map((m) => (
          <div key={m.id} className={"mb-3 p-4 rounded-xl border " + card}>
            <div className="flex items-center justify-between mb-2">
              <span className={"font-medium " + txt}>{m.name}</span>
              <div className="flex gap-2">
                <button onClick={() => handlePing(m)} className={"px-2 py-0.5 text-xs rounded " + btn}>Ping {pingResult[m.id] || ''}</button>
                <button onClick={() => { setEditing({ ...m }); setShowForm(true); }} className={"px-2 py-0.5 text-xs rounded " + btn}>编辑</button>
                <button onClick={() => deleteModel(m.id)} className={"px-2 py-0.5 text-xs rounded " + btnDel}>删除</button>
              </div>
            </div>
            <div className={"text-xs space-y-0.5 " + txt2}>
              <div>URL: {m.baseUrl}</div>
              <div>Model: {m.defaultModel}</div>
              <div>Context: {m.maxContextTokens} t | T: {m.temperature} | Top-P: {m.topP}</div>
            </div>
          </div>
        ))}

        {showForm && editing && (
          <div className={"p-4 rounded-xl border space-y-3 " + formBg}>
            <input placeholder="名称" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
              value={editing.name || ''} onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}/>
            <input placeholder="Base URL" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
              value={editing.baseUrl || ''} onChange={(e) => setEditing((prev) => ({ ...prev, baseUrl: e.target.value }))}/>
            <input placeholder="API Key" type="password" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
              value={editing.apiKey || ''} onChange={(e) => setEditing((prev) => ({ ...prev, apiKey: e.target.value }))}/>
            <input placeholder="模型名称" className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
              value={editing.defaultModel || ''} onChange={(e) => setEditing((prev) => ({ ...prev, defaultModel: e.target.value }))}/>
            <div>
              <label className={"text-xs block mb-1 " + txt2}>最大上下文 Token: {editing.maxContextTokens ?? 4000}</label>
              <input type="number" min={1000} max={128000} step={1000} className={"w-full px-3 py-2 rounded-lg text-sm border " + inputCls}
                value={editing.maxContextTokens ?? 4000} onChange={(e) => setEditing((prev) => ({ ...prev, maxContextTokens: parseInt(e.target.value) || 4000 }))}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={"text-xs block mb-1 " + txt2}>Temperature: {editing.temperature ?? 0.8}</label>
                <input type="range" min={0} max={2} step={0.05} className="w-full accent-[#3cb371]"
                  value={editing.temperature ?? 0.8} onChange={(e) => setEditing((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))}/>
              </div>
              <div>
                <label className={"text-xs block mb-1 " + txt2}>Top-P: {editing.topP ?? 0.95}</label>
                <input type="range" min={0} max={1} step={0.05} className="w-full accent-[#3cb371]"
                  value={editing.topP ?? 0.95} onChange={(e) => setEditing((prev) => ({ ...prev, topP: parseFloat(e.target.value) }))}/>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} className={"px-4 py-1.5 rounded-lg text-sm " + accent}>{editing.id ? '更新' : '保存'}</button>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className={"px-4 py-1.5 rounded-lg text-sm " + btn}>取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
