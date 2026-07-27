import type { StatusBarField, StatusBarSnapshot, StatusBarTemplate } from '../types';

export const STATUS_TEXT_FIELD_TYPES = new Set([
  'date', 'weekday', 'location', 'text', 'fixedText', 'select',
]);

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function isStatusTextField(field: StatusBarField): boolean {
  return STATUS_TEXT_FIELD_TYPES.has(field.type);
}

export function getStatusFieldKeys(template: StatusBarTemplate): string[] {
  // These fields are derived locally. Asking the model to repeat them creates
  // needless conflicts with the day counter and makes partial JSON updates
  // more fragile.
  return template.fields
    .filter((field) => field.type !== 'achievement' && field.type !== 'date' && field.type !== 'weekday' && field.type !== 'fixedText')
    .map((field) => field.key);
}

export function createInitialStatusSnapshot(template: StatusBarTemplate): StatusBarSnapshot {
  const snapshot: StatusBarSnapshot = { values: {}, textValues: {}, dynamicGroups: {} };
  for (const field of template.fields) {
    if (field.type === 'achievement') continue;
    if (isStatusTextField(field)) {
      snapshot.textValues[field.key] = field.initialText ?? '';
    } else {
      snapshot.values[field.key] = Number(field.initial ?? 0);
      if (field.type === 'period') snapshot.values[field.key + '_round'] = 0;
    }
  }
  for (const group of template.dynamicGroups || []) snapshot.dynamicGroups![group.id] = [];
  return applyLinkedStatusFields(template, snapshot);
}

function parseDate(value: string | undefined): { year: number; month: number; day: number } | null {
  const raw = String(value || '').trim().replace(/[年/]/g, '.').replace(/月/g, '.').replace(/日/g, '');
  const parts = raw.split(/[.\-\s]+/).filter(Boolean).map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) {
    const [year, month, day] = parts;
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }
  if (parts.length === 2) {
    const [month, day] = parts;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year: new Date().getFullYear(), month, day };
  }
  return null;
}

function formatDate(value: { year: number; month: number; day: number }, format: 'ymd' | 'md'): string {
  const month = String(value.month).padStart(2, '0');
  const day = String(value.day).padStart(2, '0');
  return format === 'ymd' ? `${value.year}.${month}.${day}` : `${month}.${day}`;
}

function addDays(value: { year: number; month: number; day: number }, offset: number): { year: number; month: number; day: number } {
  const date = new Date(value.year, value.month - 1, value.day);
  date.setDate(date.getDate() + offset);
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function weekdayIndex(value: string | undefined): number {
  const normalized = String(value || '').replace('星期', '周').trim();
  const index = WEEKDAYS.indexOf(normalized);
  if (index >= 0) return index;
  const numeric = Number(normalized.replace('周', ''));
  return numeric >= 1 && numeric <= 7 ? numeric - 1 : 0;
}

export function applyLinkedStatusFields(template: StatusBarTemplate, source: StatusBarSnapshot): StatusBarSnapshot {
  const snapshot: StatusBarSnapshot = {
    values: { ...(source?.values || {}) },
    textValues: { ...(source?.textValues || {}) },
    dynamicGroups: Object.fromEntries(Object.entries(source?.dynamicGroups || {}).map(([groupId, instances]) => [groupId, (instances as any[]).map((instance) => ({
      ...instance,
      values: { ...(instance.values || {}) },
      textValues: { ...(instance.textValues || {}) },
    }))])),
  };
  for (const group of template.dynamicGroups || []) {
    if (!snapshot.dynamicGroups?.[group.id]) snapshot.dynamicGroups![group.id] = [];
  }
  const dayField = template.fields.find((field) => field.type === 'daycount');
  if (!dayField) return snapshot;

  const day = Number(snapshot.values[dayField.key] ?? dayField.initial ?? 1);
  const baseDay = Number(dayField.initial ?? 1);
  const offset = Number.isFinite(day) ? day - baseDay : 0;
  for (const field of template.fields) {
    if (field.type === 'date') {
      const base = parseDate(field.initialText);
      if (base) snapshot.textValues[field.key] = formatDate(addDays(base, offset), field.dateFormat || 'ymd');
    } else if (field.type === 'weekday') {
      const index = (weekdayIndex(field.initialText) + offset) % WEEKDAYS.length;
      snapshot.textValues[field.key] = WEEKDAYS[(index + WEEKDAYS.length) % WEEKDAYS.length];
    }
  }
  return snapshot;
}

export function isAchievementUnlocked(field: StatusBarField, snapshot: StatusBarSnapshot): boolean {
  if (field.type !== 'achievement' || !field.achievementTargetKey) return false;
  const raw = snapshot.values[field.achievementTargetKey] ?? snapshot.textValues[field.achievementTargetKey];
  if (raw === undefined || raw === null) return false;
  const expected = field.achievementValue ?? '';
  switch (field.achievementOperator || 'eq') {
    case 'gte': return Number(raw) >= Number(expected);
    case 'lte': return Number(raw) <= Number(expected);
    case 'contains': return String(raw).includes(String(expected));
    case 'eq': return String(raw) === String(expected);
    default: return false;
  }
}
