import { describe, expect, it } from 'vitest';
import { generateStatusPrompt } from './StatusBarBuilder';

describe('status bar system prompt generator', () => {
  it('describes configured fixed fields instead of hard-coded preset fields', () => {
    const prompt = generateStatusPrompt([
      { key: 'weather', label: '天气', icon: '🌤️', color: '#999', type: 'text', max: 0, initial: 0, barStyle: 'solid', showNumber: false },
    ], []);
    expect(prompt).toContain('weather');
    expect(prompt).toContain('不要自行增加字段');
    expect(prompt).toContain('JSON');
    expect(prompt).not.toContain('【动态角色组】');
  });

  it('adds dynamic group lifecycle rules and operation example', () => {
    const prompt = generateStatusPrompt([], [{
      id: 'companions', title: '同行角色', icon: '👥', maxInstances: 2,
      fields: [{ key: 'trust', label: '信任', icon: '🤝', color: '#999', type: 'text', max: 0, initial: 0, barStyle: 'solid', showNumber: false }],
    }]);
    expect(prompt).toContain('companions');
    expect(prompt).toContain('add');
    expect(prompt).toContain('update');
    expect(prompt).toContain('remove');
    expect(prompt).toContain('暂时离开现场');
  });

  it('describes dynamic enum and numeric schemas in the generated prompt', () => {
    const prompt = generateStatusPrompt([], [{
      id: 'party', title: '队友', icon: '👥', maxInstances: 3,
      fields: [
        { key: 'trust', label: '信任', icon: '🤝', color: '#999', type: 'select', options: ['亲密', '正常'], max: 0, initial: 0, barStyle: 'solid', showNumber: false },
        { key: 'health', label: '健康', icon: '❤️', color: '#f00', type: 'stat', max: 100, initial: 100, barStyle: 'solid', showNumber: true },
      ],
    }]);
    expect(prompt).toContain('亲密、正常');
    expect(prompt).toContain('textValues');
    expect(prompt).toContain('health');
  });
});
