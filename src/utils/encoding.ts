/** 粗略 Token 估算：字符数 × 0.5 */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length * 0.5);
}

/** 去除 thinking / reasoning 内容块 */
export function stripReasoningBlocks(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/```reasoning[\s\S]*?```/gi, '')
    .trim();
}
