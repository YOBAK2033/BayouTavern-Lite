export function modelsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith('/models') ? normalized : `${normalized}/models`;
}

export async function fetchAvailableModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<string[]> {
  if (!baseUrl.trim()) throw new Error('请先填写 Base URL。');
  if (!apiKey.trim()) throw new Error('请先填写 API Key。');

  const response = await fetch(modelsEndpoint(baseUrl), {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    signal,
  });
  let payload: any = null;
  try { payload = await response.json(); } catch { /* non-JSON error response */ }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(`模型列表请求失败：${detail}`);
  }

  const entries = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  const names: string[] = entries
    .map((item: any) => typeof item === 'string' ? item : item?.id)
    .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
  return Array.from(new Set<string>(names));
}
