import { describe, expect, it } from 'vitest';
import type { StatusBarTemplate } from '../types';
import { applyLinkedStatusFields, createInitialStatusSnapshot, getStatusFieldKeys, isAchievementUnlocked } from './statusBar';

const template: StatusBarTemplate = {
  version: 5,
  fields: [
    { key: 'day', label: '天数', icon: '📅', color: '#999', type: 'daycount', max: 0, initial: 1, barStyle: 'solid', showNumber: true },
    { key: 'date', label: '日期', icon: '📆', color: '#999', type: 'date', max: 0, initial: 0, initialText: '2026.06.12', dateFormat: 'md', barStyle: 'solid', showNumber: false },
    { key: 'weekday', label: '星期', icon: '📋', color: '#999', type: 'weekday', max: 0, initial: 0, initialText: '周二', barStyle: 'solid', showNumber: false },
    { key: 'affection', label: '好感', icon: '❤️', color: '#f00', type: 'stat', max: 100, initial: 10, barStyle: 'solid', showNumber: true },
    { key: 'married', label: '结婚', icon: '👰', color: '#f00', type: 'achievement', max: 0, initial: 0, barStyle: 'solid', showNumber: false, characterGroup: '角色A', achievementTargetKey: 'affection', achievementOperator: 'gte', achievementValue: 100 },
  ],
  style: { background: 'transparent', borderColor: '#ddd', borderRadius: 8, title: '状态', columns: 3 },
};

describe('status bar linked fields', () => {
  it('derives date and weekday from the day counter', () => {
    const initial = createInitialStatusSnapshot(template);
    expect(initial.textValues.date).toBe('06.12');
    expect(initial.textValues.weekday).toBe('周二');
    const next = applyLinkedStatusFields(template, { values: { ...initial.values, day: 2 }, textValues: initial.textValues });
    expect(next.textValues.date).toBe('06.13');
    expect(next.textValues.weekday).toBe('周三');
  });

  it('evaluates achievement conditions without a model-generated icon field', () => {
    const achievement = template.fields.find((field) => field.type === 'achievement')!;
    expect(isAchievementUnlocked(achievement, { values: { affection: 99 }, textValues: {} })).toBe(false);
    expect(isAchievementUnlocked(achievement, { values: { affection: 100 }, textValues: {} })).toBe(true);
  });

  it('does not require derived date or weekday in model JSON', () => {
    expect(getStatusFieldKeys(template)).toEqual(['day', 'affection']);
  });
});
