import {
  allStores,
  modelsStore,
  subAIModelsStore,
  charactersStore,
  conversationsStore,
  conversationFoldersStore,
  messageNodesStore,
  worldbooksStore,
  memoriesStore,
  imageAssetsStore,
  extensionModulesStore,
  galleryCardsStore,
  uiSettingsStore,
} from '../db';
import { getAllImageAssets } from '../db/stores';
import type { ImageAssetKind, ImageAssetRecord } from '../types';
import { safeListLocalStorage, safeRemoveLocalStorage, safeSetLocalStorage } from './safeStorage';
import { decryptJson, decryptPlayableJson, encryptPlayableJson, type EncryptedPackageEnvelope } from './crypto';

const PROJECT_LOCAL_STORAGE_PREFIX = 'jg2_';
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_COLLECTION_ITEMS = 50_000;
const SENSITIVE_LOCAL_STORAGE_KEYS = new Set([
  'jg2_subai_models', 'jg2_subai_active_model', 'jg2_subai_key', 'jg2_subai_url', 'jg2_subai_model',
]);

export interface FullBackupPayload {
  version: 5;
  app: 'BayouTavern Lite 2.0';
  exportedAt: string;
  stores: {
    models: unknown[];
    subAIModels: unknown[];
    characters: unknown[];
    conversations: unknown[];
    conversationFolders: unknown[];
    messageNodes: unknown[];
    worldBooks: unknown[];
    memories: unknown[];
    assets: unknown[];
    extensionModules: unknown[];
    galleryCards: unknown[];
    uiSettings: unknown;
  };
  localStorage: Record<string, string>;
}

type RawProjectState = Omit<FullBackupPayload, 'version' | 'app' | 'exportedAt'>;

function withoutApiKey(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { apiKey: _apiKey, ...safe } = value as Record<string, unknown>;
  return safe;
}

function readProjectLocalStorage(): Record<string, string> {
  return Object.fromEntries(Object.entries(safeListLocalStorage(PROJECT_LOCAL_STORAGE_PREFIX))
    .filter(([key]) => !SENSITIVE_LOCAL_STORAGE_KEYS.has(key) && !key.startsWith('jg2_mem_')));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片资源读取失败'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(value: string): Blob {
  const match = value.match(/^data:([^;,]+)(?:;[^,]+)*;base64,(.+)$/);
  if (!match) throw new Error('图片资源格式无效。');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

async function readRawProjectState(): Promise<RawProjectState> {
  const [models, subAIModels, characters, conversations, conversationFolders, messageNodes, worldBooks, memories, imageAssets, extensionModules, galleryCards, uiSettings] = await Promise.all([
    modelsStore.getItem<unknown[]>('data'), subAIModelsStore.getItem<unknown[]>('data'), charactersStore.getItem<unknown[]>('data'),
    conversationsStore.getItem<unknown[]>('data'), conversationFoldersStore.getItem<unknown[]>('data'), messageNodesStore.getItem<unknown[]>('data'),
    worldbooksStore.getItem<unknown[]>('data'), memoriesStore.getItem<unknown[]>('data'), getAllImageAssets(), extensionModulesStore.getItem<unknown[]>('data'), galleryCardsStore.getItem<unknown[]>('data'), uiSettingsStore.getItem<unknown>('settings'),
  ]);
  const assets = await Promise.all((imageAssets as ImageAssetRecord[]).map(async (asset) => ({
    id: asset.id, kind: asset.kind, mimeType: asset.mimeType, width: asset.width, height: asset.height,
    size: asset.size, createdAt: asset.createdAt, hash: asset.hash, data: await blobToDataUrl(asset.blob),
  })));
  return {
    stores: {
      models: Array.isArray(models) ? models : [], subAIModels: Array.isArray(subAIModels) ? subAIModels : [],
      characters: Array.isArray(characters) ? characters : [], conversations: Array.isArray(conversations) ? conversations : [],
      conversationFolders: Array.isArray(conversationFolders) ? conversationFolders : [], messageNodes: Array.isArray(messageNodes) ? messageNodes : [],
      worldBooks: Array.isArray(worldBooks) ? worldBooks : [], memories: Array.isArray(memories) ? memories : [], assets,
      extensionModules: Array.isArray(extensionModules) ? extensionModules : [], galleryCards: Array.isArray(galleryCards) ? galleryCards : [], uiSettings: uiSettings || null,
    },
    localStorage: safeListLocalStorage(PROJECT_LOCAL_STORAGE_PREFIX),
  };
}

export async function createFullBackup(): Promise<FullBackupPayload> {
  const raw = await readRawProjectState();
  const hasProtectedCharacter = raw.stores.characters.some((value) => isRecord(value) && value.protectionMode === 'protected');
  const localStorage = readProjectLocalStorage();
  if (hasProtectedCharacter) delete localStorage.jg2_debug_mode;
  return {
    version: 5,
    app: 'BayouTavern Lite 2.0',
    exportedAt: new Date().toISOString(),
    stores: {
      ...raw.stores,
      models: raw.stores.models.map(withoutApiKey),
      subAIModels: raw.stores.subAIModels.map(withoutApiKey),
    },
    localStorage,
  };
}

export async function hasExistingProjectData(): Promise<boolean> {
  const raw = await readRawProjectState();
  return Object.values(raw.stores).some((value) => Array.isArray(value) && value.length > 0)
    || Object.keys(raw.localStorage).some((key) => key !== 'jg2_ds_seeded' && key !== 'jg2_bayou_tavern_db_migrated');
}

export async function clearProjectData(): Promise<void> {
  await Promise.all(allStores.map((store) => store.clear()));
  for (const key of Object.keys(safeListLocalStorage(PROJECT_LOCAL_STORAGE_PREFIX))) safeRemoveLocalStorage(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readArray(payload: Record<string, unknown>, key: string, legacyKey = key): Record<string, unknown>[] {
  const stores = isRecord(payload.stores) ? payload.stores : payload;
  const value = stores[key] ?? payload[legacyKey];
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_COLLECTION_ITEMS) throw new Error(`${key} 条目过多，已拒绝导入。`);
  if (!value.every(isRecord)) throw new Error(`${key} 的数据结构无效。`);
  return value;
}

function ensureString(value: unknown, field: string, maxLength: number, required = true): void {
  if (!required && value === undefined) return;
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > maxLength) throw new Error(`字段 ${field} 无效或过长。`);
}

function validateEntries(entries: Record<string, unknown>[], kind: string, required: string[], textFields: string[] = []): void {
  for (const entry of entries) {
    for (const field of required) ensureString(entry[field], `${kind}.${field}`, 512);
    for (const field of textFields) ensureString(entry[field], `${kind}.${field}`, 200_000, false);
  }
}

export function validateBackupForImport(payload: unknown): RawProjectState {
  if (!isRecord(payload)) throw new Error('无效的数据文件。');
  const version = payload.version;
  if (version !== undefined && version !== 2 && version !== 3 && version !== 4 && version !== 5) throw new Error('不支持的备份版本。');
  const models = readArray(payload, 'models');
  const subAIModels = readArray(payload, 'subAIModels');
  const characters = readArray(payload, 'characters');
  const conversations = readArray(payload, 'conversations');
  const conversationFolders = readArray(payload, 'conversationFolders');
  const messageNodes = readArray(payload, 'messageNodes');
  const worldBooks = readArray(payload, 'worldBooks', 'worldbooks');
  const memories = readArray(payload, 'memories');
  const assets = readArray(payload, 'assets');
  const extensionModules = readArray(payload, 'extensionModules');
  const galleryCards = readArray(payload, 'galleryCards');
  validateEntries(models, 'models', ['id', 'name', 'baseUrl', 'defaultModel']);
  validateEntries(subAIModels, 'subAIModels', ['id', 'name', 'baseUrl', 'defaultModel']);
  validateEntries(characters, 'characters', ['id', 'name'], ['systemPrompt', 'openingLine', 'avatar', 'coverImage']);
  validateEntries(conversations, 'conversations', ['id', 'title', 'characterId']);
  validateEntries(messageNodes, 'messageNodes', ['id', 'conversationId', 'role', 'content'], ['content', 'reasoning']);
  validateEntries(worldBooks, 'worldBooks', ['id', 'name']);
  validateEntries(memories, 'memories', ['id', 'conversationId', 'content'], ['content']);
  validateEntries(assets, 'assets', ['id', 'kind', 'mimeType']);
  validateEntries(extensionModules, 'extensionModules', ['id', 'type', 'name']);
  validateEntries(galleryCards, 'galleryCards', ['id', 'title']);
  for (const asset of assets) ensureString(asset.data, 'assets.data', MAX_BACKUP_BYTES);
  const stores = isRecord(payload.stores) ? payload.stores : payload;
  const localStorage = isRecord(payload.localStorage)
    ? Object.fromEntries(Object.entries(payload.localStorage).filter(([key, value]) => key.startsWith(PROJECT_LOCAL_STORAGE_PREFIX) && !SENSITIVE_LOCAL_STORAGE_KEYS.has(key) && !key.startsWith('jg2_mem_') && typeof value === 'string')) as Record<string, string>
    : {};
  return {
    stores: { models, subAIModels, characters, conversations, conversationFolders, messageNodes, worldBooks, memories, assets, extensionModules, galleryCards, uiSettings: stores.uiSettings ?? payload.uiSettings ?? null },
    localStorage,
  };
}

function preserveApiKeys(imported: Record<string, unknown>[], existing: unknown[]): Record<string, unknown>[] {
  const existingKeys = new Map(existing.filter(isRecord).map((item) => [String(item.id || ''), typeof item.apiKey === 'string' ? item.apiKey : '']));
  return imported.map((item) => ({ ...withoutApiKey(item) as Record<string, unknown>, apiKey: existingKeys.get(String(item.id || '')) || '' }));
}

async function applyRawProjectState(next: RawProjectState, preserveCredentialsFrom?: RawProjectState): Promise<void> {
  const oldModels = preserveCredentialsFrom?.stores.models || [];
  const oldSubAIModels = preserveCredentialsFrom?.stores.subAIModels || [];
  await Promise.all(allStores.map((store) => store.clear()));
  const assets: ImageAssetRecord[] = next.stores.assets.map((asset) => {
    const value = asset as Record<string, unknown>;
    const { data, ...metadata } = value;
    return {
      id: String(metadata.id), kind: String(metadata.kind) as ImageAssetKind,
      mimeType: String(metadata.mimeType || 'image/jpeg'), width: Number(metadata.width) || 0,
      height: Number(metadata.height) || 0, size: Number(metadata.size) || 0,
      createdAt: Number(metadata.createdAt) || Date.now(), hash: typeof metadata.hash === 'string' ? metadata.hash : undefined,
      blob: dataUrlToBlob(String(data)),
    };
  });
  await Promise.all([
    modelsStore.setItem('data', preserveApiKeys(next.stores.models as Record<string, unknown>[], oldModels)),
    subAIModelsStore.setItem('data', preserveApiKeys(next.stores.subAIModels as Record<string, unknown>[], oldSubAIModels)),
    charactersStore.setItem('data', next.stores.characters), conversationsStore.setItem('data', next.stores.conversations),
    conversationFoldersStore.setItem('data', next.stores.conversationFolders), messageNodesStore.setItem('data', next.stores.messageNodes),
    worldbooksStore.setItem('data', next.stores.worldBooks), memoriesStore.setItem('data', next.stores.memories),
    extensionModulesStore.setItem('data', next.stores.extensionModules), galleryCardsStore.setItem('data', next.stores.galleryCards),
    imageAssetsStore.setItem('index', assets.map((asset) => String(asset.id))),
    ...assets.map((asset) => imageAssetsStore.setItem(`asset:${String(asset.id)}`, asset)),
    uiSettingsStore.setItem('settings', next.stores.uiSettings),
  ]);
  for (const key of Object.keys(safeListLocalStorage(PROJECT_LOCAL_STORAGE_PREFIX))) {
    if (!SENSITIVE_LOCAL_STORAGE_KEYS.has(key)) safeRemoveLocalStorage(key);
  }
  for (const [key, value] of Object.entries(next.localStorage)) safeSetLocalStorage(key, value);
}

export async function restoreFullBackup(payload: unknown, sourceBytes?: number): Promise<{ conversationIds: string[] }> {
  if (sourceBytes !== undefined && sourceBytes > MAX_BACKUP_BYTES) throw new Error('备份文件超过 50MB，已拒绝导入。');
  const next = validateBackupForImport(payload);
  const snapshot = await readRawProjectState();
  try {
    await applyRawProjectState(next, snapshot);
  } catch (error) {
    try { await applyRawProjectState(snapshot); } catch { /* Keep the original error; rollback failures are reported below. */ }
    throw new Error(`导入失败，已尝试恢复导入前快照：${error instanceof Error ? error.message : String(error)}`);
  }
  return { conversationIds: next.stores.conversations.map((conversation) => String((conversation as Record<string, unknown>).id || '')).filter(Boolean) };
}

export interface CharacterBackupPayload {
  version: 1;
  type: 'character-package';
  app: 'BayouTavern Lite 2.0';
  exportedAt: string;
  stores?: {
    characters: unknown[];
    worldBooks: unknown[];
    conversations: unknown[];
    messageNodes: unknown[];
    memories: unknown[];
    extensionModules: unknown[];
    galleryCards: unknown[];
    assets: unknown[];
  };
  statusBarTemplates?: Record<string, unknown>;
  localStorage?: Record<string, string>;
  encrypted?: EncryptedPackageEnvelope;
}

interface CharacterPackageContents {
  stores: NonNullable<CharacterBackupPayload['stores']>;
  statusBarTemplates: Record<string, unknown>;
  localStorage: Record<string, string>;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseTemplates(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch { return {}; }
}

function packageLocalStorage(): Record<string, string> {
  const allowed = new Set(['jg2_sbtpl', 'jg2_extension_button_style', 'jg2_extension_show_icons']);
  return Object.fromEntries(Object.entries(readProjectLocalStorage()).filter(([key]) => allowed.has(key)));
}

async function createPlainCharacterBackup(characterId: string): Promise<CharacterBackupPayload> {
  const raw = await readRawProjectState();
  const characters = raw.stores.characters.filter((value) => isRecord(value) && value.id === characterId);
  if (characters.length !== 1) throw new Error('找不到要导出的角色卡。');
  const character = characters[0] as Record<string, unknown>;
  const conversations = raw.stores.conversations.filter((value) => isRecord(value) && value.characterId === characterId);
  const conversationIds = new Set(conversations.map((value) => String((value as Record<string, unknown>).id)));
  const messageNodes = raw.stores.messageNodes.filter((value) => isRecord(value) && conversationIds.has(String(value.conversationId)));
  const memories = raw.stores.memories.filter((value) => isRecord(value) && conversationIds.has(String(value.conversationId)));
  const extensionModules = raw.stores.extensionModules.filter((value) => isRecord(value) && Array.isArray(value.characterIds) && value.characterIds.includes(characterId));
  const galleryCards = raw.stores.galleryCards.filter((value) => isRecord(value) && Array.isArray(value.characterIds) && value.characterIds.includes(characterId));
  const assetIds = new Set<string>();
  for (const key of ['avatarAssetId', 'coverAssetId'] as const) if (typeof character[key] === 'string') assetIds.add(character[key] as string);
  if (Array.isArray(character.galleryAssetIds)) character.galleryAssetIds.forEach((id) => { if (typeof id === 'string') assetIds.add(id); });
  for (const card of galleryCards) for (const item of (card as any).items || []) if (item?.assetId) assetIds.add(String(item.assetId));
  for (const node of messageNodes) for (const item of (node as any).gallery?.items || []) if (item?.assetId) assetIds.add(String(item.assetId));
  const assets = raw.stores.assets.filter((value) => isRecord(value) && assetIds.has(String(value.id)));
  const allTemplates = parseTemplates(readProjectLocalStorage().jg2_sbtpl);
  const statusBarTemplates: Record<string, unknown> = {};
  const statusBarTemplateName = typeof character.statusBarTemplateName === 'string' ? character.statusBarTemplateName : '';
  if (statusBarTemplateName && allTemplates[statusBarTemplateName]) statusBarTemplates[statusBarTemplateName] = allTemplates[statusBarTemplateName];
  if (Object.keys(statusBarTemplates).length === 0 && character.statusBarTemplate) statusBarTemplates.__bound__ = cloneJson(character.statusBarTemplate);
  return {
    version: 1,
    type: 'character-package',
    app: 'BayouTavern Lite 2.0',
    exportedAt: new Date().toISOString(),
    stores: { characters, worldBooks: raw.stores.worldBooks.filter((value) => isRecord(value) && value.id === character.worldBookId), conversations, messageNodes, memories, extensionModules, galleryCards, assets },
    statusBarTemplates,
    localStorage: packageLocalStorage(),
  };
}

export async function createCharacterBackup(
  characterId: string,
  options: { encrypted?: boolean; password?: string } = {},
): Promise<CharacterBackupPayload> {
  options.password = options.password || 'play-only-package';
  const plain = await createPlainCharacterBackup(characterId);
  const character = plain.stores?.characters[0] as Record<string, unknown> | undefined;
  if (!character) throw new Error('找不到要导出的角色卡。');
  if (!options.encrypted) {
    if (character.protectionMode === 'protected') throw new Error('该角色卡属于加密游玩包，不能明文导出。');
    return plain;
  }
  if (!options.password) throw new Error('加密密码不能为空。');
  const packageId = crypto.randomUUID();
  const contents: CharacterPackageContents = {
    stores: cloneJson(plain.stores!),
    statusBarTemplates: cloneJson(plain.statusBarTemplates || {}),
    localStorage: cloneJson(plain.localStorage || {}),
  };
  const protectedCharacter = contents.stores.characters[0] as Record<string, unknown>;
  protectedCharacter.protectionMode = 'protected';
  protectedCharacter.protectionMeta = {
    version: 1,
    packageId,
    encryptedAt: new Date().toISOString(),
    algorithm: 'AES-GCM',
  };
  return {
    version: 1,
    type: 'character-package',
    app: 'BayouTavern Lite 2.0',
    exportedAt: new Date().toISOString(),
    encrypted: await encryptPlayableJson(contents),
  };
}

function normalizeCharacterPackage(payload: unknown): RawProjectState {
  if (!isRecord(payload) || payload.type !== 'character-package') throw new Error('不是有效的单角色卡数据包。');
  if (payload.version !== 1) throw new Error('不支持的单角色卡数据包版本。');
  const stores = isRecord(payload.stores) ? payload.stores : {};
  const normalized = validateBackupForImport({
    version: 5,
    stores: {
      models: [], subAIModels: [], characters: stores.characters, worldBooks: stores.worldBooks,
      conversations: stores.conversations, conversationFolders: [], messageNodes: stores.messageNodes,
      memories: stores.memories, assets: stores.assets, extensionModules: stores.extensionModules,
      galleryCards: stores.galleryCards, uiSettings: null,
    },
    localStorage: payload.localStorage,
  });
  if (normalized.stores.characters.length !== 1) throw new Error('单角色卡数据包必须且只能包含一张角色卡。');
  return normalized;
}

function remapGallerySnapshot(value: unknown, cardIds: Map<string, string>, assetIds: Map<string, string>, characterIds: Map<string, string>): unknown {
  if (!isRecord(value)) return value;
  const gallery = cloneJson(value);
  if (typeof gallery.id === 'string' && cardIds.has(gallery.id)) gallery.id = cardIds.get(gallery.id);
  if (Array.isArray(gallery.characterIds)) gallery.characterIds = gallery.characterIds.map((id: unknown) => characterIds.get(String(id)) || id).filter(Boolean);
  if (Array.isArray(gallery.items)) gallery.items = gallery.items.map((item: any) => ({ ...item, assetId: item.assetId ? assetIds.get(String(item.assetId)) || item.assetId : item.assetId }));
  return gallery;
}

function mergeCharacterPackage(source: RawProjectState, current: RawProjectState, packageTemplates: Record<string, unknown>): { next: RawProjectState; characterId: string; conversationIds: string[] } {
  const oldCharacterId = String((source.stores.characters[0] as any).id);
  const characterIds = new Map([[oldCharacterId, crypto.randomUUID()]]);
  const worldBookIds = new Map(source.stores.worldBooks.filter(isRecord).map((book) => [String(book.id), crypto.randomUUID()]));
  const conversationIds = new Map(source.stores.conversations.filter(isRecord).map((conversation) => [String(conversation.id), crypto.randomUUID()]));
  const messageIds = new Map(source.stores.messageNodes.filter(isRecord).map((node) => [String(node.id), crypto.randomUUID()]));
  const memoryIds = new Map(source.stores.memories.filter(isRecord).map((memory) => [String(memory.id), crypto.randomUUID()]));
  const moduleIds = new Map(source.stores.extensionModules.filter(isRecord).map((module) => [String(module.id), crypto.randomUUID()]));
  const galleryIds = new Map(source.stores.galleryCards.filter(isRecord).map((card) => [String(card.id), crypto.randomUUID()]));
  const assetIds = new Map(source.stores.assets.filter(isRecord).map((asset) => [String(asset.id), crypto.randomUUID()]));
  const entryIds = new Map<string, string>();
  for (const book of source.stores.worldBooks.filter(isRecord)) for (const entry of (book.entries as any[]) || []) if (entry?.id) entryIds.set(String(entry.id), crypto.randomUUID());
  const importedCharacterId = characterIds.get(oldCharacterId)!;
  const importedConversations = source.stores.conversations.map((value: any) => ({ ...cloneJson(value), id: conversationIds.get(String(value.id)), characterId: importedCharacterId, modelId: current.stores.models.some((model: any) => model.id === value.modelId) ? value.modelId : null }));
  const importedNodes = source.stores.messageNodes.map((value: any) => ({
    ...cloneJson(value), id: messageIds.get(String(value.id)), conversationId: conversationIds.get(String(value.conversationId)),
    activatedWorldBookEntries: Array.isArray(value.activatedWorldBookEntries) ? value.activatedWorldBookEntries.map((entry: any) => ({ ...entry, id: entryIds.get(String(entry.id)) || entry.id })) : value.activatedWorldBookEntries,
    gallery: remapGallerySnapshot(value.gallery, galleryIds, assetIds, characterIds),
  }));
  const importedWorldBooks = source.stores.worldBooks.map((value: any) => ({ ...cloneJson(value), id: worldBookIds.get(String(value.id)), entries: (value.entries || []).map((entry: any) => ({ ...entry, id: entryIds.get(String(entry.id)) || entry.id })) }));
  const importedCards = source.stores.galleryCards.map((value: any) => ({ ...cloneJson(value), id: galleryIds.get(String(value.id)), characterIds: [importedCharacterId], items: (value.items || []).map((item: any) => ({ ...item, assetId: item.assetId ? assetIds.get(String(item.assetId)) || item.assetId : item.assetId })) }));
  const importedModules = source.stores.extensionModules.map((value: any) => ({ ...cloneJson(value), id: moduleIds.get(String(value.id)), characterIds: [importedCharacterId], galleryCardId: value.galleryCardId ? galleryIds.get(String(value.galleryCardId)) || value.galleryCardId : value.galleryCardId }));
  const sourceCharacter: any = cloneJson(source.stores.characters[0]) as any;
  const importedCharacter: any = {
    ...sourceCharacter,
    id: importedCharacterId,
    worldBookId: sourceCharacter.worldBookId ? worldBookIds.get(String(sourceCharacter.worldBookId)) : undefined,
    avatarAssetId: sourceCharacter.avatarAssetId ? assetIds.get(String(sourceCharacter.avatarAssetId)) : sourceCharacter.avatarAssetId,
    coverAssetId: sourceCharacter.coverAssetId ? assetIds.get(String(sourceCharacter.coverAssetId)) : sourceCharacter.coverAssetId,
    galleryAssetIds: Array.isArray(sourceCharacter.galleryAssetIds)
      ? sourceCharacter.galleryAssetIds.map((id: unknown) => assetIds.get(String(id)) || id)
      : sourceCharacter.galleryAssetIds,
  };
  const templateNames = Object.keys(packageTemplates);
  const currentTemplates = parseTemplates(current.localStorage.jg2_sbtpl);
  const mergedTemplates = { ...currentTemplates };
  let importedTemplateName = typeof importedCharacter.statusBarTemplateName === 'string' ? importedCharacter.statusBarTemplateName : '';
  if (templateNames.length > 0) {
    for (const originalName of templateNames) {
      let name = originalName === '__bound__' ? `${importedCharacter.name}状态栏` : originalName;
      while (mergedTemplates[name] || ['single', 'multi', 'dynamic-multi'].includes(name)) name += '（导入）';
      mergedTemplates[name] = packageTemplates[originalName];
      if (originalName === importedCharacter.statusBarTemplateName || originalName === '__bound__') importedTemplateName = name;
    }
    importedCharacter.statusBarTemplateName = importedTemplateName;
  }
  const importedAssets = source.stores.assets.map((value: any) => ({ ...cloneJson(value), id: assetIds.get(String(value.id)) }));
  const importedMemories = source.stores.memories.map((value: any) => ({ ...cloneJson(value), id: memoryIds.get(String(value.id)), conversationId: conversationIds.get(String(value.conversationId)) }));
  const nextLocalStorage = { ...current.localStorage, ...Object.fromEntries(Object.entries(source.localStorage).filter(([key]) => ['jg2_extension_button_style', 'jg2_extension_show_icons'].includes(key))) };
  if (Object.keys(mergedTemplates).length > 0) nextLocalStorage.jg2_sbtpl = JSON.stringify(mergedTemplates);
  const next: RawProjectState = {
    stores: {
      models: current.stores.models, subAIModels: current.stores.subAIModels, characters: [...current.stores.characters, importedCharacter],
      conversations: [...current.stores.conversations, ...importedConversations], conversationFolders: current.stores.conversationFolders,
      messageNodes: [...current.stores.messageNodes, ...importedNodes], worldBooks: [...current.stores.worldBooks, ...importedWorldBooks],
      memories: [...current.stores.memories, ...importedMemories], assets: [...current.stores.assets, ...importedAssets],
      extensionModules: [...current.stores.extensionModules, ...importedModules], galleryCards: [...current.stores.galleryCards, ...importedCards], uiSettings: current.stores.uiSettings,
    },
    localStorage: nextLocalStorage,
  };
  return { next, characterId: importedCharacterId, conversationIds: importedConversations.map((conversation: any) => conversation.id) };
}

export async function restoreCharacterBackup(
  payload: unknown,
  sourceBytes?: number,
  options: { password?: string } = {},
): Promise<{ characterId: string; conversationIds: string[] }> {
  if (sourceBytes !== undefined && sourceBytes > MAX_BACKUP_BYTES) throw new Error('角色卡数据包超过 50MB，已拒绝导入。');
  let packagePayload = payload;
  let encryptedImport = false;
  if (isRecord(payload) && payload.encrypted) {
    encryptedImport = true;
    const encryptedEnvelope = payload.encrypted as EncryptedPackageEnvelope;
    const decrypted = encryptedEnvelope.access === 'play-only'
      ? await decryptPlayableJson(encryptedEnvelope)
      : await decryptJson(encryptedEnvelope, options.password || '');
    if (!isRecord(decrypted)) throw new Error('解密后的角色卡包结构无效。');
    packagePayload = { ...payload, ...decrypted, encrypted: undefined };
  }
  const source = normalizeCharacterPackage(packagePayload);
  if (encryptedImport) {
    const importedCharacter = source.stores.characters[0] as Record<string, unknown>;
    importedCharacter.protectionMode = 'protected';
    if (!isRecord(importedCharacter.protectionMeta)) {
      importedCharacter.protectionMeta = {
        version: 1,
        packageId: crypto.randomUUID(),
        encryptedAt: new Date().toISOString(),
        algorithm: 'AES-GCM',
      };
    }
  }
  const snapshot = await readRawProjectState();
  const packageTemplates = isRecord(packagePayload) && isRecord(packagePayload.statusBarTemplates) ? packagePayload.statusBarTemplates : {};
  const merged = mergeCharacterPackage(source, snapshot, packageTemplates);
  if (encryptedImport) delete merged.next.localStorage.jg2_debug_mode;
  try {
    await applyRawProjectState(merged.next, snapshot);
  } catch (error) {
    try { await applyRawProjectState(snapshot); } catch { /* Report the original import error. */ }
    throw new Error(`角色卡导入失败，已尝试恢复导入前快照：${error instanceof Error ? error.message : String(error)}`);
  }
  return { characterId: merged.characterId, conversationIds: merged.conversationIds };
}
