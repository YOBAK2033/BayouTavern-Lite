import { useState, useRef, useCallback } from 'react';
import type { ModelConfig, MessageNode, AssembledContext, AssembledMessage, Conversation, WorldBookEntry } from '../types';
import { SSEParser } from '../utils/sse';
import { estimateTokens, stripReasoningBlocks } from '../utils/encoding';
import { apiFetch } from '../utils/apiFetch';
import { buildSamplingParams, chatCompletionsUrl, DEFAULT_TPL_USER_WRAPPER, DEFAULT_TPL_IDENTITY_ANCHOR, DEFAULT_TPL_MEMORY_PREFIX, DEFAULT_TPL_OPENING_LINE_PREFIX, DEFAULT_TPL_WORLD_BOOK_PREFIX } from '../utils/constants';
import { generateId } from '../utils/id';
import * as Stores from '../db/stores';
import { getMemories, saveMemories, extractKeywords, normalizeMemoryKeywords, searchMemories } from './useMemory';
import { callSubAI } from '../utils/subAI';
import { SUB_AI_SYSTEM_PROMPT } from '../utils/constants';
import { applyLinkedStatusFields, createInitialStatusSnapshot, getStatusFieldKeys, isStatusTextField } from '../utils/statusBar';

const STREAM_IDLE_TIMEOUT_MS = 30_000;

function normalizeNumericStatusValue(field: any, rawValue: unknown): number | null {
  const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(numericValue)) return null;
  if (field?.decimalPlaces === 1) return Math.round(numericValue * 10) / 10;
  return numericValue;
}

function resolveMemoryRoleNames(identityTemplate: string | undefined, fallbackName: string | undefined): string[] {
  if (!fallbackName) return [];
  const filled = (identityTemplate || DEFAULT_TPL_IDENTITY_ANCHOR).replace(/{charName}/g, fallbackName).trim();
  const match = filled.match(/当前角色\s*[:：]\s*([^\]\n]+)/);
  return match?.[1]?.trim() ? [match[1].trim()] : [];
}

export interface UseChatDeps {
  conversation: Conversation | null;
  getModelById: (id: string) => Promise<ModelConfig | undefined>;
  onNodesRefresh: (nodes: MessageNode[]) => void;
  memoryEnabled: boolean;
  thinkingEnabled: boolean;
  recentRounds: number;
  maxWorldBookEntries: number;
  maxMemoryEntries: number;
  tplUserWrapper?: string;
  tplIdentityAnchor?: string;
  tplMemoryPrefix?: string;
  tplOpeningLinePrefix?: string;
  tplWorldBookPrefix?: string;
  subAIModelId?: string | null;
  memoryTriggerInterval?: number;
  subAIPrompt?: string;
}

function scanWorldBook(wbId: string | undefined, text: string, allWorldBooks: any[], max: number): WorldBookEntry[] {
  if (!wbId) return [];
  const wb = allWorldBooks.find((w: any) => w.id === wbId);
  if (!wb) return [];
  const hits = wb.entries.filter((e: any) =>
    e.keys.some((k: string) => text.toLowerCase().includes(k.toLowerCase()))
  );
  return hits.sort((a: any, b: any) => b.priority - a.priority).slice(0, max);
}

function serializeStatusSnapshot(template: any, snapshot: any): string {
  const output: Record<string, any> = {};
  const hasDynamicGroups = Array.isArray(template?.dynamicGroups) && template.dynamicGroups.length > 0;
  if (hasDynamicGroups) output.global = {};
  const globalOutput = hasDynamicGroups ? output.global : output;
  for (const field of template?.fields || []) {
    if (field.type === 'achievement') continue;
    if (isStatusTextField(field)) {
      globalOutput[field.key] = snapshot?.textValues?.[field.key] ?? field.initial ?? '';
    } else {
      globalOutput[field.key] = snapshot?.values?.[field.key] ?? field.initial ?? 0;
    }
  }
  if (hasDynamicGroups) {
    output.dynamic = {};
    for (const group of template.dynamicGroups) {
      output.dynamic[group.id] = {
        active: (snapshot?.dynamicGroups?.[group.id] || []).filter((instance: any) => (instance.lifecycle || 'active') === 'active').map((instance: any) => ({
          id: instance.id,
          name: instance.name,
          icon: instance.icon,
          values: instance.values || {},
          textValues: instance.textValues || {},
        })),
      };
    }
  }
  return JSON.stringify(output);
}

export function parseStatusBar(content: string, prevSnapshot: any, template: any): { text: string; snapshot: any } | null {
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  const fieldMap = new Map(fields.map((field: any) => [field.key, field]));
  const dynamicGroups = Array.isArray(template?.dynamicGroups) ? template.dynamicGroups : [];
  const dynamicMap = new Map(dynamicGroups.map((group: any) => [group.id, group]));
  if (fieldMap.size === 0 && dynamicMap.size === 0) return null;

  const lines = content.split(/\r?\n/);
  const marker = '<!--STATUS-->';
  let lastContentLine = lines.length - 1;
  while (lastContentLine >= 0 && !lines[lastContentLine].trim()) lastContentLine -= 1;

  let parsed: Record<string, any> | null = null;
  let jsonLineIndex = -1;
  let jsonStart = -1;
  const statusLine = lastContentLine >= 0 ? lines[lastContentLine].trim() : '';
  const isStatusObject = (candidate: any): candidate is Record<string, any> => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const global = candidate.global && typeof candidate.global === 'object' ? candidate.global : candidate;
    const dynamic = candidate.dynamic || candidate.groups;
    const hasStatic = Object.keys(global).some((key) => fieldMap.has(key));
    const hasDynamic = dynamic && typeof dynamic === 'object' && Object.keys(dynamic).some((key) => dynamicMap.has(key));
    return hasStatic || Boolean(hasDynamic);
  };

  if (statusLine.startsWith(marker)) {
    try {
      const candidate = JSON.parse(statusLine.slice(marker.length).trim());
      if (isStatusObject(candidate)) { parsed = candidate; jsonLineIndex = lastContentLine; }
    } catch { return null; }
  } else {
    const trailing = content.replace(/\s*```(?:json)?\s*$/i, '').trimEnd();
    for (let start = trailing.lastIndexOf('{'); start >= 0; start = trailing.lastIndexOf('{', start - 1)) {
      try {
        const candidate = JSON.parse(trailing.slice(start));
        if (isStatusObject(candidate)) {
          parsed = candidate;
          jsonStart = start;
          const absoluteStart = content.lastIndexOf(trailing) + start;
          jsonLineIndex = content.slice(0, absoluteStart).split(/\r?\n/).length - 1;
          break;
        }
      } catch { /* try an earlier object start, such as the outer JSON object */ }
    }
  }

  if (!parsed) return null;
  const snapshot: any = {
    values: { ...(prevSnapshot?.values || {}) },
    textValues: { ...(prevSnapshot?.textValues || {}) },
    dynamicGroups: Object.fromEntries(Object.entries(prevSnapshot?.dynamicGroups || {}).map(([groupId, instances]) => [groupId, (instances as any[]).map((instance) => ({
      ...instance,
      values: { ...(instance.values || {}) },
      textValues: { ...(instance.textValues || {}) },
    }))])),
  };
  const globalPayload = parsed.global && typeof parsed.global === 'object' ? parsed.global : parsed;
  for (const [key, rawValue] of Object.entries(globalPayload)) {
    const field = fieldMap.get(key) as any;
    if (!field || rawValue === null || rawValue === undefined || ['achievement', 'date', 'weekday', 'fixedText'].includes(field.type)) continue;
    if (isStatusTextField(field)) {
      if (typeof rawValue === 'string') snapshot.textValues[key] = rawValue;
      continue;
    }
    const numericValue = normalizeNumericStatusValue(field, rawValue);
    if (numericValue !== null) snapshot.values[key] = numericValue;
  }

  const dynamicPayload = parsed.dynamic || parsed.groups;
  if (dynamicPayload && typeof dynamicPayload === 'object') {
    for (const [groupId, groupPatch] of Object.entries(dynamicPayload)) {
      const group = dynamicMap.get(groupId) as any;
      if (!group || !groupPatch || typeof groupPatch !== 'object') continue;
      const instances: any[] = snapshot.dynamicGroups[groupId] || [];
      const fieldMapForGroup = new Map((group.fields || []).map((field: any) => [field.key, field]));
      const applyValues = (instance: any, values: any, textValues: any) => {
        for (const [key, rawValue] of Object.entries(values || {})) {
          const field = fieldMapForGroup.get(key) as any;
          if (!field || rawValue === null || rawValue === undefined) continue;
          if (isStatusTextField(field)) { if (typeof rawValue === 'string') instance.textValues[key] = rawValue; }
          else { const numericValue = normalizeNumericStatusValue(field, rawValue); if (numericValue !== null) instance.values[key] = numericValue; }
        }
        for (const [key, rawValue] of Object.entries(textValues || {})) {
          const field = fieldMapForGroup.get(key) as any;
          if (field && isStatusTextField(field) && typeof rawValue === 'string') instance.textValues[key] = rawValue;
        }
      };
      const addItems = Array.isArray((groupPatch as any).add) ? (groupPatch as any).add : [];
      for (const item of addItems) {
        if (!item || typeof item !== 'object') continue;
        const activeCount = instances.filter((instance) => (instance.lifecycle || 'active') === 'active').length;
        const id = String(item.id || generateId());
        let instance = instances.find((candidate) => candidate.id === id);
        if (!instance && group.maxInstances && activeCount >= group.maxInstances) continue;
        if (!instance) { instance = { id, name: String(item.name || '未命名角色'), icon: item.icon, values: {}, textValues: {}, lifecycle: 'active' }; instances.push(instance); }
        instance.name = String(item.name || instance.name || '未命名角色');
        if (item.icon) instance.icon = String(item.icon);
        applyValues(instance, item.values, item.textValues);
      }
      const updates = Array.isArray((groupPatch as any).update) ? (groupPatch as any).update : [];
      for (const item of updates) {
        if (!item || typeof item !== 'object' || !item.id) continue;
        const instance = instances.find((candidate) => candidate.id === String(item.id) && (candidate.lifecycle || 'active') === 'active');
        if (!instance) continue;
        if (item.name) instance.name = String(item.name);
        if (item.icon) instance.icon = String(item.icon);
        const directValues = item.values || {};
        const directTextValues = item.textValues || {};
        const setValues: Record<string, any> = {};
        for (const [key, value] of Object.entries(item.set || {})) setValues[key] = value;
        applyValues(instance, { ...directValues, ...setValues }, directTextValues);
      }
      const removals = Array.isArray((groupPatch as any).remove) ? (groupPatch as any).remove : [];
      for (const removal of removals) {
        const id = typeof removal === 'string' ? removal : removal?.id;
        if (!id) continue;
        const instance = instances.find((candidate) => candidate.id === String(id));
        if (instance) instance.lifecycle = (typeof removal === 'object' && removal.reason === '死亡' ? 'dead' : 'left');
      }
      snapshot.dynamicGroups[groupId] = instances;
    }
  }
  const linkedSnapshot = applyLinkedStatusFields(template, snapshot);
  const text = jsonLineIndex >= 0
    ? lines.filter((_, index) => index !== jsonLineIndex).join('\n').trim()
    : content.slice(0, jsonStart).trimEnd();
  return { text, snapshot: linkedSnapshot };
}

function stripStreamingStatusJson(content: string): string {
  const lastLineStart = content.lastIndexOf('\n');
  const lastLine = content.slice(lastLineStart + 1).trimStart();
  if (lastLine.startsWith('<!--STATUS-->')) return content.slice(0, lastLineStart).trimEnd();
  if (lastLine.startsWith('{') && lastLine.endsWith('}')) {
    try {
      const candidate = JSON.parse(lastLine);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return content.slice(0, lastLineStart).trimEnd();
      }
    } catch { /* incomplete streaming JSON remains visible until it is complete */ }
  }
  if (content.trimStart().startsWith('<!--STATUS-->')) return '';
  return content;
}

export function useChat(deps: UseChatDeps) {
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef<any[]>([]);
  const memorySaveQueueRef = useRef(Promise.resolve());

  const assembleContext = useCallback(async (searchedMemories?: any[], excludeNodeId?: string, currentUserText?: string): Promise<AssembledContext> => {
    const messages: AssembledMessage[] = [];
    const metadata = {
      worldBookMatches: [] as string[],
      activatedWorldBookEntries: [] as { id: string; name: string }[],
      tokenEstimate: 0,
      memoryCount: 0,
    };
    if (!deps.conversation) return { messages, metadata };
    const conv = deps.conversation;
    const character = conv.characterId
      ? await Stores.getCharacterById(conv.characterId)
      : undefined;

    if (character?.systemPrompt) {
      messages.push({ role: 'system', content: character.systemPrompt });
    }

    const nodes = await Stores.getMessageNodesByConversation(conv.id);
    const existingNodes = nodes.filter((node) => node.id !== excludeNodeId);
    if (character?.openingLine && existingNodes.length === 0) {
      const tpl = deps.tplOpeningLinePrefix || DEFAULT_TPL_OPENING_LINE_PREFIX;
      messages.push({ role: 'system', content: tpl.replace('{content}', character.openingLine) });
    }
    const maxRounds = deps.recentRounds || 20;
    const recentNodes = nodes.slice(-maxRounds * 2).filter((node) => node.id !== excludeNodeId);
    const allWorldBooks = await Stores.getAllWorldBooks();
    const persistedSnapshot = [...nodes].reverse().find((node) => node.role === 'assistant' && node.statusBarData)?.statusBarData;
    const latestPersistedSnapshot = character?.statusBarTemplate && persistedSnapshot
      ? applyLinkedStatusFields(character.statusBarTemplate, persistedSnapshot)
      : persistedSnapshot;
    const latestAssistantId = [...nodes].reverse().find((node) => node.role === 'assistant')?.id;
    const recentUserMsgs = recentNodes.filter((n) => n.role === 'user' && !n.hidden);
    const recentText = currentUserText || (recentUserMsgs.length > 0 ? recentUserMsgs[recentUserMsgs.length - 1].content : '');
    // Pinned worldbook entries (always injected, don't count against limit)
    if (character?.worldBookId) {
      const wb = allWorldBooks.find((w: any) => w.id === character.worldBookId);
      if (wb) {
        const pinned = wb.entries.filter((e: any) => e.pinned);
        for (const entry of pinned) {
          const tpl = deps.tplWorldBookPrefix || DEFAULT_TPL_WORLD_BOOK_PREFIX;
          messages.push({
            role: 'system',
            content: tpl.replace('{key}', entry.keys[0]).replace('{value}', entry.value),
          });
        }
      }
    }

    // Keyword-triggered worldbook entries (count against limit)
    const wbEntries = scanWorldBook(character?.worldBookId, recentText, allWorldBooks, (deps.maxWorldBookEntries || 3));
    if (wbEntries.length > 0) {
      metadata.activatedWorldBookEntries = wbEntries.map((e) => ({ id: e.id, name: e.keys[0] || '' }));
      for (const entry of wbEntries) {
        const tpl = deps.tplWorldBookPrefix || DEFAULT_TPL_WORLD_BOOK_PREFIX;
        messages.push({
          role: 'system',
          content: tpl.replace('{key}', entry.keys[0]).replace('{value}', entry.value),
        });
      }
    }

    // Existing memory remains available to the main model even when the
    // clerk switch is off. The switch only pauses creation of new summaries.
    const mems = searchedMemories || [];
    if (mems.length > 0) {
      metadata.memoryCount = mems.length;
      const memoryText = mems.map((m: any) => {
        const d = new Date(m.timestamp).toLocaleDateString('zh-CN');
        return `[${d}] ${m.content}`;
      }).join('\n');
      const prefix = (deps.tplMemoryPrefix || DEFAULT_TPL_MEMORY_PREFIX).replace('{content}', memoryText);
      messages.push({ role: 'system', content: prefix });
    }

    for (const node of recentNodes) {
      if (node.displayType === 'gallery' || node.source === 'gallery') continue;
      if (node.role === 'user') {
        const tpl = deps.tplUserWrapper || DEFAULT_TPL_USER_WRAPPER;
        messages.push({ role: 'user', content: tpl.replace('{content}', node.content) });
      } else {
        const statusSnapshot = node.statusBarData || (node.id === latestAssistantId ? latestPersistedSnapshot : undefined);
        const statusTag = character?.statusBarTemplate && statusSnapshot
          ? `\n${serializeStatusSnapshot(character.statusBarTemplate, statusSnapshot)}`
          : '';
        messages.push({ role: 'assistant', content: node.content + statusTag });
      }
    }

    if (character) {
      const tpl = deps.tplIdentityAnchor || DEFAULT_TPL_IDENTITY_ANCHOR;
      messages.push({ role: 'system', content: tpl.replace(/{charName}/g, character.name) });

      // Inject status bar context
      if (character.statusBarTemplate && (character.statusBarTemplate.fields.length > 0 || (character.statusBarTemplate.dynamicGroups || []).length > 0)) {
        // Status is stateful: use the latest persisted assistant snapshot even
        // when the context window has been shortened to only a few rounds.
        var snapshot: any = latestPersistedSnapshot || null;
        // Initialize from template if no snapshot found
        if (!snapshot && character.statusBarTemplate) {
          snapshot = createInitialStatusSnapshot(character.statusBarTemplate);
        }
        if (snapshot) {
            const statusLines = character.statusBarTemplate.fields.map((f: any) => {
            if (f.type === 'achievement') return null;
            const v = snapshot.values?.[f.key];
            const tv = snapshot.textValues?.[f.key];
            if (isStatusTextField(f)) {
              return `- ${f.label}: ${tv || '未知'}`;
            }
            if (f.type === 'daycount' || f.type === 'period' || f.max === 0) {
              return `- ${f.label}: ${v !== undefined ? v : f.initial}`;
            }
            return `- ${f.label}: ${v !== undefined ? v : f.initial}/${f.max}`;
          });
          const dynamicGroups = character.statusBarTemplate.dynamicGroups || [];
          const dynamicStatusLines = dynamicGroups.flatMap((group: any) => {
            const active = (snapshot.dynamicGroups?.[group.id] || []).filter((instance: any) => (instance.lifecycle || 'active') === 'active');
            if (active.length === 0) return [`- ${group.title}：当前没有活动成员`];
            return [`- ${group.title}：${active.map((instance: any) => `${instance.icon || group.icon} ${instance.name}（id:${instance.id}）`).join('、')}`];
          });
          const dynamicSchemaLines = dynamicGroups.map((group: any) => `- ${group.id}（${group.title}，最多 ${group.maxInstances || '不限制'} 个）：${(group.fields || []).map((field: any) => `${field.key}:${field.type}`).join('、') || '无字段'}`).join('\n');
          const visibleStatusLines = [...statusLines.filter(Boolean), ...dynamicStatusLines];
          if (visibleStatusLines.length > 0) {
            const statusKeys = getStatusFieldKeys(character.statusBarTemplate);
            const baseStatusExample: Record<string, string | number> = {};
            for (const field of character.statusBarTemplate.fields) {
              if (!statusKeys.includes(field.key)) continue;
              if (isStatusTextField(field)) {
                baseStatusExample[field.key] = snapshot.textValues?.[field.key] || field.initial || '';
              } else {
                baseStatusExample[field.key] = snapshot.values?.[field.key] ?? field.initial ?? 0;
              }
            }
            const dynamicExample: Record<string, any> = {};
            for (const group of dynamicGroups) {
              dynamicExample[group.id] = {
                active: (snapshot.dynamicGroups?.[group.id] || []).filter((instance: any) => (instance.lifecycle || 'active') === 'active').map((instance: any) => ({ id: instance.id, name: instance.name, icon: instance.icon, values: instance.values, textValues: instance.textValues })),
                add: [], update: [], remove: [],
              };
            }
            const statusExample: Record<string, any> = dynamicGroups.length ? { global: baseStatusExample, dynamic: dynamicExample } : baseStatusExample;
            const statusText = '[当前状态栏]\n' + visibleStatusLines.join('\n') +
              '\n\n[状态栏更新规则]\n' +
              '回复正文结束后，必须另起最后一行输出状态栏 JSON。日期、星期和成就图标由网页自动计算，不要输出这些字段。' +
              (dynamicGroups.length
                ? '固定字段放在 global 中；动态角色组字段 schema 如下：\n' + dynamicSchemaLines + '\n动态角色组放在 dynamic 中，使用 add、update、remove 表达实际的加入、更新和离队。角色暂时不在现场、没有参与本轮互动或没有发言时，不得 remove；只有死亡、离队、叛变或被驱逐等明确事件才 remove。动态角色 update/remove 必须使用当前状态中的 id。'
                : 'JSON 只能包含以下字段：' + statusKeys.join(', ') + '。') +
              '当前状态栏数值是唯一基准，必须在此基础上按角色 System Prompt 的规则推演；未变化的字段保持当前值。不要使用 Markdown 代码块，不要在 JSON 前后添加文字。用户界面会隐藏这一行，但系统会解析它并更新状态栏。\n' +
              '当前格式示例：' + JSON.stringify(statusExample);
            messages.push({ role: 'system', content: statusText });
            console.log('[StatusBar] Injecting tracking prompt, fields:', statusKeys.length);
          }
        }
      }
    }

    metadata.tokenEstimate = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    return { messages, metadata };
  }, [deps]);

  const sendMessage = useCallback(async (userInput: string, options?: { hidden?: boolean; source?: 'shortcut' }) => {
    if (!deps.conversation) { setError('请先选择对话'); return; }
    const conv = deps.conversation;
    // Auto-resolve model: conversation binding -> active model -> any available
    let resolvedModelId = conv.modelId;
    if (!resolvedModelId) {
      try { resolvedModelId = localStorage.getItem('jg2_active_model') || ''; } catch {}
    }
    if (!resolvedModelId) {
      const allModels = await Stores.getAllModels();
      if (allModels.length > 0) resolvedModelId = allModels[0].id;
    }
    if (!resolvedModelId) { setError('请先在设置中配置AI模型'); return; }

    const model = await deps.getModelById(resolvedModelId);
    if (!model) { setError('此对话绑定的主模型已被删除，请在设置中重新选择模型后再发送。'); return; }
    if (!model.baseUrl || !model.apiKey || !model.defaultModel) {
      setError(`主模型“${model.name}”尚未完成配置，请填写 API Key 和模型名称后再开始对话。`);
      return;
    }

    let charName = 'AI';
    try {
      const char = await Stores.getCharacterById(conv.characterId);
      if (char) charName = char.name;
    } catch { /* ignore */ }

    setStreaming(true);
    setStreamingContent('');
    setStreamingReasoning('');
    setError(null);
    let fullContent = '';
    let fullReasoning = '';
    let pendingDisplay = '';
    let displayTimer: ReturnType<typeof setTimeout> | null = null;
    let lastDisplayAt = 0;
    const queueDisplay = (value: string) => {
      pendingDisplay = value;
      if (displayTimer) return;
      // Coalesce rapid SSE chunks into short, readable updates instead of
      // painting every token like a typewriter. The final response is flushed
      // immediately below when the stream ends.
      const wait = Math.max(0, 140 - (Date.now() - lastDisplayAt));
      displayTimer = setTimeout(() => {
        displayTimer = null;
        lastDisplayAt = Date.now();
        setStreamingContent(pendingDisplay);
      }, wait);
    };

    const userNode: MessageNode = {
      id: generateId(),
      conversationId: conv.id,
      role: 'user',
      senderName: '你',
      content: userInput,
      isArchived: false,
      timestamp: Date.now(),
      hidden: Boolean(options?.hidden),
      source: options?.source || 'user',
    };

    try {
      await Stores.addMessageNode(userNode);
      deps.onNodesRefresh(await Stores.getMessageNodesByConversation(conv.id));
      
      // Keyword search for relevant memories
      const keywords = options?.hidden ? [] : extractKeywords(userInput);
      // Retrieval stays enabled so existing memory can still guide the main
      // model while the clerk switch is off.
      const relevantMemories = conv.id && !options?.hidden ? await searchMemories(conv.id, keywords, deps.maxMemoryEntries || 5) : [];
      
      const assembled = await assembleContext(relevantMemories, userNode.id, userInput);
      lastPromptRef.current = [...assembled.messages, { role: 'user', content: userInput }];
      console.debug('[StatusBar] Historical status tags in messages:', assembled.messages.filter((message) => message.role === 'assistant' && /\{\"[^\n]+\}/.test(message.content)).length);

      const abort = new AbortController();
      abortRef.current = abort;

      const requestBody: any = {
        model: model.defaultModel,
        messages: [...assembled.messages, { role: 'user', content: userInput }],
        stream: true,
        ...buildSamplingParams(model.temperature, model.topP),
      };
      if (deps.thinkingEnabled) {
        requestBody.reasoning_effort = 'medium';
      }

      const resp = await apiFetch(chatCompletionsUrl(model.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${model.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: abort.signal,
      });

      if (!resp.ok) throw new Error(`API 错误 ${resp.status}`);

      const reader = resp.body!.getReader();
      const parser = new SSEParser();

      while (true) {
        let idleTimer: ReturnType<typeof setTimeout> | null =
          setTimeout(() => abort.abort(), STREAM_IDLE_TIMEOUT_MS);
        const { done, value } = await reader.read();
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        if (done) break;
        for (const chunk of parser.parse(value)) {
          if (chunk.done) break;
          if (chunk.reasoning) {
            fullReasoning += chunk.reasoning;
            setStreamingReasoning(fullReasoning);
          }
          if (chunk.content) {
            fullContent += chunk.content;
            // Strip thinking tags from display but keep full for saving
            const display = stripStreamingStatusJson(stripReasoningBlocks(fullContent));
            queueDisplay(display);
          }
        }
      }

      for (const chunk of parser.finish()) {
        if (chunk.reasoning) fullReasoning += chunk.reasoning;
        if (chunk.content) fullContent += chunk.content;
      }

      const usage = parser.getTokenUsage();
      const tokenCost = usage?.completion_tokens || estimateTokens(fullContent);
      const tokenCostInput = usage?.prompt_tokens || assembled.metadata.tokenEstimate;
      const tokenCostTotal = usage?.total_tokens || (tokenCostInput + tokenCost);

      // Save reasoning content in node for persistence
      const reasoningContent = fullReasoning ? fullReasoning : undefined;
      const displayContent = stripStreamingStatusJson(stripReasoningBlocks(fullContent)) || '(空响应)';
      if (displayTimer) { clearTimeout(displayTimer); displayTimer = null; }
      setStreamingContent(stripStreamingStatusJson(displayContent));
      // Parse status bar from AI response
      const char = await Stores.getCharacterById(conv.characterId);
      const allMsgs2 = await Stores.getMessageNodesByConversation(conv.id);
      var prevSnapshot = [...allMsgs2].reverse().find((node) => node.statusBarData)?.statusBarData;
      // Initialize from template defaults if no previous snapshot
      if (!prevSnapshot && char?.statusBarTemplate) {
        prevSnapshot = createInitialStatusSnapshot(char.statusBarTemplate);
      }
      const statusResult = char?.statusBarTemplate ? parseStatusBar(stripReasoningBlocks(fullContent), prevSnapshot, char.statusBarTemplate) : null;
      console.log('[StatusBar] AI response has STATUS tag:', Boolean(statusResult));
      if (statusResult) console.debug('[StatusBar] Parsed snapshot:', statusResult.snapshot);
      const finalContent = statusResult?.text || displayContent;

      const aiNode: MessageNode = {
        id: generateId(),
        conversationId: conv.id,
        role: 'assistant',
        senderName: charName,
        content: finalContent,
        isArchived: false,
        timestamp: Date.now(),
        tokenCost,
        tokenCostIsExact: !!usage,
        tokenCostInput,
        tokenCostTotal,
        activatedWorldBookEntries: assembled.metadata.activatedWorldBookEntries.length > 0
          ? assembled.metadata.activatedWorldBookEntries : undefined,
        statusBarData: statusResult?.snapshot || prevSnapshot || undefined,
      } as any;
      if (reasoningContent) (aiNode as any).reasoning = reasoningContent;

      await Stores.addMessageNode(aiNode);
      const updatedNodes = await Stores.getMessageNodesByConversation(conv.id);
      deps.onNodesRefresh(updatedNodes);

      // The clerk summarizes exactly one configurable dialogue interval.
      const triggerInterval = Math.min(10, Math.max(1, Math.round(deps.memoryTriggerInterval || 1)));
      const completedRounds = updatedNodes.filter((node) => node.role === 'user' && !node.hidden).length;
      if (deps.memoryEnabled && conv.id && completedRounds % triggerInterval === 0) {
        const convId = conv.id;
        const intervalNodes = updatedNodes
          .filter((node) => (node.role === 'user' && !node.hidden) || node.role === 'assistant')
          .slice(-triggerInterval * 2);
        const dialogueText = intervalNodes.map((node) =>
          `【${node.role === 'user' ? '用户' : charName}】\n${node.content}`,
        ).join('\n\n');
        (async () => {
          try {
            const subModel = deps.subAIModelId ? await Stores.getSubAIModelById(deps.subAIModelId) : undefined;
            if (!subModel || !subModel.baseUrl || !subModel.apiKey || !subModel.defaultModel) {
              console.warn('[SubAI] Independent clerk model is not configured');
              return;
            }
            const memoryRoleNames = char?.memoryRoleNames?.filter(Boolean).length
              ? char.memoryRoleNames.filter(Boolean)
              : char?.memoryViewpoint === 'third-person'
                ? []
                : resolveMemoryRoleNames(deps.tplIdentityAnchor, char?.name);
            const result = await callSubAI({
              model: subModel,
              userMessage: userInput,
              aiResponse: aiNode.content,
              dialogueText,
              customPrompt: deps.subAIPrompt || undefined,
              speakerContext: { roleNames: memoryRoleNames, viewpoint: char?.memoryViewpoint || 'auto' },
            });
            if (!result?.content) return;
            memorySaveQueueRef.current = memorySaveQueueRef.current.then(async () => {
              const all = await getMemories(convId);
              all.push({
                id: generateId(),
                conversationId: convId,
                timestamp: Date.now(),
                roundRange: { start: Math.max(1, completedRounds - triggerInterval + 1), end: completedRounds },
                keywords: normalizeMemoryKeywords(result.keywords, dialogueText, memoryRoleNames),
                content: result.content,
                source: 'ai',
              });
              await saveMemories(convId, all);
            });
            await memorySaveQueueRef.current;
          } catch (e) {
            console.warn('[SubAI] Error:', e);
          }
        })();
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        if (fullContent.trim()) {
          const partialNode: MessageNode = {
            id: generateId(),
            conversationId: conv.id,
            role: 'assistant',
            senderName: charName,
            content: stripReasoningBlocks(fullContent),
            isArchived: false,
            timestamp: Date.now(),
            tokenCost: estimateTokens(fullContent),
            tokenCostIsExact: false,
          };
          await Stores.addMessageNode(partialNode);
        }
      } else {
        setError(e.message || '发送失败');
      }
    } finally {
      if (displayTimer) clearTimeout(displayTimer);
      setStreaming(false);
      setStreamingContent('');
      setStreamingReasoning('');
      abortRef.current = null;
    }
  }, [deps, assembleContext]);

  const abortStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const getLastPrompt = useCallback(() => lastPromptRef.current, []);

  return { streaming, streamingContent, streamingReasoning, error, setError, sendMessage, abortStream, getLastPrompt };
}
