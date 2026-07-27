import React from 'react';
import type { StatusBarField, StatusBarSnapshot, StatusBarTemplate } from '../../types';
import { isAchievementUnlocked } from '../../utils/statusBar';

interface Props { template: StatusBarTemplate | undefined; snapshot: StatusBarSnapshot | undefined; isDark: boolean; }
const PERIODS = ['清晨', '上午', '午后', '深夜'];

export function StatusBarCard({ template, snapshot, isDark }: Props) {
  if (!template || !snapshot || (template.fields.length === 0 && !(template.dynamicGroups || []).length)) return null;
  const style = template.style;
  const columns = style.columns || 3;
  const variant = style.variant || 'default';
  const darkPanel = (isDark && variant !== 'white' && variant !== 'paper') || variant === 'black' || variant === 'neon';
  const fields = template.fields.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const seenGroups = new Set<string>();

  const renderField = (field: StatusBarField, source: { values?: Record<string, number>; textValues?: Record<string, string> }, key: string) => {
    const value = source.values?.[field.key];
    const textValue = source.textValues?.[field.key];
    const gridStyle = { gridColumn: `span ${field.span || 1}`, minWidth: 0 };
    const textStyle = { fontSize: '10px', color: darkPanel ? '#ddd' : '#555', display: 'flex', gap: '4px', alignItems: 'center' as const, overflowWrap: 'anywhere' as const, ...gridStyle };
    if (field.type === 'date' || field.type === 'weekday') return <div key={key} style={textStyle}><span>{field.icon}</span><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{textValue || '————'}</span></div>;
    if (field.type === 'daycount') return <div key={key} style={textStyle}><span>{field.icon}</span><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>第{value || 1}天</span></div>;
    if (field.type === 'period') {
      const period = PERIODS[Math.min(value || 0, PERIODS.length - 1)];
      const round = source.values?.[field.key + '_round'] || 0;
      return <div key={key} style={textStyle}><span>{field.icon}</span><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{period}{field.showRound !== false && round > 0 ? ` · ${String(round).padStart(2, '0')}` : ''}</span></div>;
    }
    if (field.type === 'location') return <div key={key} style={textStyle}><span>{field.icon}</span><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{textValue || '——'}</span></div>;
    if (field.type === 'counter') return <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', ...gridStyle }}><span style={{ fontSize: '10px', color: darkPanel ? '#999' : '#888', minWidth: 0, overflowWrap: 'anywhere' }}>{field.icon} {field.label}</span><span style={{ fontSize: '12px', fontWeight: 600, color: field.color, flexShrink: 0 }}>×{value ?? 0}</span></div>;
    if (field.type === 'text' || field.type === 'fixedText' || field.type === 'select') return <div key={key} style={textStyle}><span>{field.icon}</span><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{textValue || field.options?.[0] || '—'}</span></div>;
    if (field.type === 'achievement') return null;
    if (field.type === 'ratio') return <div key={key} style={textStyle}><span>{field.icon}</span><span>{field.label} {value ?? 0}/{field.max}</span></div>;
    const percent = value === undefined ? 0 : Math.min(100, Math.max(0, (value / field.max) * 100));
    const segmented = field.max <= 10;
    return <div key={key} style={gridStyle}>
      <div style={{ fontSize: '9px', display: 'flex', justifyContent: 'space-between', color: darkPanel ? '#999' : '#888', marginBottom: '1px' }}><span>{field.icon} {field.label}</span>{field.showNumber && <span>{value ?? '—'}/{field.max}</span>}</div>
      <div style={{ height: segmented ? '8px' : '5px', borderRadius: '3px', background: darkPanel ? '#444' : '#eee', overflow: 'hidden', display: 'flex', gap: segmented ? '2px' : '0' }}>
        {segmented ? Array.from({ length: field.max }).map((_, index) => <div key={index} style={{ flex: 1, height: '100%', borderRadius: '2px', background: (value || 0) > index ? field.color : 'transparent', border: `1px solid ${darkPanel ? '#555' : '#ddd'}` }} />) : <div style={{ height: '100%', width: `${percent}%`, background: field.barStyle === 'gradient' ? `linear-gradient(90deg,${field.color},${field.color}66)` : field.color, borderRadius: '3px', transition: 'width .3s ease' }} />}
      </div>
    </div>;
  };

  const panelStyle: React.CSSProperties = {
    background: style.background || (darkPanel ? '#1e1e1e' : '#fafafa'),
    borderColor: style.borderColor || (darkPanel ? '#333' : '#e8e8e8'),
    borderRadius: `${style.borderRadius || 8}px`, borderWidth: variant === 'borderless' ? 0 : 1, borderStyle: 'solid',
    padding: variant === 'compact' ? '5px 7px' : '8px 10px', marginTop: '4px', width: 'fit-content', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', overflowWrap: 'anywhere',
  };
  if (variant === 'white') { panelStyle.background = '#fff'; panelStyle.borderColor = '#ddd'; }
  if (variant === 'black') { panelStyle.background = '#111'; panelStyle.borderColor = '#333'; panelStyle.boxShadow = '0 4px 18px rgba(0,0,0,.28)'; }
  if (variant === 'glass') { panelStyle.background = darkPanel ? 'rgba(30,30,30,.84)' : 'rgba(255,255,255,.82)'; panelStyle.backdropFilter = 'blur(12px)'; panelStyle.borderColor = darkPanel ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.12)'; panelStyle.boxShadow = '0 8px 24px rgba(0,0,0,.12)'; }
  if (variant === 'neon') { panelStyle.background = '#10141f'; panelStyle.borderColor = '#38bdf8'; panelStyle.boxShadow = '0 0 0 1px rgba(56,189,248,.25),0 0 18px rgba(56,189,248,.18)'; }
  if (variant === 'paper') { panelStyle.background = '#fffaf0'; panelStyle.borderColor = '#e6d5b8'; panelStyle.boxShadow = '0 3px 10px rgba(120,80,20,.08)'; }

  return <div style={panelStyle}>
    {!style.hideTitle && style.title && <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '5px', color: darkPanel ? '#ccc' : '#555' }}>{style.title}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '4px', alignItems: 'start', minWidth: 0 }}>
      {fields.map((field) => {
        const firstInGroup = field.characterGroup && !seenGroups.has(field.characterGroup);
        if (field.characterGroup) seenGroups.add(field.characterGroup);
        const achievementIcons = field.characterGroup ? fields.filter((candidate) => candidate.type === 'achievement' && candidate.characterGroup === field.characterGroup && isAchievementUnlocked(candidate, snapshot)).map((candidate) => candidate.icon).join('') : '';
        return <React.Fragment key={field.key}>{firstInGroup && <div style={{ fontSize: '10px', fontWeight: 600, color: darkPanel ? '#aaa' : '#777', marginTop: '3px', marginBottom: '1px', borderBottom: `1px solid ${darkPanel ? '#333' : '#eee'}`, paddingBottom: '2px', gridColumn: '1/-1' }}>👩 {field.characterGroup}{achievementIcons}</div>}{renderField(field, snapshot, field.key)}</React.Fragment>;
      })}
    </div>
    {(template.dynamicGroups || []).map((group) => {
      const active = (snapshot.dynamicGroups?.[group.id] || []).filter((instance) => (instance.lifecycle || 'active') === 'active');
      if (active.length === 0) return null;
      return <section key={group.id} style={{ marginTop: '5px', paddingTop: '4px', borderTop: `1px solid ${darkPanel ? '#333' : '#eee'}` }}>
        {group.showTitle !== false && <div style={{ fontSize: '10px', fontWeight: 600, color: darkPanel ? '#aaa' : '#777', marginBottom: '3px' }}>{group.icon} {group.title}（{active.length}）</div>}
        {active.map((instance) => {
          const instanceSnapshot = { values: instance.values || {}, textValues: instance.textValues || {} };
          const instanceFields = group.fields.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
          const achievementIcons = instanceFields.filter((field) => field.type === 'achievement' && isAchievementUnlocked(field, instanceSnapshot)).map((field) => field.icon).join('');
          return <div key={instance.id} style={{ marginBottom: '4px', padding: '4px 5px', borderRadius: '5px', background: darkPanel ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.025)' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: darkPanel ? '#ddd' : '#555', marginBottom: '2px' }}>{instance.icon || group.icon} {instance.name || '未命名角色'}{achievementIcons}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '4px', minWidth: 0 }}>{instanceFields.map((field) => renderField(field, instanceSnapshot, `${instance.id}_${field.key}`))}</div>
          </div>;
        })}
      </section>;
    })}
  </div>;
}
