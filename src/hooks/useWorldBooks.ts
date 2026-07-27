import { useState, useEffect, useCallback } from 'react';
import type { WorldBook, WorldBookEntry } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

export function useWorldBooks() {
  const [worldbooks, setWorldbooks] = useState<WorldBook[]>([]);

  const loadWorldBooks = useCallback(async () => {
    const all = await Stores.getAllWorldBooks();
    setWorldbooks(all);
  }, []);

  useEffect(() => { loadWorldBooks(); }, [loadWorldBooks]);

  const addWorldBook = useCallback(async (name: string) => {
    const wb: WorldBook = { id: generateId(), name, entries: [] };
    await Stores.addWorldBook(wb);
    await loadWorldBooks();
    return wb;
  }, [loadWorldBooks]);

  const updateWorldBook = useCallback(async (id: string, updates: Partial<WorldBook>) => {
    await Stores.updateWorldBook(id, updates);
    await loadWorldBooks();
  }, [loadWorldBooks]);

  const deleteWorldBook = useCallback(async (id: string) => {
    await Stores.deleteWorldBook(id);
    await loadWorldBooks();
  }, [loadWorldBooks]);

  const addEntry = useCallback(async (wbId: string, entry: Omit<WorldBookEntry, 'id'> & { pinned?: boolean }) => {
    const wb = worldbooks.find((w) => w.id === wbId);
    if (!wb) return;
    const newEntry: WorldBookEntry = { keys: entry.keys, value: entry.value, priority: entry.priority || 5, pinned: entry.pinned || false, id: generateId() };
    const entries = [...wb.entries, newEntry];
    await Stores.updateWorldBook(wbId, { entries });
    await loadWorldBooks();
    return newEntry;
  }, [worldbooks, loadWorldBooks]);

  const updateEntry = useCallback(async (wbId: string, entryId: string, updates: Partial<WorldBookEntry>) => {
    const wb = worldbooks.find((w) => w.id === wbId);
    if (!wb) return;
    const entries = wb.entries.map((e) => e.id === entryId ? { ...e, ...updates } : e);
    await Stores.updateWorldBook(wbId, { entries });
    await loadWorldBooks();
  }, [worldbooks, loadWorldBooks]);

  const deleteEntry = useCallback(async (wbId: string, entryId: string) => {
    const wb = worldbooks.find((w) => w.id === wbId);
    if (!wb) return;
    const entries = wb.entries.filter((e) => e.id !== entryId);
    await Stores.updateWorldBook(wbId, { entries });
    await loadWorldBooks();
  }, [worldbooks, loadWorldBooks]);

  const bulkAddEntries = useCallback(async (wbId: string, newEntries: (Omit<WorldBookEntry, 'id'> & { pinned?: boolean })[]) => {
    const wb = worldbooks.find((w) => w.id === wbId);
    if (!wb) return;
    const withIds = newEntries.map((e) => ({ keys: e.keys, value: e.value, priority: e.priority || 5, pinned: e.pinned || false, id: generateId() }));
    const entries = [...wb.entries, ...withIds];
    await Stores.updateWorldBook(wbId, { entries });
    await loadWorldBooks();
  }, [worldbooks, loadWorldBooks]);

  return { worldbooks, loadWorldBooks, addWorldBook, updateWorldBook, deleteWorldBook, addEntry, updateEntry, deleteEntry, bulkAddEntries };
}
