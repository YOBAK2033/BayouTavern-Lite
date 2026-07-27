import { describe, expect, it } from 'vitest';
import { SSEParser } from './sse';

describe('SSEParser', () => {
  it('preserves split frames and flushes a final frame without a trailing newline', () => {
    const parser = new SSEParser();
    const encoder = new TextEncoder();
    expect(parser.parse(encoder.encode('data: {"choices":[{"delta":{"content":"你"}}]}\n\n'))).toEqual([
      { content: '你', reasoning: '', done: false },
    ]);
    expect(parser.parse(encoder.encode('data: {"choices":[{"delta":{"content":"好"}}]}'))).toEqual([]);
    expect(parser.finish()).toEqual([{ content: '好', reasoning: '', done: false }]);
  });
});
