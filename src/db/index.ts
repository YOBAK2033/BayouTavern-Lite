import localforage from 'localforage';
import type LocalForage from 'localforage';
import type { Character, ExtensionModule, GalleryCard, ImageAssetRecord, MemoryEntry, ModelConfig } from '../types';
import { DB_KEYS } from '../utils/constants';
import { safeGetLocalStorage, safeListLocalStorage, safeRemoveLocalStorage, safeSetLocalStorage } from '../utils/safeStorage';

export const DB_NAME = 'BayouTavern';
const LEGACY_DB_NAME = 'jiuguan2';
const MIGRATION_MARKER = 'jg2_bayou_tavern_db_migrated';

function createStore(storeName: string) {
  return localforage.createInstance({ name: DB_NAME, storeName });
}

export const modelsStore = createStore(DB_KEYS.models);
export const subAIModelsStore = createStore(DB_KEYS.subAIModels);
export const imageAssetsStore = createStore(DB_KEYS.imageAssets);
export const extensionModulesStore = createStore(DB_KEYS.extensionModules);
export const galleryCardsStore = createStore(DB_KEYS.galleryCards);
export const charactersStore = createStore(DB_KEYS.characters);
export const conversationsStore = createStore(DB_KEYS.conversations);
export const conversationFoldersStore = createStore(DB_KEYS.conversationFolders);
export const messageNodesStore = createStore(DB_KEYS.messageNodes);
export const worldbooksStore = createStore(DB_KEYS.worldbooks);
export const memoriesStore = createStore(DB_KEYS.memories);
export const uiSettingsStore = createStore('jg2_ui_settings');

export const allStores = [
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
] as const;

function legacyStore(storeName: string) {
  return localforage.createInstance({ name: LEGACY_DB_NAME, storeName });
}

async function copyLegacyArray(store: LocalForage, legacyStoreName: string): Promise<void> {
  const current = await store.getItem<unknown[]>('data');
  if (Array.isArray(current) && current.length > 0) return;
  const legacy = await legacyStore(legacyStoreName).getItem<unknown[]>('data');
  if (Array.isArray(legacy) && legacy.length > 0) await store.setItem('data', legacy);
}

async function migrateLegacyMemoryAndSubAI(): Promise<void> {
  const existingMemories = (await memoriesStore.getItem<MemoryEntry[]>('data')) || [];
  if (existingMemories.length === 0) {
    const migrated: MemoryEntry[] = [];
    for (const [key, raw] of Object.entries(safeListLocalStorage('jg2_mem_'))) {
      if (!key.startsWith('jg2_mem_')) continue;
      try {
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || typeof entry.conversationId !== 'string' || typeof entry.content !== 'string') continue;
          migrated.push({
            id: entry.id,
            conversationId: entry.conversationId,
            timestamp: Number(entry.timestamp) || Date.now(),
            keywords: Array.isArray(entry.keywords) ? entry.keywords.map(String).slice(0, 8) : [],
            content: entry.content,
            source: entry.source === 'ai' ? 'ai' : 'user',
          });
        }
      } catch { /* Ignore malformed legacy local storage. */ }
    }
    if (migrated.length > 0) await memoriesStore.setItem('data', migrated);
  }

  const existingSubAI = await subAIModelsStore.getItem<ModelConfig[]>('data');
  if (!Array.isArray(existingSubAI) || existingSubAI.length === 0) {
    try {
      const raw = safeGetLocalStorage('jg2_subai_models');
      const parsedModels = raw ? JSON.parse(raw) : [];
      const legacyModels = Array.isArray(parsedModels) && parsedModels.length > 0 ? parsedModels : (() => {
        const baseUrl = safeGetLocalStorage('jg2_subai_url') || '';
        const apiKey = safeGetLocalStorage('jg2_subai_key') || '';
        const defaultModel = safeGetLocalStorage('jg2_subai_model') || '';
        return baseUrl && apiKey && defaultModel ? [{
          id: 'subai-legacy', name: '记忆官', baseUrl, apiKey, defaultModel,
          latency: -1, maxContextTokens: 4000, temperature: 0.3, topP: 0.95,
        }] : [];
      })();
      if (legacyModels.length > 0) {
        await subAIModelsStore.setItem('data', legacyModels);
        const activeId = safeGetLocalStorage('jg2_subai_active_model');
        if (activeId) {
          const settings = (await uiSettingsStore.getItem<Record<string, unknown>>('settings')) || {};
          const currentConfig = (settings.subAIConfig as Record<string, unknown> | undefined) || {};
          await uiSettingsStore.setItem('settings', { ...settings, subAIConfig: { ...currentConfig, modelId: activeId } });
        }
        for (const key of ['jg2_subai_models', 'jg2_subai_active_model', 'jg2_subai_url', 'jg2_subai_key', 'jg2_subai_model']) safeRemoveLocalStorage(key);
      }
    } catch { /* The user can configure a new independent clerk model. */ }
  }
}

function legacyDataUrlToBlob(value: string): Blob | null {
  const match = value.match(/^data:([^;,]+)(?:;[^,]+)*;base64,(.+)$/);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  } catch { return null; }
}

async function migrateLegacyCharacterImages(): Promise<void> {
  const characters = await charactersStore.getItem<Character[]>('data');
  if (!Array.isArray(characters) || characters.length === 0) return;
  const assetIds = (await imageAssetsStore.getItem<string[]>('index')) || [];
  let changed = false;
  for (const character of characters) {
    const candidates: Array<{ field: 'avatar' | 'coverImage'; idField: 'avatarAssetId' | 'coverAssetId'; kind: 'avatar' | 'cover' }> = [
      { field: 'avatar', idField: 'avatarAssetId', kind: 'avatar' },
      { field: 'coverImage', idField: 'coverAssetId', kind: 'cover' },
    ];
    for (const candidate of candidates) {
      const value = character[candidate.field];
      if (character[candidate.idField] || typeof value !== 'string' || !value.startsWith('data:')) continue;
      const blob = legacyDataUrlToBlob(value);
      if (!blob) continue;
      const id = crypto.randomUUID();
      const record: ImageAssetRecord = {
        id, kind: candidate.kind, mimeType: blob.type || 'image/jpeg', width: 0, height: 0,
        size: blob.size, createdAt: Date.now(), blob,
      };
      await imageAssetsStore.setItem(`asset:${id}`, record);
      assetIds.push(id);
      character[candidate.idField] = id;
      if (candidate.field === 'avatar') character.avatar = '🎭';
      else character.coverImage = undefined;
      changed = true;
    }
  }
  if (changed) await charactersStore.setItem('data', characters);
  if (assetIds.length > 0) await imageAssetsStore.setItem('index', [...new Set(assetIds)]);
}

export async function cleanupUnreferencedImageAssets(): Promise<void> {
  const characters = (await charactersStore.getItem<Character[]>('data')) || [];
  const referenced = new Set<string>();
  for (const character of characters) {
    if (character.avatarAssetId) referenced.add(character.avatarAssetId);
    if (character.coverAssetId) referenced.add(character.coverAssetId);
    for (const assetId of character.galleryAssetIds || []) referenced.add(assetId);
  }
  const cards = (await galleryCardsStore.getItem<GalleryCard[]>('data')) || [];
  for (const card of cards) {
    for (const item of card.items || []) if (item.assetId) referenced.add(item.assetId);
  }
  const modules = (await extensionModulesStore.getItem<ExtensionModule[]>('data')) || [];
  const assetIds = (await imageAssetsStore.getItem<string[]>('index')) || [];
  const stale = assetIds.filter((assetId) => !referenced.has(assetId));
  if (stale.length === 0) return;
  await Promise.all(stale.map((assetId) => imageAssetsStore.removeItem(`asset:${assetId}`)));
  await imageAssetsStore.setItem('index', assetIds.filter((assetId) => referenced.has(assetId)));
}

async function migrateLegacyDatabase(): Promise<void> {
  if (safeGetLocalStorage(MIGRATION_MARKER) === '1') return;
  await Promise.all([
    copyLegacyArray(modelsStore, DB_KEYS.models),
    copyLegacyArray(charactersStore, DB_KEYS.characters),
    copyLegacyArray(conversationsStore, DB_KEYS.conversations),
    copyLegacyArray(conversationFoldersStore, DB_KEYS.conversationFolders),
    copyLegacyArray(messageNodesStore, DB_KEYS.messageNodes),
    copyLegacyArray(worldbooksStore, DB_KEYS.worldbooks),
    copyLegacyArray(memoriesStore, DB_KEYS.memories),
  ]);
  if (await uiSettingsStore.getItem('settings') === null) {
    const legacySettings = await legacyStore('jg2_ui_settings').getItem('settings');
    if (legacySettings !== null) await uiSettingsStore.setItem('settings', legacySettings);
  }
  await migrateLegacyMemoryAndSubAI();
  safeSetLocalStorage(MIGRATION_MARKER, '1');
}

export async function initDB(): Promise<void> {
  await Promise.all(allStores.map((store) => store.ready()));
  await migrateLegacyDatabase();
  await migrateLegacyCharacterImages();
  await cleanupUnreferencedImageAssets();
  console.info('[DB] BayouTavern stores initialized');
}
