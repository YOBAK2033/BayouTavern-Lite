import { useState, useEffect, useCallback } from 'react';
import type { Conversation, ConversationFolder } from '../types';
import * as Stores from '../db/stores';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [folders, setFolders] = useState<ConversationFolder[]>([]);

  const loadConversations = useCallback(async () => {
    const all = await Stores.getAllConversations();
    setConversations(all);
    const f = await Stores.getAllConversationFolders();
    setFolders(f);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    const handleConversationsChanged = () => { void loadConversations(); };
    window.addEventListener('jg2-conversations-changed', handleConversationsChanged);
    return () => window.removeEventListener('jg2-conversations-changed', handleConversationsChanged);
  }, [loadConversations]);

  const deleteConversation = useCallback(async (id: string) => {
    await Stores.deleteConversationCascade(id);
    await loadConversations();
  }, [loadConversations]);

  return { conversations, folders, loadConversations, deleteConversation };
}
