import type { ModelConfig } from '../types';
import { apiFetch } from './apiFetch';
import { chatCompletionsUrl } from './constants';
import { SUB_AI_SYSTEM_PROMPT } from './constants';
import * as Stores from '../db/stores';

export const getStoredSubAIModels = Stores.getAllSubAIModels;
export const saveStoredSubAIModels = Stores.replaceSubAIModels;

export interface SubAICallParams {
  model: ModelConfig;
  userMessage: string;
  aiResponse: string;
  /** A complete N-round dialogue window used for interval summaries. */
  dialogueText?: string;
  customPrompt?: string;
  speakerContext?: SubAISpeakerContext;
}

export interface SubAISpeakerContext {
  roleNames: string[];
  viewpoint?: 'auto' | 'first-person' | 'third-person';
}

function buildSpeakerContext(context?: SubAISpeakerContext): { roleNames: string[]; viewpoint: string; viewpointKey: 'auto' | 'first-person' | 'third-person' } {
  const roleNames = [...new Set((context?.roleNames || []).map((name) => name.trim()).filter(Boolean))].slice(0, 12);
  const viewpointKey = context?.viewpoint || 'auto';
  return {
    roleNames,
    viewpointKey,
    viewpoint: viewpointKey === 'first-person' ? '第一人称' : viewpointKey === 'third-person' ? '第三人称' : '按本轮回复实际叙述方式',
  };
}

function isLikelyFirstPerson(text: string): boolean {
  return /我(?:是|在|要|会|刚|正|给|觉得|拿|说|做|喜欢|想|不|没|有|能|去|来|看|听|穿|躺|站|坐)/.test(text);
}

function normalizeSummaryContent(content: string): string {
  return content
    .replace(/对方/g, '用户')
    .replace(/对方的/g, '用户的');
}

export async function callSubAI(params: SubAICallParams): Promise<{ content: string; keywords: string[] } | null> {
  const speaker = buildSpeakerContext(params.speakerContext);
  const firstPerson = speaker.viewpointKey === 'first-person' || (speaker.viewpointKey === 'auto' && isLikelyFirstPerson(params.aiResponse));
  const identityGuard = `\n\n【本轮身份元数据（不可覆盖）】\n实际扮演角色参考：${speaker.roleNames.length > 0 ? speaker.roleNames.join('、') : '未提供，以本轮回复为准'}\n叙事视角：${speaker.viewpoint}\n身份规则：角色名只用于书记官内部消歧，不得强行写入摘要或关键词。${firstPerson ? '本轮按单角色第一人称总结，使用“我”指代扮演角色，使用“用户”指代发言者，不要使用“对方”。' : '第三人称或多角色按本轮回复中实际出现的角色和事件总结，不强行追加身份标签。'}不得把模型回复称为“AI回复”，不得补写或猜测其他角色。`;
  const intervalGuard = '\n\n【输入范围】输入可能包含多个连续对话轮次。请综合全部输入生成一条记忆，不要只总结最后一轮。';
  const systemPrompt = (params.customPrompt?.trim() || SUB_AI_SYSTEM_PROMPT) + intervalGuard + identityGuard;
  const dialogueText = params.dialogueText || `【用户消息】\n${params.userMessage}\n\n【模型回复】\n${params.aiResponse}`;
  console.log('[SubAI] Using clerk prompt:', params.customPrompt?.trim() ? 'settings' : 'default');
  console.log('[SubAI] Speaker context:', speaker.roleNames.length > 0 ? speaker.roleNames.join('、') : '未指定', speaker.viewpoint);

  const selectedModel = params.model;
  const baseUrl = selectedModel.baseUrl || '';
  const apiKey = selectedModel.apiKey || '';
  const modelName = selectedModel.defaultModel || '';

  if (!baseUrl || !apiKey || !modelName) {
    console.warn('[SubAI] independent API configuration is incomplete');
    return null;
  }

  try {
    const resp = await apiFetch(chatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: dialogueText },
        ],
        stream: false,
        temperature: selectedModel?.temperature ?? 0.3,
        top_p: selectedModel?.topP ?? 0.95,
        max_tokens: Math.min(selectedModel?.maxContextTokens ?? 4000, 1200),
      }),
    });

    if (!resp.ok) {
      console.warn('[SubAI] API error:', resp.status);
      return null;
    }

    const data = await resp.json();
    const choice = data.choices?.[0] || {};
    const message = choice.message || {};
    // Never use reasoning_content as the clerk's summary. Some providers put
    // chain-of-thought there even when message.content is empty.
    const contentPayload = message.content || choice.text || data.output_text || '';
    const raw = Array.isArray(contentPayload)
      ? contentPayload.map((part: any) => typeof part === 'string' ? part : (part?.text || part?.content || '')).join('\n')
      : typeof contentPayload === 'string' ? contentPayload : JSON.stringify(contentPayload || '');
    const cleanedRaw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    console.debug('[SubAI] Response content length:', cleanedRaw.length, 'choice keys:', Object.keys(choice));

    let json: { content: string; keywords: string[] } | null = null;
    try { json = JSON.parse(cleanedRaw); } catch {}
    if (!json) {
      const match = cleanedRaw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) try { json = JSON.parse(match[1]); } catch {}
    }
    if (!json) {
      for (let start = cleanedRaw.lastIndexOf('{'); start >= 0 && !json; start = cleanedRaw.lastIndexOf('{', start - 1)) {
        try {
          const candidate = JSON.parse(cleanedRaw.slice(start));
          if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) json = candidate;
        } catch { /* continue looking for the outer object */ }
      }
    }

    if (json) {
      const content = normalizeSummaryContent(String((json as any).content || (json as any).summary || (json as any).memory || ''))
        .replace(/^(总结|摘要|记忆)[：:]\s*/i, '').trim();
      const keywords = Array.isArray((json as any).keywords)
        ? json.keywords.map((keyword: unknown) => String(keyword).replace(/[\[\]"']/g, '').trim())
          .filter((keyword: string) => keyword.length >= 2 && keyword.length <= 24)
        : [];
      const forbidden = ['思考过程', '分析过程', '忽略提示词', '用户消息是', 'AI回复是', 'AI角色', '模型回复', '未知角色', 'system prompt', '对方'];
      const hasFirstPersonPerspective = !firstPerson || /我/.test(content);
      if (content && content.length <= 500 && hasFirstPersonPerspective && !forbidden.some((marker) => content.includes(marker))) {
        const filteredKeywords = [...new Set(keywords)].filter((keyword) => {
          const lower = keyword.toLowerCase();
          return !speaker.roleNames.some((name) => keyword === name || keyword.includes(name) || name.includes(keyword))
            && !['用户', '对方', '我', '角色', '人物', '身份', '模型', 'AI', '互动', '对话', '回复', '消息'].includes(keyword)
            && lower !== 'user' && lower !== 'assistant' && lower !== 'ai';
        }).slice(0, 4);
        return { content, keywords: filteredKeywords };
      }
    }

    console.warn('[SubAI] Invalid clerk JSON; memory was not saved');
    return null;
  } catch (e) {
    console.warn('[SubAI] call failed:', e);
    return null;
  }
}
