import { useState, useEffect, useCallback } from 'react';
import type { ModelConfig } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

export function useModels() {
  const [models, setModels] = useState<ModelConfig[]>([]);

  const loadModels = useCallback(async () => {
    const all = await Stores.getAllModels();
    setModels(all);
  }, []);

  useEffect(() => {
    void loadModels();
    const refresh = () => { void loadModels(); };
    window.addEventListener('jg2:models-changed', refresh);
    return () => window.removeEventListener('jg2:models-changed', refresh);
  }, [loadModels]);

  const addModel = useCallback(async (model: Omit<ModelConfig, 'id'>) => {
    const m: ModelConfig = { ...model, id: generateId() };
    await Stores.addModel(m);
    await loadModels();
    return m;
  }, [loadModels]);

  const updateModel = useCallback(async (id: string, updates: Partial<ModelConfig>) => {
    await Stores.updateModel(id, updates);
    await loadModels();
  }, [loadModels]);

  const deleteModel = useCallback(async (id: string) => {
    await Stores.deleteModel(id);
    await loadModels();
  }, [loadModels]);

  return { models, loadModels, addModel, updateModel, deleteModel };
}
