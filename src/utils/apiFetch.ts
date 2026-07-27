let lowRateMode = false;

export function setLowRateMode(enabled: boolean) {
  lowRateMode = enabled;
}

/** 包装 fetch，lowRate 模式下自动 429 重试 */
export async function apiFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const maxRetries = lowRateMode ? 3 : 1;
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(url, options);
      if (resp.status === 429 && i < maxRetries - 1) {
        // 限速：等待后重试
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return resp;
    } catch (e) {
      lastError = e;
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}
