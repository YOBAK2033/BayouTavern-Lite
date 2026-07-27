import { describe, expect, it } from 'vitest';
import { decryptJson, decryptPlayableJson, encryptJson, encryptPlayableJson } from './crypto';

describe('optional character package encryption', () => {
  it('round-trips JSON with AES-GCM and rejects a wrong password', async () => {
    const input = { name: 'protected-card', prompt: 'private rules', values: [1, 2, 3] };
    const envelope = await encryptJson(input, 'a-long-test-password');
    expect(envelope.algorithm).toBe('AES-GCM');
    expect(envelope.ciphertext).not.toContain('private rules');
    await expect(decryptJson(envelope, 'wrong-password')).rejects.toThrow('密码错误');
    await expect(decryptJson(envelope, 'a-long-test-password')).resolves.toEqual(input);
  });

  it('supports passwordless play-only packages while keeping the content opaque', async () => {
    const input = { systemPrompt: 'private play rules' };
    const envelope = await encryptPlayableJson(input);
    expect(envelope.access).toBe('play-only');
    await expect(decryptPlayableJson(envelope)).resolves.toEqual(input);
  });
});
