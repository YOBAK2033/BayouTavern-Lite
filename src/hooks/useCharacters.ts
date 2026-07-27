import { useState, useEffect, useCallback } from 'react';
import type { Character } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

export function useCharacters() {
  const [characters, setCharacters] = useState<Character[]>([]);

  const loadCharacters = useCallback(async () => {
    const all = await Stores.getAllCharacters();
    setCharacters(all);
  }, []);

  useEffect(() => {
    void loadCharacters();
    if (typeof window === 'undefined') return;
    const handleChanged = () => { void loadCharacters(); };
    window.addEventListener('jg2:characters-changed', handleChanged);
    return () => window.removeEventListener('jg2:characters-changed', handleChanged);
  }, [loadCharacters]);

  const addCharacter = useCallback(async (char: Omit<Character, 'id'>) => {
    const c: Character = { ...char, id: generateId() };
    await Stores.addCharacter(c);
    await loadCharacters();
    return c;
  }, [loadCharacters]);

  const updateCharacter = useCallback(async (id: string, updates: Partial<Character>) => {
    await Stores.updateCharacter(id, updates);
    await loadCharacters();
  }, [loadCharacters]);

  const deleteCharacter = useCallback(async (id: string) => {
    await Stores.deleteCharacterCascade(id);
    await loadCharacters();
  }, [loadCharacters]);

  return { characters, loadCharacters, addCharacter, updateCharacter, deleteCharacter };
}
