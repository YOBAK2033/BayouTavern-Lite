/** Browser storage can be unavailable in private or quota-restricted contexts. */
export function safeGetLocalStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function safeSetLocalStorage(key: string, value: string): boolean {
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}

export function safeRemoveLocalStorage(key: string): boolean {
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}

export function safeListLocalStorage(prefix = ''): Record<string, string> {
  try {
    const entries: Record<string, string> = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || (prefix && !key.startsWith(prefix))) continue;
      const value = window.localStorage.getItem(key);
      if (value !== null) entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
}
