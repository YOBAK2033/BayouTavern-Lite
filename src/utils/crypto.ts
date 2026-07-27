/** Browser-side encryption helpers for optional character packages. */

export interface EncryptedPackageEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  /** 新版游玩包使用应用内置密钥自动解包，不要求接收者输入密码。 */
  access?: 'password' | 'play-only';
}

const DEFAULT_ITERATIONS = 600_000;
const PLAYBACK_SECRET = 'BayouTavern-Lite-2.0-play-only-package-v1';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(value: unknown, password: string): Promise<EncryptedPackageEnvelope> {
  if (!password) throw new Error('加密密码不能为空。');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, DEFAULT_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, plaintext as unknown as BufferSource);
  return {
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: DEFAULT_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptJson(envelope: unknown, password: string): Promise<unknown> {
  if (!password) throw new Error('请输入加密角色卡包密码。');
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('加密包结构无效。');
  const value = envelope as Partial<EncryptedPackageEnvelope>;
  if (value.version !== 1 || value.algorithm !== 'AES-GCM' || value.kdf !== 'PBKDF2-SHA-256') throw new Error('不支持的加密包格式。');
  const iterations = Number(value.iterations);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 2_000_000) throw new Error('加密包参数无效。');
  try {
    const salt = base64ToBytes(String(value.salt));
    const iv = base64ToBytes(String(value.iv));
    const ciphertext = base64ToBytes(String(value.ciphertext));
    const key = await deriveKey(password, salt, iterations);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, key, ciphertext as unknown as BufferSource);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('密码错误或角色卡包已损坏。');
  }
}

export async function encryptPlayableJson(value: unknown): Promise<EncryptedPackageEnvelope> {
  return { ...(await encryptJson(value, PLAYBACK_SECRET)), access: 'play-only' };
}

export async function decryptPlayableJson(envelope: unknown): Promise<unknown> {
  return decryptJson(envelope, PLAYBACK_SECRET);
}
