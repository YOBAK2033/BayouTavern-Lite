/** 生成标准 UUID v4 */
export function generateId(): string {
  return crypto.randomUUID();
}
