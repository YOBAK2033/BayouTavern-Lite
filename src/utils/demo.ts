import * as Stores from '../db/stores';
import { generateId } from './id';
import type { Conversation, MessageNode } from '../types';

export async function seedDemoConversation() {
  const existing = await Stores.getAllConversations();
  if (existing.length > 0) return;
  
  const charId = generateId();
  const convId = generateId();
  
  await Stores.addCharacter({
    id: charId,
    name: '示例角色',
    avatar: '🤖',
    systemPrompt: '你是一个友好的AI助手。',
    openingLine: '你好！我是示例角色，这展示了状态栏功能。',
  });
  
  const conv: Conversation = {
    id: convId,
    title: '示例角色',
    characterId: charId,
    modelId: null,
  };
  await Stores.addConversation(conv);
  
  const nodes: MessageNode[] = [
    {
      id: generateId(), conversationId: convId, role: 'user',
      senderName: '你', content: '你好！', isArchived: false, timestamp: Date.now() - 60000,
    },
    {
      id: generateId(), conversationId: convId, role: 'assistant',
      senderName: '示例角色', content: '你好！有什么可以帮你的？',
      isArchived: false, timestamp: Date.now() - 30000,
      tokenCost: 15, tokenCostInput: 120, tokenCostTotal: 135, tokenCostIsExact: true,
    },
  ];
  for (const n of nodes) await Stores.addMessageNode(n);

  // Set status text on the last AI node
  const allNodes = await Stores.getMessageNodesByConversation(convId);
  const lastAI = allNodes.reverse().find((n) => n.role === 'assistant');
  if (lastAI) {
    await Stores.updateMessageNode(lastAI.id, { 
      content: lastAI.content,
    } as any);
  }
}
