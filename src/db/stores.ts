import type {
  ModelConfig,
  Character,
  Conversation,
  ConversationFolder,
  MessageNode,
  WorldBook,
  MemoryEntry,
  ImageAssetRecord,
  ExtensionModule,
  GalleryCard,
} from '../types';
import {
  modelsStore,
  subAIModelsStore,
  imageAssetsStore,
  extensionModulesStore,
  galleryCardsStore,
  charactersStore,
  conversationsStore,
  conversationFoldersStore,
  messageNodesStore,
  worldbooksStore,
  memoriesStore,
  uiSettingsStore,
} from './index';
import type LocalForage from 'localforage';

const writeQueues = new WeakMap<LocalForage, Promise<void>>();

async function getAll<T>(store: LocalForage): Promise<T[]> {
  const data = await store.getItem<T[]>('data');
  return Array.isArray(data) ? data : [];
}

async function mutateStore<T, R>(store: LocalForage, mutate: (items: T[]) => R | Promise<R>): Promise<R> {
  const previous = writeQueues.get(store) || Promise.resolve();
  const operation = previous.then(async () => {
    const items = [...await getAll<T>(store)];
    const result = await mutate(items);
    await store.setItem('data', items);
    return result;
  });
  writeQueues.set(store, operation.then(() => undefined, () => undefined));
  return operation;
}

export async function setAll<T>(store: LocalForage, data: T[]): Promise<void> {
  await mutateStore<T, void>(store, (items) => { items.splice(0, items.length, ...data); });
}

function byId<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

let imageWriteQueue = Promise.resolve();
const imageObjectUrlCache = new Map<string, string>();

async function queueImageWrite<T>(operation: () => Promise<T>): Promise<T> {
  const previous = imageWriteQueue;
  let result!: T;
  const current = previous.then(async () => { result = await operation(); });
  imageWriteQueue = current.then(() => undefined, () => undefined);
  await current;
  return result;
}

async function getImageAssetIds(): Promise<string[]> {
  const ids = await imageAssetsStore.getItem<string[]>('index');
  return Array.isArray(ids) ? ids : [];
}

async function getBlobHash(blob: Blob): Promise<string> {
  if (!crypto.subtle) return `no-hash:${crypto.randomUUID()}`;
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function addImageAsset(input: Omit<ImageAssetRecord, 'id' | 'createdAt' | 'size'> & { size?: number }): Promise<string> {
  const hash = input.hash || await getBlobHash(input.blob);
  let assetId = '';
  await queueImageWrite(async () => {
    const ids = await getImageAssetIds();
    for (const existingId of ids) {
      const existing = await getImageAsset(existingId);
      if (existing?.hash === hash) { assetId = existing.id; return; }
    }
    assetId = crypto.randomUUID();
    const record: ImageAssetRecord = { ...input, id: assetId, hash, size: input.size ?? input.blob.size, createdAt: Date.now() };
    await imageAssetsStore.setItem(`asset:${assetId}`, record);
    await imageAssetsStore.setItem('index', [...new Set([...ids, assetId])]);
  });
  return assetId;
}

export async function getImageAsset(id: string): Promise<ImageAssetRecord | undefined> {
  const record = await imageAssetsStore.getItem<ImageAssetRecord>(`asset:${id}`);
  return record || undefined;
}

export async function getAllImageAssets(): Promise<ImageAssetRecord[]> {
  const ids = await getImageAssetIds();
  const records = await Promise.all(ids.map((id) => getImageAsset(id)));
  return records.filter((record): record is ImageAssetRecord => Boolean(record));
}

export async function getImageAssetObjectUrl(id: string): Promise<string | undefined> {
  const cached = imageObjectUrlCache.get(id);
  if (cached) return cached;
  const asset = await getImageAsset(id);
  if (!asset?.blob || typeof URL.createObjectURL !== 'function') return undefined;
  const url = URL.createObjectURL(asset.blob);
  imageObjectUrlCache.set(id, url);
  return url;
}

export async function deleteImageAsset(id: string): Promise<void> {
  await queueImageWrite(async () => {
    await imageAssetsStore.removeItem(`asset:${id}`);
    const ids = await getImageAssetIds();
    await imageAssetsStore.setItem('index', ids.filter((assetId) => assetId !== id));
  });
  const url = imageObjectUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    imageObjectUrlCache.delete(id);
  }
}

// ===== Extensions and gallery cards =====
export const getAllExtensionModules = () => getAll<ExtensionModule>(extensionModulesStore);
export async function getExtensionModuleById(id: string) { return byId(await getAllExtensionModules(), id); }
export async function addExtensionModule(module: ExtensionModule) {
  await mutateStore<ExtensionModule, void>(extensionModulesStore, (items) => { items.push(module); });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jg2:extensions-changed', { detail: { moduleId: module.id } }));
}
export async function updateExtensionModule(id: string, updates: Partial<ExtensionModule>) {
  await mutateStore<ExtensionModule, void>(extensionModulesStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = { ...items[index], ...updates, updatedAt: Date.now() };
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jg2:extensions-changed', { detail: { moduleId: id } }));
}
export async function deleteExtensionModule(id: string): Promise<void> {
  const module = await getExtensionModuleById(id);
  if (module?.characterIds?.length) throw new Error('该拓展已绑定角色卡，无法删除。请先解除绑定。');
  await mutateStore<ExtensionModule, void>(extensionModulesStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
}

export const getAllGalleryCards = () => getAll<GalleryCard>(galleryCardsStore);
export async function getGalleryCardById(id: string) { return byId(await getAllGalleryCards(), id); }
export async function addGalleryCard(card: GalleryCard) {
  await mutateStore<GalleryCard, void>(galleryCardsStore, (items) => { items.push(card); });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jg2:extensions-changed', { detail: { galleryCardId: card.id } }));
}
export async function updateGalleryCard(id: string, updates: Partial<GalleryCard>) {
  const previous = await getGalleryCardById(id);
  await mutateStore<GalleryCard, void>(galleryCardsStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = { ...items[index], ...updates, updatedAt: Date.now() };
  });
  const nextCard = await getGalleryCardById(id);
  if (previous && nextCard) {
    const nextAssetIds = new Set((nextCard.items || []).map((item) => item.assetId).filter(Boolean));
    await Promise.all((previous.items || [])
      .map((item) => item.assetId)
      .filter((assetId): assetId is string => Boolean(assetId) && !nextAssetIds.has(assetId))
      .map(deleteImageAsset));
  }
  if (nextCard) {
    const nodes = await getAllMessageNodes();
    await Promise.all(nodes
      .filter((node) => node.displayType === 'gallery' && node.gallery?.id === id)
      .map((node) => updateMessageNode(node.id, { content: nextCard.title, gallery: JSON.parse(JSON.stringify(nextCard)) })));
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jg2:extensions-changed', { detail: { galleryCardId: id } }));
}
export async function deleteGalleryCard(id: string): Promise<void> {
  const card = await getGalleryCardById(id);
  if (card?.characterIds?.length) throw new Error('该图鉴卡片已绑定角色卡，无法删除。请先解除绑定。');
  const modules = await getAllExtensionModules();
  if (modules.some((module) => module.galleryCardId === id)) throw new Error('该图鉴卡片仍被快捷键引用，无法删除。');
  await mutateStore<GalleryCard, void>(galleryCardsStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
  await Promise.all((card?.items || []).map((item) => item.assetId).filter((assetId): assetId is string => Boolean(assetId)).map(deleteImageAsset));
}

async function hydrateCharacter(character: Character): Promise<Character> {
  const [avatarUrl, coverUrl] = await Promise.all([
    character.avatarAssetId ? getImageAssetObjectUrl(character.avatarAssetId) : undefined,
    character.coverAssetId ? getImageAssetObjectUrl(character.coverAssetId) : undefined,
  ]);
  return {
    ...character,
    avatar: avatarUrl || character.avatar || '🎭',
    coverImage: coverUrl || character.coverImage,
  };
}

function toStoredCharacter(character: Character): Character {
  const stored = { ...character };
  if (stored.avatarAssetId && (stored.avatar.startsWith('data:') || stored.avatar.startsWith('blob:'))) stored.avatar = '🎭';
  if (stored.coverAssetId && stored.coverImage?.startsWith('data:')) delete stored.coverImage;
  return stored;
}

// ===== Models =====
export async function getAllModels(): Promise<ModelConfig[]> {
  const models = await getAll<ModelConfig>(modelsStore);
  const unique = Array.from(new Map(models.map((model) => [model.id, model])).values());
  if (unique.length !== models.length) await modelsStore.setItem('data', unique);
  return unique;
}
export async function getModelById(id: string) { return byId(await getAllModels(), id); }
export async function addModel(model: ModelConfig) { await mutateStore<ModelConfig, void>(modelsStore, (items) => { items.push(model); }); if (typeof window !== 'undefined') window.dispatchEvent(new Event('jg2:models-changed')); }
export async function updateModel(id: string, updates: Partial<ModelConfig>) {
  await mutateStore<ModelConfig, void>(modelsStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = { ...items[index], ...updates };
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('jg2:models-changed'));
}
export async function deleteModel(id: string) {
  await mutateStore<ModelConfig, void>(modelsStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('jg2:models-changed'));
}

// ===== Independent clerk / SubAI models =====
export const getAllSubAIModels = () => getAll<ModelConfig>(subAIModelsStore);
export async function getSubAIModelById(id: string) { return byId(await getAllSubAIModels(), id); }
export async function replaceSubAIModels(models: ModelConfig[]) { await setAll(subAIModelsStore, models); }
export async function addSubAIModel(model: ModelConfig) { await mutateStore<ModelConfig, void>(subAIModelsStore, (items) => { items.push(model); }); }
export async function updateSubAIModel(id: string, updates: Partial<ModelConfig>) {
  await mutateStore<ModelConfig, void>(subAIModelsStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = { ...items[index], ...updates };
  });
}
export async function deleteSubAIModel(id: string) {
  await mutateStore<ModelConfig, void>(subAIModelsStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
}

// ===== Characters =====
export async function getAllCharacters(): Promise<Character[]> {
  const raw = await getAll<Character>(charactersStore);
  return Promise.all(raw.map(hydrateCharacter));
}
export async function getCharacterById(id: string) { return byId(await getAllCharacters(), id); }
export async function addCharacter(character: Character) { await mutateStore<Character, void>(charactersStore, (items) => { items.push(toStoredCharacter(character)); }); }
export async function updateCharacter(id: string, updates: Partial<Character>) {
  await mutateStore<Character, void>(charactersStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = toStoredCharacter({ ...items[index], ...updates });
  });
}
export async function deleteCharacter(id: string) {
  await mutateStore<Character, void>(charactersStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
}

// ===== Conversations =====
export const getAllConversations = () => getAll<Conversation>(conversationsStore);
export async function getConversationById(id: string) { return byId(await getAllConversations(), id); }
export async function addConversation(conversation: Conversation) { await mutateStore<Conversation, void>(conversationsStore, (items) => { items.push(conversation); }); }
export async function updateConversation(id: string, updates: Partial<Conversation>) {
  await mutateStore<Conversation, void>(conversationsStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = { ...items[index], ...updates };
  });
}
export async function deleteConversation(id: string) {
  await mutateStore<Conversation, void>(conversationsStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
}

// ===== Conversation folders =====
export const getAllConversationFolders = () => getAll<ConversationFolder>(conversationFoldersStore);
export async function setConversationFolders(folders: ConversationFolder[]) { await setAll(conversationFoldersStore, folders); }

// ===== Message nodes =====
export async function getMessageNodesByConversation(conversationId: string) {
  return (await getAll<MessageNode>(messageNodesStore)).filter((node) => node.conversationId === conversationId).sort((a, b) => a.timestamp - b.timestamp);
}
export const getAllMessageNodes = () => getAll<MessageNode>(messageNodesStore);
export async function addMessageNode(node: MessageNode) { await mutateStore<MessageNode, void>(messageNodesStore, (items) => { items.push(node); }); }
export async function updateMessageNode(id: string, updates: Partial<MessageNode>) {
  await mutateStore<MessageNode, void>(messageNodesStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = { ...items[index], ...updates };
  });
}
export async function deleteMessageNode(id: string) {
  await mutateStore<MessageNode, void>(messageNodesStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
}
export async function deleteMessageNodesByConversation(conversationId: string): Promise<number> {
  return mutateStore<MessageNode, number>(messageNodesStore, (items) => {
    const remaining = items.filter((item) => item.conversationId !== conversationId);
    const count = items.length - remaining.length;
    items.splice(0, items.length, ...remaining);
    return count;
  });
}

// ===== World books =====
export const getAllWorldBooks = () => getAll<WorldBook>(worldbooksStore);
export async function getWorldBookById(id: string) { return byId(await getAllWorldBooks(), id); }
export async function addWorldBook(worldBook: WorldBook) { await mutateStore<WorldBook, void>(worldbooksStore, (items) => { items.push(worldBook); }); }
export async function updateWorldBook(id: string, updates: Partial<WorldBook>) {
  await mutateStore<WorldBook, void>(worldbooksStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = { ...items[index], ...updates };
  });
}
export async function getWorldBookReferences(id: string): Promise<Character[]> {
  return (await getAllCharacters()).filter((character) => character.worldBookId === id);
}
export async function deleteWorldBook(id: string) {
  const references = await getWorldBookReferences(id);
  if (references.length > 0) throw new Error(`世界书正被 ${references.map((item) => item.name).join('、')} 绑定，无法删除。`);
  await mutateStore<WorldBook, void>(worldbooksStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
}

// ===== Memories =====
export async function getMemoriesByConversation(conversationId: string) {
  return (await getAll<MemoryEntry>(memoriesStore)).filter((memory) => memory.conversationId === conversationId).sort((a, b) => a.timestamp - b.timestamp);
}
export async function replaceMemoriesByConversation(conversationId: string, memories: MemoryEntry[]) {
  await mutateStore<MemoryEntry, void>(memoriesStore, (items) => {
    items.splice(0, items.length, ...items.filter((item) => item.conversationId !== conversationId), ...memories);
  });
}
export async function addMemory(memory: MemoryEntry) { await mutateStore<MemoryEntry, void>(memoriesStore, (items) => { items.push(memory); }); }
export async function updateMemory(id: string, updates: Partial<MemoryEntry>) {
  await mutateStore<MemoryEntry, void>(memoriesStore, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1) items[index] = { ...items[index], ...updates };
  });
}
export async function deleteMemory(id: string) {
  await mutateStore<MemoryEntry, void>(memoriesStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== id)); });
}
export async function deleteMemoriesByConversation(conversationId: string): Promise<number> {
  return mutateStore<MemoryEntry, number>(memoriesStore, (items) => {
    const remaining = items.filter((item) => item.conversationId !== conversationId);
    const count = items.length - remaining.length;
    items.splice(0, items.length, ...remaining);
    return count;
  });
}

export async function deleteConversationCascade(id: string): Promise<void> {
  await Promise.all([deleteConversation(id), deleteMessageNodesByConversation(id), deleteMemoriesByConversation(id)]);
  const folders = await getAllConversationFolders();
  await setConversationFolders(folders.map((folder) => ({ ...folder, conversationIds: folder.conversationIds.filter((conversationId) => conversationId !== id) })));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jg2:memories-updated', { detail: { conversationId: id, deleted: true } }));
    window.dispatchEvent(new CustomEvent('jg2-conversations-changed', { detail: { conversationId: id, deleted: true } }));
  }
}

export async function deleteCharacterCascade(id: string): Promise<{ conversationCount: number; worldBookDeleted: boolean }> {
  const character = await getCharacterById(id);
  if (!character) return { conversationCount: 0, worldBookDeleted: false };
  const conversations = (await getAllConversations()).filter((conversation) => conversation.characterId === id);
  await Promise.all(conversations.map((conversation) => deleteConversationCascade(conversation.id)));
  await deleteCharacter(id);
  const modules = await getAllExtensionModules();
  const cards = await getAllGalleryCards();
  await Promise.all(modules.map(async (module) => {
    if (!module.characterIds.includes(id)) return;
    const characterIds = module.characterIds.filter((characterId) => characterId !== id);
    if (characterIds.length === 0) {
      await mutateStore<ExtensionModule, void>(extensionModulesStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== module.id)); });
    } else {
      await updateExtensionModule(module.id, { characterIds });
    }
  }));
  await Promise.all(cards.map(async (card) => {
    if (!card.characterIds.includes(id)) return;
    const characterIds = card.characterIds.filter((characterId) => characterId !== id);
    if (characterIds.length === 0) {
      await mutateStore<GalleryCard, void>(galleryCardsStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== card.id)); });
      await Promise.all((card.items || []).map((item) => item.assetId).filter((assetId): assetId is string => Boolean(assetId)).map(deleteImageAsset));
    } else {
      await updateGalleryCard(card.id, { characterIds });
    }
  }));
  await Promise.all([character.avatarAssetId, character.coverAssetId, ...(character.galleryAssetIds || [])]
    .filter((assetId): assetId is string => Boolean(assetId)).map(deleteImageAsset));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jg2:characters-changed', { detail: { characterId: id, deleted: true } }));

  const worldBooks = await getAllWorldBooks();
  const candidate = worldBooks.find((book) => book.id === character.worldBookId && book.name === character.name)
    || worldBooks.find((book) => book.name === character.name);
  if (candidate && (await getWorldBookReferences(candidate.id)).length === 0) {
    await mutateStore<WorldBook, void>(worldbooksStore, (items) => { items.splice(0, items.length, ...items.filter((item) => item.id !== candidate!.id)); });
    return { conversationCount: conversations.length, worldBookDeleted: true };
  }
  return { conversationCount: conversations.length, worldBookDeleted: false };
}

// ===== UI settings =====
export interface UISettings {
  theme: 'light' | 'dark';
  wallpaper: { image: string; overlayOpacity: number; overlayMode: 'light' | 'dark' };
  boldColorize?: boolean;
  debugMode?: boolean;
  lowRateMode?: boolean;
  subAIConfig?: { enabled: boolean; modelId: string | null; triggerInterval: number; customSystemPrompt: string };
  contextConfig?: { recentRounds: number; maxWorldBookEntries: number; maxMemoryEntries?: number };
}

export async function getUISettings(): Promise<UISettings | null> { return uiSettingsStore.getItem<UISettings>('settings'); }
export async function setUISettings(settings: Partial<UISettings>): Promise<void> {
  const existing = (await getUISettings()) || {
    theme: 'dark' as const,
    wallpaper: { image: '', overlayOpacity: 0.7, overlayMode: 'dark' as const },
  };
  await uiSettingsStore.setItem('settings', { ...existing, ...settings });
}
