import type { SSEChunk } from '../types';

export class SSEParser {
  private buffer = '';
  private decoder = new TextDecoder();
  private tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;

  private consume(flush = false): SSEChunk[] {
    const chunks: SSEChunk[] = [];
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = flush ? '' : (lines.pop() || '');
    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') {
        if (trimmed === 'data: [DONE]') chunks.push({ content: '', reasoning: '', done: true });
        return;
      }
      if (!trimmed.startsWith('data:')) return;
      try {
        const json = JSON.parse(trimmed.slice(5).trim());
        const delta = json.choices?.[0]?.delta;
        const content = delta?.content || json.choices?.[0]?.text || '';
        const reasoning = delta?.reasoning_content || '';
        if (content || reasoning) chunks.push({ content, reasoning, done: false });
        if (json.usage) this.tokenUsage = json.usage;
        if (json.choices?.[0]?.finish_reason) chunks.push({ content: '', reasoning: '', done: true });
      } catch { /* Ignore provider keep-alives and malformed chunks. */ }
    };
    for (const line of lines) processLine(line);
    if (flush && this.buffer.trim()) processLine(this.buffer);
    return chunks;
  }

  parse(data: Uint8Array): SSEChunk[] {
    this.buffer += this.decoder.decode(data, { stream: true });
    return this.consume();
  }

  finish(): SSEChunk[] {
    this.buffer += this.decoder.decode();
    return this.consume(true);
  }

  getTokenUsage() { return this.tokenUsage; }

  reset() {
    this.buffer = '';
    this.decoder = new TextDecoder();
    this.tokenUsage = null;
  }
}
