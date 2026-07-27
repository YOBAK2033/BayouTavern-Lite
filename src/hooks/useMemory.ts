import { useState, useCallback } from 'react';
import { generateId } from '../utils/id';
import type { MemoryEntry } from '../types';
import * as Stores from '../db/stores';

export type { MemoryEntry } from '../types';

// Simple Chinese keyword extraction
const STOP_WORDS = new Set(['的','了','在','是','我','有','和','就','不','人','都','一','一个','上','也','很','到','说','要','去','你','会','着','没有','看','好','自己','这','他','她','它','们','那','些','什么','怎么','如何','哪','吗','吧','呢','啊','哦','嗯','哈','呀','哇','喂','哎']);

export function extractKeywords(text: string): string[] {
  const cleaned = text.replace(/[，,。.！!？?、；;：:""''（）\\(\)\[\]【】\s]+/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  const chinesePhrases = cleaned.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const fallbackPhrases = chinesePhrases.flatMap((phrase) =>
    phrase.length <= 8 ? [phrase] : [phrase.slice(0, 4), phrase.slice(-4)],
  );
  return [...new Set([...words, ...fallbackPhrases])]
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .slice(0, 8);
}

/** 确保副 AI 或旧数据没有返回关键词时，记忆仍然可被检索。 */
const GENERIC_MEMORY_KEYWORDS = new Set([
  '用户', '对方', '我', '角色', '人物', '身份', '模型', 'AI', '人工智能',
  '互动', '对话', '本轮', '回复', '消息', '内容', '今天', '现在', '之后', '然后',
]);

export function normalizeMemoryKeywords(keywords: unknown, fallbackText: string, excludedKeywords: string[] = []): string[] {
  const excluded = new Set([
    ...GENERIC_MEMORY_KEYWORDS,
    ...excludedKeywords.map((keyword) => keyword.trim()).filter(Boolean),
  ]);
  const isUsable = (keyword: string) => {
    const normalized = keyword.replace(/^[#＃\-—•·\s]+|[#＃\-—•·\s]+$/g, '').trim();
    return normalized.length >= 2 && normalized.length <= 24 && !excluded.has(normalized);
  };
  const clean = (items: string[]) => [...new Set(items.map((item) => item.replace(/[\[\]"']/g, '').trim()).filter(isUsable))].slice(0, 4);
  const explicit = Array.isArray(keywords)
    ? clean(keywords.map((keyword) => String(keyword)))
    : [];
  return explicit.length > 0 ? explicit : clean(extractKeywords(fallbackText));
}

/** 为历史记忆补齐关键词，并保持已有关键词不变。 */
export function ensureMemoryKeywords(memories: MemoryEntry[], excludedKeywords: string[] = []): MemoryEntry[] {
  return memories.map((memory) => {
    const keywords = normalizeMemoryKeywords(memory.keywords, memory.content, excludedKeywords);
    return keywords.length === memory.keywords.length && keywords.every((keyword, index) => keyword === memory.keywords[index])
      ? memory
      : { ...memory, keywords };
  });
}

export async function searchMemories(conversationId: string, keywords: string[], limit = 5) {
  const all = await getMemories(conversationId);
  if (keywords.length === 0) return all.slice(-limit);
  const scored = all.map((mem) => {
    const hits = mem.keywords.filter((k) => keywords.some((kw) => k.includes(kw) || kw.includes(k)));
    return { mem, score: hits.length };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.mem);
}

export async function getMemories(conversationId: string): Promise<MemoryEntry[]> {
  return Stores.getMemoriesByConversation(conversationId);
}

export async function saveMemories(conversationId: string, memories: MemoryEntry[]): Promise<void> {
  await Stores.replaceMemoriesByConversation(conversationId, memories);
  window.dispatchEvent(new CustomEvent('jg2:memories-updated', { detail: { conversationId } }));
}

export function useMemory(conversationId: string | null) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);

  const loadMemories = useCallback(async () => {
    if (!conversationId) { setMemories([]); return; }
    setMemories(await getMemories(conversationId));
  }, [conversationId]);

  const addMemory = useCallback(async (entry: Omit<MemoryEntry, 'id' | 'timestamp'> & { source?: 'ai' | 'user' }) => {
    if (!conversationId) return;
    const all = await getMemories(conversationId);
    const mem: MemoryEntry = {
      ...entry,
      id: generateId(),
      timestamp: Date.now(),
      source: entry.source || 'user',
    };
    all.push(mem);
    await saveMemories(conversationId, all);
    setMemories(all);
    return mem;
  }, [conversationId]);

  const updateMemory = useCallback(async (id: string, updates: Partial<MemoryEntry>) => {
    if (!conversationId) return;
    const all = await getMemories(conversationId);
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], ...updates };
    await saveMemories(conversationId, all);
    setMemories(all);
  }, [conversationId]);

  const deleteMemory = useCallback(async (id: string) => {
    if (!conversationId) return;
    const all = (await getMemories(conversationId)).filter((m) => m.id !== id);
    await saveMemories(conversationId, all);
    setMemories(all);
  }, [conversationId]);

  const clearMemories = useCallback(async () => {
    if (!conversationId) return;
    await saveMemories(conversationId, []);
    setMemories([]);
  }, [conversationId]);

  return { memories, loadMemories, addMemory, updateMemory, deleteMemory, clearMemories };
}
