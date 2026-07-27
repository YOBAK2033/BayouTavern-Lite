import { describe, expect, it } from 'vitest';
import { parseStatusBar } from './useChat';

const template = {
  fields: [
    { key: 'day', type: 'daycount', initial: 1 },
    { key: 'location', type: 'location', initial: '客厅' },
  ],
};

describe('parseStatusBar', () => {
  it('parses the original plain JSON final line', () => {
    const result = parseStatusBar('角色回复\n{"day":3,"location":"客厅"}', undefined, template);
    expect(result?.text).toBe('角色回复');
    expect(result?.snapshot.values.day).toBe(3);
    expect(result?.snapshot.textValues.location).toBe('客厅');
  });

  it('keeps compatibility with the explicit status marker', () => {
    const result = parseStatusBar('角色回复\n<!--STATUS-->{"day":4,"location":"门口"}', undefined, template);
    expect(result?.text).toBe('角色回复');
    expect(result?.snapshot.values.day).toBe(4);
    expect(result?.snapshot.textValues.location).toBe('门口');
  });

  it('applies dynamic group add, update and remove patches without deleting omitted members', () => {
    const dynamicTemplate = {
      fields: [{ key: 'day', type: 'daycount', initial: 1 }],
      dynamicGroups: [{
        id: 'companions', title: '同行角色', icon: '👥', maxInstances: 2,
        fields: [
          { key: 'trust', type: 'text' },
          { key: 'health', type: 'stat', max: 100 },
        ],
      }],
    };
    const added = parseStatusBar('回复\n{"global":{"day":2},"dynamic":{"companions":{"add":[{"id":"c1","name":"林雪","values":{"health":100},"textValues":{"trust":"正常"}}]}}}', undefined, dynamicTemplate);
    expect(added?.snapshot.dynamicGroups.companions[0].name).toBe('林雪');
    const updated = parseStatusBar('回复\n{"dynamic":{"companions":{"update":[{"id":"c1","set":{"trust":"亲密","health":90}}]}}}', added?.snapshot, dynamicTemplate);
    expect(updated?.snapshot.dynamicGroups.companions[0].textValues.trust).toBe('亲密');
    expect(updated?.snapshot.dynamicGroups.companions[0].values.health).toBe(90);
    const removed = parseStatusBar('回复\n{"dynamic":{"companions":{"remove":[{"id":"c1","reason":"死亡"}]}}}', updated?.snapshot, dynamicTemplate);
    expect(removed?.snapshot.dynamicGroups.companions[0].lifecycle).toBe('dead');
  });

  it('rounds configured one-decimal numeric fields', () => {
    const decimalTemplate = { fields: [{ key: 'count', type: 'counter', decimalPlaces: 1, max: 10 }] };
    const result = parseStatusBar('回复\n{"count":1.16}', undefined, decimalTemplate);
    expect(result?.snapshot.values.count).toBe(1.2);
  });
});
