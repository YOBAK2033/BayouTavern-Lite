import { describe, expect, it } from 'vitest';
import { validateBackupForImport } from './dataTransfer';

const baseBackup = {
  version: 3,
  stores: {
    models: [{ id: 'main', name: 'Main', baseUrl: 'https://example.com', defaultModel: 'test' }],
    subAIModels: [{ id: 'clerk', name: 'Clerk', baseUrl: 'https://example.com', defaultModel: 'test' }],
    characters: [{ id: 'char', name: 'Character' }],
    conversations: [{ id: 'conv', title: 'Conversation', characterId: 'char' }],
    conversationFolders: [],
    messageNodes: [{ id: 'msg', conversationId: 'conv', role: 'user', content: 'hello' }],
    worldBooks: [{ id: 'book', name: 'Book' }],
    memories: [{ id: 'memory', conversationId: 'conv', content: 'summary' }],
    uiSettings: null,
  },
  localStorage: { jg2_theme_hint: 'dark', jg2_subai_key: 'must-not-import' },
};

describe('backup schema validation', () => {
  it('accepts valid data and filters sensitive local storage keys', () => {
    const parsed = validateBackupForImport(baseBackup);
    expect(parsed.stores.conversations).toHaveLength(1);
    expect(parsed.localStorage).toEqual({ jg2_theme_hint: 'dark' });
  });

  it('rejects malformed required records', () => {
    expect(() => validateBackupForImport({ ...baseBackup, stores: { ...baseBackup.stores, conversations: [{}] } })).toThrow();
  });
});
