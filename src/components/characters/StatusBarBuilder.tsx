import React, { useState } from 'react';
import { useApp } from '../../hooks/useApp';
import type { DynamicStatusGroup, StatusBarField, StatusBarTemplate } from '../../types';
import { DEFAULT_STATUS_BAR_TEMPLATES } from '../../utils/constants';
import { useCharacters } from '../../hooks/useCharacters';
import * as Stores from '../../db/stores';
import { applyLinkedStatusFields, createInitialStatusSnapshot, isAchievementUnlocked } from '../../utils/statusBar';

interface Props {
  template: StatusBarTemplate | undefined;
  templateName?: string;
  onSave: (tpl: StatusBarTemplate, templateName: string) => void;
}
var E = ['👩','👩‍🦰','👩‍🦳','👱‍♀️','👩🏻','👩🏻‍🦰','👩🏻‍🦳','👱🏻‍♀️','👩🏼‍🦰','👩🏼','👩🏼‍🦳','👩🏽','🤴','🧟‍♀️','👤','👥','😶','🙂','😊','😘','😍','😖','🤬','🥵','👔','👗','📅','📆','📋','📊','🌍','🗺️','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','💖','🍖','🌭','🍫','💧','💊','📦','🧰','🚨','🧠','👅','👄','☣️','🔥','👁️','⛔','🚫','⚠️','💰','💵','💳','💞','👰','💕','💋','💎','💍','💌','🔐','🍻','⏳','😈','💀','🔞','🗝️','⚡','🎯','❓','🌓','🤝','💥','💦','🍆','🏳️','🔋','💾','🖨️','📖','📔','📘','🏷️','📒','💼','📌','🗃️','⚔️','🔫','🏹','💣','🛡️','⚙️','🧬','🔬','📡','🌅','☀️','🌈','🛵','🚗','🚐','🚀','🛸','✈️','⏰','👣','✨','🎁','🏆','👑'];
var PRESET_KEYS = ['single','multi','dynamic-multi'];
var PRESET_LABELS:any = {single:'单人',multi:'多人', 'dynamic-multi':'动态多人'};

function getTemplates(){try{var r=localStorage.getItem('jg2_sbtpl');var parsed=r?JSON.parse(r):{};if(parsed&&typeof parsed==='object')delete parsed.adventure;return parsed;}catch(e){return{};}}
function saveTemplates(t:any){try{localStorage.setItem('jg2_sbtpl',JSON.stringify(t));}catch(e){}}
function nextFieldKey(prefix:string, fields:any[]):string{var i=1;var used=new Set((fields||[]).map(function(field:any){return field.key;}));while(used.has(prefix+'_'+i))i++;return prefix+'_'+i;}

const BLANK_STYLE = {
  background: 'transparent',
  borderColor: '#e0e0e0',
  borderRadius: 8,
  title: '状态面板',
  columns: 3,
  hideTitle: false,
  variant: 'default',
};

function statusFieldInstruction(field: StatusBarField): string {
  const group = field.characterGroup ? `[固定角色组：${field.characterGroup}] ` : '';
  if (field.type === 'date') return `- ${group}${field.key}（${field.label}）：日期，初始值 ${field.initialText || '2026.06.12'}，显示格式 ${field.dateFormat === 'md' ? '月日' : '年月日'}，由天数自动联动。`;
  if (field.type === 'weekday') return `- ${group}${field.key}（${field.label}）：星期，初始值 ${field.initialText || '周一'}，由天数自动联动。`;
  if (field.type === 'daycount') return `- ${group}${field.key}（${field.label}）：天数，从 ${field.initial || 1} 开始递增。`;
  if (field.type === 'period') return `- ${group}${field.key}（${field.label}）：时段，每 ${field.periodRounds || 9} 轮切换${field.showRound === false ? '，不显示轮次' : '，显示轮次'}。`;
  if (field.type === 'location') return `- ${group}${field.key}（${field.label}）：地点文本。`;
  if (field.type === 'ratio') return `- ${group}${field.key}（${field.label}）：比例数值，范围 0-${field.max}，显示为 X/X。`;
  if (field.type === 'counter') return `- ${group}${field.key}（${field.label}）：累积计数，范围 ${field.max ? `0-${field.max}` : '不限'}，初始值 ${field.initial || 0}${field.decimalPlaces === 1 ? '，允许 1 位小数' : ''}。`;
  if (field.type === 'fixedText') return `- ${group}${field.key}（${field.label}）：固定文本，不由模型修改。`;
  if (field.type === 'achievement') return `- ${group}${field.key}（${field.label}）：由网页根据 ${field.achievementTargetKey || '条件字段'} ${field.achievementOperator || 'eq'} ${String(field.achievementValue ?? '')} 自动判断，模型不要输出。`;
  if (field.type === 'select') return `- ${group}${field.key}（${field.label}）：枚举文本，只能从以下选项中选择：${(field.options || []).join('、') || '未配置选项'}。`;
  if (field.type === 'stat') return `- ${group}${field.key}（${field.label}）：数值进度，范围 0-${field.max}，初始值 ${field.initial || 0}。`;
  return `- ${group}${field.key}（${field.label}）：文本。`;
}

function statusFieldExampleValue(field: StatusBarField): string | number {
  if (['location', 'text', 'select'].includes(field.type)) return field.initialText || field.options?.[0] || '示例值';
  return field.initial ?? 0;
}

export function generateStatusPrompt(fields: StatusBarField[], dynamicGroups: DynamicStatusGroup[]): string {
  const sortedFields = fields.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const editableFields = sortedFields.filter((field) => !['achievement', 'date', 'weekday', 'fixedText'].includes(field.type));
  const fixedLines = sortedFields.map(statusFieldInstruction);
  const dynamicLines = dynamicGroups.map((group) => {
    const groupFields = group.fields.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(statusFieldInstruction).join('\n');
    return `- 组 ID：${group.id}\n  显示标题：${group.title}\n  最大实例数：${group.maxInstances || '不限制'}\n  实例字段：\n${groupFields || '  （当前组还没有配置字段）'}`;
  }).join('\n\n');
  const exampleValues = Object.fromEntries(editableFields.map((field) => [field.key, statusFieldExampleValue(field)]));
  const dynamicExample = Object.fromEntries(dynamicGroups.map((group) => {
    const groupFields = group.fields || [];
    const values = Object.fromEntries(groupFields.filter((field) => !['date', 'weekday', 'fixedText', 'text', 'location', 'select'].includes(field.type)).map((field) => [field.key, statusFieldExampleValue(field)]));
    const textValues = Object.fromEntries(groupFields.filter((field) => ['date', 'weekday', 'fixedText', 'text', 'location', 'select'].includes(field.type)).map((field) => [field.key, statusFieldExampleValue(field)]));
    return [group.id, { active: [{ id: 'instance-id', name: '示例角色', icon: '💌', values, textValues }], add: [], update: [], remove: [] }];
  }));
  const example = dynamicGroups.length
    ? JSON.stringify({ global: exampleValues, dynamic: dynamicExample })
    : JSON.stringify(exampleValues);
  const dynamicSection = dynamicGroups.length ? `\n\n【动态角色组】\n${dynamicLines}` : '';
  const rules = dynamicGroups.length
    ? '1. 回复正文结束后另起最后一行输出一个 JSON 对象；不需要 Markdown 代码块，也不需要输出 <!--STATUS--> 标记。\n2. 未变化的固定字段照抄当前值；日期、星期、成就图标由网页自动计算，不要输出。\n3. 如果配置了动态角色组，固定字段放在 global 中，动态组放在 dynamic 中。没有动态变化时不要改动 dynamic。\n4. 动态角色只有实际加入、死亡、离队、叛变或被驱逐时才新增或移除。暂时离开现场、没有参与本轮互动或没有发言，都不能移除。\n5. add 用于实际加入的新实例；update 用于已有实例的字段变化；remove 只用于明确离场的已有实例。update/remove 必须使用当前状态中的实例 id。\n6. 动态组字段必须严格使用配置中的 key、类型和范围；不要用姓名替代实例 id。\n7. 如果模型无法确定状态变化，保持原值，不要猜测或删除。'
    : '1. 回复正文结束后另起最后一行输出一个 JSON 对象；不需要 Markdown 代码块，也不需要输出 <!--STATUS--> 标记。\n2. 未变化的字段照抄当前值；日期、星期、成就图标由网页自动计算，不要输出。\n3. JSON 只能使用上面列出的固定字段，不要自行增加字段。\n4. 如果模型无法确定状态变化，保持原值，不要猜测或删除。';
  return `<state_tracking>\n你需要维护网页状态栏。状态栏配置是唯一数据 schema，只能使用下面列出的字段${dynamicGroups.length ? '和动态组' : ''}，不要自行增加字段。\n\n【固定字段】\n${fixedLines.length ? fixedLines.join('\n') : '（当前状态栏没有配置固定字段；不要自行创建状态字段。）'}${dynamicSection}\n\n【更新规则】\n${rules}\n\n【输出示例】\n${example}\n</state_tracking>`;
}

export function StatusBarBuilder({ template, templateName, onSave }: Props) {
  var {state}=useApp();var D=state.theme==='dark';
  var {characters}=useCharacters();
  var [allTpls,setAll]=useState<any>(getTemplates());
  var [selName,setSel]=useState<string>(templateName || template?.style?.title || 'single');
  var [editingName,setEN]=useState(false);var [nameDraft,setND]=useState('');
  var cur:any=allTpls[selName]||(DEFAULT_STATUS_BAR_TEMPLATES as any)[selName]||{fields:[],style:{background:'transparent',borderColor:'#e0e0e0',borderRadius:8,title:'状态面板',columns:3,version:4}};
  var isPreset=PRESET_KEYS.includes(selName);
  var displayName=function(n:string){return PRESET_LABELS[n]||n;};
  var templateNames=PRESET_KEYS.concat(Object.keys(allTpls).filter(function(n){return !PRESET_KEYS.includes(n);}));
  var [fs,setFs]=useState<StatusBarField[]>(cur.fields?.sort((a:any,b:any)=>(a.order||0)-(b.order||0))||[]);
  var [dynamicGroups,setDynamicGroups]=useState<any[]>(cur.dynamicGroups||[]);
  var [st,setSt]=useState(cur.style||BLANK_STYLE);
  var [ef,setEf]=useState<any>(null);var [sh,setSh]=useState(false);
  var [editScope,setEditScope]=useState<'fixed'|'dynamic'>('fixed');var [editDynamicGroupId,setEditDynamicGroupId]=useState('');
  var [emojiGroupId,setEmojiGroupId]=useState('');
  var [copying,setCopying]=useState(false);var [copySource,setCopySource]=useState('');var [copyTarget,setCopyTarget]=useState('');
  var [deletingGroup,setDeletingGroup]=useState(false);var [deleteSource,setDeleteSource]=useState('');

  var bg=D?'bg-[#111]':'bg-[#f5f5f5]';var cd=D?'bg-[#2a2a2a] border-[#3a3a3a]':'bg-white border-[#e2e2e2]';
  var in_=D?'bg-[#1a1a1a] border-[#3a3a3a] text-[#e0e0e0]':'bg-[#f5f5f5] border-[#ddd] text-[#1a1a1a]';
  var tx=D?'text-[#e0e0e0]':'text-[#1a1a1a]';var t2=D?'text-[#888]':'text-[#666]';
  var bt=D?'bg-[#3a3a3a] hover:bg-[#4a4a4a] text-[#ccc]':'bg-[#e8e8e8] hover:bg-[#ddd] text-[#444]';
  var bG='bg-[#3cb371] hover:bg-[#45c181] text-white';var bD=D?'bg-red-900/30 hover:bg-red-900/50 text-red-300':'bg-red-50 hover:bg-red-100 text-red-600';
  var bA='bg-amber-500 hover:bg-amber-600 text-white';

  var selTpl = function(n:string){
    setSel(n);var t=allTpls[n]||(DEFAULT_STATUS_BAR_TEMPLATES as any)[n]||{fields:[],style:{background:'transparent',borderColor:'#e0e0e0',borderRadius:8,title:'状态面板',columns:3,version:4}};
    setFs(t.fields?.slice().sort((a:any,b:any)=>(a.order||0)-(b.order||0))||[]);
    setDynamicGroups(t.dynamicGroups||[]);
     setSt(t.style||BLANK_STYLE);
  };
  var syncBoundCharacters = async function(tpl:any,name:string){
    var boundCharacters = (await Stores.getAllCharacters()).filter(function(character){return character.statusBarTemplateName===name;});
    await Promise.all(boundCharacters.map(async function(character){
      var nextTemplate = JSON.parse(JSON.stringify(tpl));
      await Stores.updateCharacter(character.id,{statusBarTemplate:nextTemplate,statusBarTemplateName:name});
      var conversations = (await Stores.getAllConversations()).filter(function(conversation){return conversation.characterId===character.id;});
      await Promise.all(conversations.map(async function(conversation){
        var nodes = await Stores.getMessageNodesByConversation(conversation.id);
        await Promise.all(nodes.filter(function(node){return Boolean(node.statusBarData);}).map(function(node){
          return Stores.updateMessageNode(node.id,{statusBarData:applyLinkedStatusFields(nextTemplate,node.statusBarData!)});
        }));
      }));
    }));
    if(typeof window!=='undefined'){
      window.dispatchEvent(new CustomEvent('jg2:characters-changed'));
      window.dispatchEvent(new CustomEvent('jg2:statusbar-synced',{detail:{templateName:name,characterIds:boundCharacters.map(function(character){return character.id;})}}));
    }
    return boundCharacters.length;
  };
  var handleSave = async function(){
    var tpl:any={fields:fs.map(function(f:any,i:number){return{...f,order:i};}),dynamicGroups:dynamicGroups,style:st,version:5};
    var next={...allTpls,[selName]:tpl};setAll(next);saveTemplates(next);
    var count=await syncBoundCharacters(tpl,selName);
    onSave(tpl,selName);
    if(count>0) alert('状态栏已保存，并同步更新 '+count+' 张已绑定角色卡及其历史消息。');
  };
  var doCopy = function(src:string){
    var name=displayName(src)+'（副本）';var i=1;while(allTpls[name]){i++;name=displayName(src)+'（副本'+i+'）';}
    var srcT=allTpls[src]||(DEFAULT_STATUS_BAR_TEMPLATES as any)[src]||{fields:[],style:BLANK_STYLE,version:4};
    var copy=JSON.parse(JSON.stringify(srcT));var next={...allTpls,[name]:copy};setAll(next);saveTemplates(next);setSel(name);setFs(copy.fields.slice().sort(function(a:any,b:any){return(a.order||0)-(b.order||0);}));setDynamicGroups(copy.dynamicGroups||[]);setSt(copy.style||BLANK_STYLE);
  };
  var doNew = function(){
    var name='新状态栏';var i=1;while(allTpls[name]){i++;name='新状态栏'+i;}
    var blank:any={fields:[],style:{background:'transparent',borderColor:'#e0e0e0',borderRadius:8,title:name,columns:3,version:4}};
    blank.style.title=name;var next={...allTpls,[name]:blank};setAll(next);saveTemplates(next);setSel(name);setFs([]);setDynamicGroups([]);setSt(blank.style);
  };
  var doDel = function(n:string){
    if(PRESET_KEYS.includes(n))return;
    var boundCharacters=characters.filter(function(character){return character.statusBarTemplateName===n;});
    if(boundCharacters.length){alert('该状态栏已被角色卡绑定，无法删除。请先在角色卡编辑页解除绑定。');return;}
    if(!confirm('删除"'+displayName(n)+'"？'))return;
    var next={...allTpls};delete next[n];setAll(next);saveTemplates(next);
    if(selName===n){var nextName=PRESET_KEYS.concat(Object.keys(next).filter(function(k){return !PRESET_KEYS.includes(k); }))[0]||'single';var nextTpl=next[nextName]||(DEFAULT_STATUS_BAR_TEMPLATES as any)[nextName];setSel(nextName);setFs(nextTpl.fields?.slice().sort(function(a:any,b:any){return(a.order||0)-(b.order||0);})||[]);setDynamicGroups(nextTpl.dynamicGroups||[]);setSt(nextTpl.style||BLANK_STYLE);}
  };
  var doRename = async function(oldN:string){if(!nameDraft.trim()||nameDraft===oldN){setEN(false);return;}if(allTpls[nameDraft]){alert('名称已存在');return;}var next:any={};Object.keys(allTpls).forEach(function(k){if(k===oldN)next[nameDraft]=allTpls[k];else next[k]=allTpls[k];});setAll(next);saveTemplates(next);setSel(nameDraft);setEN(false);var bound=(await Stores.getAllCharacters()).filter(function(character){return character.statusBarTemplateName===oldN;});await Promise.all(bound.map(function(character){return Stores.updateCharacter(character.id,{statusBarTemplateName:nameDraft});}));if(bound.length&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('jg2:characters-changed'));};
  var doExport = function(scope:'current'|'all'){
    var templates:any={};
    if(scope==='current') templates[selName]=JSON.parse(JSON.stringify(allTpls[selName]||(DEFAULT_STATUS_BAR_TEMPLATES as any)[selName]));
    else { PRESET_KEYS.forEach(function(k){templates[k]=JSON.parse(JSON.stringify(allTpls[k]||(DEFAULT_STATUS_BAR_TEMPLATES as any)[k]));}); Object.keys(allTpls).filter(function(k){return !PRESET_KEYS.includes(k);}).forEach(function(k){templates[k]=JSON.parse(JSON.stringify(allTpls[k]));}); }
    var payload={version:2,type:scope==='current'?'statusbar-template':'statusbar-templates',templates:templates};
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(scope==='current'?'statusbar_template_':'statusbar_templates_')+Date.now()+'.json';a.click();URL.revokeObjectURL(a.href);
  };
  var doImport = function(){var inp=document.createElement('input');inp.type='file';inp.accept='.json';inp.onchange=function(e:any){var f=e.target.files[0];if(!f)return;var r=new FileReader();r.onload=function(){try{var data:any=JSON.parse(r.result as string);var source:any=data.templates||data;var incoming:any={};if(Array.isArray(source)){source.forEach(function(item:any){if(item&&item.name&&item.template)incoming[item.name]=item.template;});}else if(source&&typeof source==='object'){Object.keys(source).forEach(function(k){var t=source[k];if(t&&Array.isArray(t.fields)&&t.style)incoming[k]=t;});}if(Object.keys(incoming).length===0)throw new Error('没有找到有效的状态栏模板');var next={...allTpls,...incoming};setAll(next);saveTemplates(next);var first=Object.keys(incoming)[0];if(first){setSel(first);setFs(incoming[first].fields.slice().sort(function(a:any,b:any){return(a.order||0)-(b.order||0);}));setDynamicGroups(incoming[first].dynamicGroups||[]);setSt(incoming[first].style||BLANK_STYLE);}}catch(ex){alert('JSON格式无效或没有有效模板');}};r.readAsText(f);};inp.click();};

  var mv=function(i:number,d:-1|1){var n=[...fs];var t=i+d;if(t<0||t>=n.length)return;[n[i],n[t]]=[n[t],n[i]];setFs(n.map(function(f:any,j:number){return{...f,order:j};}));};
  var af=function(){var f:StatusBarField={key:nextFieldKey('field',fs),label:'新字段',icon:'📌',color:'#aaa',type:'stat',max:100,initial:50,barStyle:'solid',showNumber:true,span:1,order:fs.length,showRound:true};setEditScope('fixed');setEditDynamicGroupId('');setFs([...fs,f]);setEf({...f});setSh(true);};
  var sf=function(){if(!ef)return;if(editScope==='dynamic'&&editDynamicGroupId){setDynamicGroups(dynamicGroups.map(function(group:any){if(group.id!==editDynamicGroupId)return group;var i=group.fields.findIndex(function(f:any){return f.key===ef.key;});var nextFields=[...group.fields];if(i>=0)nextFields[i]=ef;else nextFields.push({...ef,order:nextFields.length});return {...group,fields:nextFields};}));}else{var i=fs.findIndex(function(f:any){return f.key===ef.key;});if(i>=0){var n=[...fs];n[i]=ef;setFs(n);}else setFs([...fs,ef]);}setSh(false);setEf(null);};
  var df=function(k:string){setFs(fs.filter(function(f:any){return f.key!==k;}));};
  var deleteDynamicField=function(groupId:string,key:string){setDynamicGroups(dynamicGroups.map(function(group:any){return group.id===groupId?{...group,fields:group.fields.filter(function(field:any){return field.key!==key;})}:group;}));if(editScope==='dynamic'&&editDynamicGroupId===groupId&&ef?.key===key){setEf(null);setSh(false);}};
  var groupNames=Array.from(new Set(fs.map(function(f:any){return f.characterGroup;}).filter(Boolean))) as string[];
  var openCopyGroup=function(){if(!groupNames.length){alert('当前还没有设置角色组字段。');return;}var source=groupNames[0];setCopySource(source);setCopyTarget(source+'副本');setCopying(true);};
  var confirmCopyGroup=function(){var source=copySource;var target=copyTarget.trim();if(!source||!target||target===source){alert('请选择源角色组并填写不同的新名称。');return;}var sourceFields=fs.filter(function(f:any){return f.characterGroup===source;});var keyMap:any={};sourceFields.forEach(function(f:any,i:number){keyMap[f.key]=f.key+'_copy_'+Date.now()+'_'+i;});var copies=sourceFields.map(function(f:any,i:number){var copy:any={...f,key:keyMap[f.key],characterGroup:target,order:fs.length+i};if(copy.achievementTargetKey)copy.achievementTargetKey=keyMap[copy.achievementTargetKey]||copy.achievementTargetKey;return copy;});setFs(fs.concat(copies));setCopying(false);};
  var openDeleteGroup=function(){if(!groupNames.length){alert('当前还没有设置角色组字段。');return;}setDeleteSource(groupNames[0]);setDeletingGroup(true);};
  var confirmDeleteGroup=function(){var source=deleteSource;if(!source)return;if(!confirm('删除角色组“'+source+'”及其全部字段？此操作需要点击保存状态栏后才会生效。'))return;setFs(fs.filter(function(f:any){return f.characterGroup!==source;}));if(ef?.characterGroup===source){setEf(null);setSh(false);}setDeletingGroup(false);};
  var tl=function(t:string){return ({date:'日期',weekday:'星期',daycount:'天数',period:'时段',location:'地点',stat:'进度条',ratio:'比例数值',text:'文本',counter:'计数',fixedText:'固定文本',achievement:'成就',select:'枚举'}as any)[t]||t;};
  var newDynamicGroup=function(){var id='dynamic_'+Date.now().toString(36);var group:any={id:id,title:'新动态组',icon:'👥',titleField:'name',iconField:'icon',maxInstances:5,showTitle:true,fields:[]};setDynamicGroups(dynamicGroups.concat(group));setEditDynamicGroupId(id);setEditScope('dynamic');};
  var updateDynamicGroup=function(id:string,patch:any){setDynamicGroups(dynamicGroups.map(function(group:any){return group.id===id?{...group,...patch}:group;}));};
  var copyDynamicGroup=function(group:any){var stamp=Date.now().toString(36);var copy:any={...JSON.parse(JSON.stringify(group)),id:'dynamic_'+stamp,title:group.title+'（副本）',fields:(group.fields||[]).map(function(field:any,index:number){return {...field,key:nextFieldKey('dyn',group.fields.slice(0,index)),order:index};})};setDynamicGroups(dynamicGroups.concat(copy));setEditDynamicGroupId(copy.id);setEditScope('dynamic');};
  var removeDynamicGroup=function(id:string){var group=dynamicGroups.find(function(item:any){return item.id===id;});if(!group||!confirm('删除动态组“'+group.title+'”及其全部字段？此操作需要点击保存状态栏后才会生效。'))return;setDynamicGroups(dynamicGroups.filter(function(item:any){return item.id!==id;}));if(editDynamicGroupId===id){setEditDynamicGroupId('');setEditScope('fixed');setEf(null);setSh(false);}};
  var addDynamicField=function(groupId:string){var group=dynamicGroups.find(function(item:any){return item.id===groupId;});if(!group)return;var f:StatusBarField={key:nextFieldKey('dyn',group.fields||[]),label:'新动态字段',icon:'📌',color:'#aaa',type:'text',max:100,initial:0,initialText:'',barStyle:'solid',showNumber:true,span:1,order:(group.fields||[]).length};setDynamicGroups(dynamicGroups.map(function(item:any){return item.id===groupId?{...item,fields:[...(item.fields||[]),f]}:item;}));setEditScope('dynamic');setEditDynamicGroupId(groupId);setEf({...f});setSh(true);};
  var moveDynamicField=function(groupId:string,index:number,d:-1|1){setDynamicGroups(dynamicGroups.map(function(group:any){if(group.id!==groupId)return group;var fields=(group.fields||[]).slice().sort(function(a:any,b:any){return(a.order||0)-(b.order||0);});var target=index+d;if(target<0||target>=fields.length)return group;var temp=fields[index];fields[index]=fields[target];fields[target]=temp;return {...group,fields:fields.map(function(field:any,i:number){return {...field,order:i};})};}));};
  var gp=function(){var ls=fs.map(function(f:any){var g=f.characterGroup?'['+f.characterGroup+'] ':'';if(f.type==='date')return'- '+g+f.label+':日期，初始'+(f.initialText||'2026.06.12')+'，系统随天数联动';if(f.type==='weekday')return'- '+g+f.label+':星期'+(f.initialText||'周一')+'，系统随天数联动';if(f.type==='daycount')return'- '+g+f.label+':天数递增';if(f.type==='period')return'- '+g+f.label+':清晨/上午/午后/深夜,每'+(f.periodRounds||9)+'轮切换';if(f.type==='location')return'- '+g+f.label+':地点名称';if(f.type==='ratio')return'- '+g+f.label+':数值(当前:'+f.initial+'/'+f.max+')，仅显示X/X';if(f.type==='text')return'- '+g+f.label+':文本';if(f.type==='counter')return'- '+g+f.label+':数值(当前:'+f.initial+')';if(f.type==='fixedText')return'- '+g+f.label+':固定文本';if(f.type==='achievement')return'- '+g+f.label+':满足条件后在角色名后显示图标'+f.icon;return'- '+g+f.label+' (0-'+f.max+'):初始'+f.initial;});var ks=fs.filter(function(f:any){return f.type!=='achievement'&&f.type!=='date'&&f.type!=='weekday';}).map(function(f:any){return f.key;}).join(',');var p='<state_tracking>\n'+ls.join('\n')+'\n\n更新格式:回复正文结束后另起最后一行输出 JSON，仅包含字段：'+ks+'。日期、星期和成就图标由系统根据状态自动联动，无需模型额外输出。\n</state_tracking>';navigator.clipboard.writeText(p).then(function(){alert('已复制');});};
  var gp2=function(){navigator.clipboard.writeText(generateStatusPrompt(fs,dynamicGroups)).then(function(){alert('已复制可编辑的状态栏系统提示词');}).catch(function(){alert('复制失败，请检查浏览器剪贴板权限。');});};
  var achievementEditor=ef?.type==='achievement'?React.createElement('div',{className:'col-span-2 grid grid-cols-3 gap-2'},
    React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'条件字段'),React.createElement('select',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.achievementTargetKey||'',onChange:function(e:any){setEf({...ef,achievementTargetKey:e.target.value});}},fs.filter(function(source:any){return source.key!==ef.key&&source.type!=='achievement';}).map(function(source:any){return React.createElement('option',{key:source.key,value:source.key},source.label+'（'+source.key+'）');}))),
    React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'判断'),React.createElement('select',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.achievementOperator||'eq',onChange:function(e:any){setEf({...ef,achievementOperator:e.target.value});}},React.createElement('option',{value:'eq'},'等于'),React.createElement('option',{value:'gte'},'大于等于'),React.createElement('option',{value:'lte'},'小于等于'),React.createElement('option',{value:'contains'},'包含'))),
    React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'条件值'),React.createElement('input',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.achievementValue??'',onChange:function(e:any){setEf({...ef,achievementValue:e.target.value});},placeholder:'如：已婚或100'}))
  ):null;
  var dateEditor=ef?.type==='date'?React.createElement(React.Fragment,null,
    React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'显示格式'),React.createElement('select',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.dateFormat||'ymd',onChange:function(e:any){setEf({...ef,dateFormat:e.target.value});}},React.createElement('option',{value:'ymd'},'年月日（2026.06.12）'),React.createElement('option',{value:'md'},'月日（06.12）'))),
    React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'第1天日期'),React.createElement('input',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.initialText||'',onChange:function(e:any){setEf({...ef,initialText:e.target.value});},placeholder:'2026.06.12'}))
  ):null;
  var weekdayEditor=ef?.type==='weekday'?React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'第1天星期'),React.createElement('select',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.initialText||'周一',onChange:function(e:any){setEf({...ef,initialText:e.target.value});}},['周一','周二','周三','周四','周五','周六','周日'].map(function(day){return React.createElement('option',{key:day,value:day},day);}))):null;
  var optionsEditor=ef?.type==='select'?React.createElement('div',{className:'col-span-2'},React.createElement('label',{className:'text-[10px] block '+t2},'枚举选项（用 / 分隔）'),React.createElement('input',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:(ef.options||[]).join(' / '),onChange:function(e:any){var options=e.target.value.split('/').map(function(value:string){return value.trim();}).filter(Boolean);setEf({...ef,options:options,initialText:ef.initialText||options[0]||''});},placeholder:'亲密 / 正常 / 疏离 / 边缘 / 决裂'})):null;

  return React.createElement('div',{className:'flex flex-col sm:flex-row h-full'},
    /* Left: template list */
    React.createElement('div',{className:'w-full sm:w-48 flex-shrink-0 border-b sm:border-b-0 sm:border-r p-3 '+(D?'border-[#3a3a3a] bg-[#1a1a1a]':'border-[#e0e0e0] bg-[#f0f0f0]')},
      React.createElement('div',{className:'flex items-center justify-between mb-2'},React.createElement('span',{className:'text-xs font-medium '+tx},'模板列表')),
      React.createElement('div',{className:'flex gap-1 mb-2'},React.createElement('button',{onClick:doNew,className:'px-2 py-1 text-[10px] rounded '+bG},'+'),React.createElement('button',{onClick:doImport,className:'px-2 py-1 text-[10px] rounded '+bt,title:'导入模板'},'📥'),React.createElement('button',{onClick:function(){doExport('current');},className:'px-2 py-1 text-[10px] rounded '+bt,title:'导出当前模板'},'📤'),React.createElement('button',{onClick:function(){doExport('all');},className:'px-2 py-1 text-[10px] rounded '+bt,title:'导出全部模板'},'🗂️')),
      React.createElement('div',{className:'space-y-0.5 max-h-full overflow-y-auto'},
        templateNames.map(function(k){
          var isP=PRESET_KEYS.includes(k);var isA=selName===k;
          return React.createElement('div',{key:k,className:'group flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer '+(isA?(D?'bg-amber-500/20 text-amber-400':'bg-amber-100 text-amber-700'):(D?'text-[#aaa] hover:bg-[#333]':'text-[#555] hover:bg-[#e0e0e0]')),
            onClick:function(){selTpl(k);}},
            editingName&&k===selName?React.createElement('input',{className:'flex-1 w-0 px-1 py-0.5 text-[10px] rounded border '+in_,value:nameDraft,onChange:function(e:any){setND(e.target.value);},onBlur:function(){doRename(k);},onKeyDown:function(e:any){if(e.key==='Enter')doRename(k);if(e.key==='Escape')setEN(false);},autoFocus:true,onClick:function(e:any){e.stopPropagation();}}):
            React.createElement('span',{className:'flex-1 truncate'},(k==='single'?'👤 ':k==='multi'?'👥 ':k==='dynamic-multi'?'🔄 ':'')+displayName(k)),
            React.createElement('span',{className:'hidden group-hover:flex gap-0.5'},
              !isP?React.createElement('button',{onClick:function(e:any){e.stopPropagation();setEN(true);setND(k);},className:'text-[10px] px-1 rounded hover:underline '+t2,title:'重命名'},'✎'):null,
              React.createElement('button',{onClick:function(e:any){e.stopPropagation();doCopy(k);},className:'text-[10px] px-1 rounded hover:underline '+t2,title:'复制副本'},'⧉'),
              !isP?React.createElement('button',{onClick:function(e:any){e.stopPropagation();doDel(k);},className:'text-[10px] px-1 rounded hover:underline text-red-400',title:'删除'},'✕'):null));
        }))),

    /* Right: field builder */
    React.createElement('div',{className:'flex-1 overflow-y-auto p-6 '+bg},
      React.createElement('div',{className:'max-w-4xl mx-auto'},
        React.createElement('div',{className:'flex items-center justify-between mb-4'},
            React.createElement('h2',{className:'text-lg font-semibold '+tx},displayName(selName)+(isPreset?' (预设)':'')),
          React.createElement('div',{className:'flex gap-2'},
            isPreset?React.createElement('button',{onClick:function(){doCopy(selName);},className:'px-3 py-1.5 text-xs rounded '+bA},'📑克隆状态栏'):
            React.createElement('button',{onClick:function(){void handleSave();},className:'px-3 py-1.5 text-xs rounded '+bA},'💾保存状态栏'),
            React.createElement('button',{onClick:gp2,className:'px-3 py-1.5 text-xs rounded '+bG,disabled:false},'📋 生成提示词'))),
        React.createElement('div',{className:'mb-4 grid grid-cols-[auto_auto_auto_auto_auto_auto] items-center gap-2 overflow-x-auto whitespace-nowrap'},
          React.createElement('input',{className:'w-24 px-2 py-1 text-[10px] rounded border '+in_,value:st.title,onChange:function(e:any){setSt({...st,title:e.target.value});},placeholder:'标题'}),
          React.createElement('label',{className:'flex items-center gap-1 text-[10px] cursor-pointer '+tx},React.createElement('input',{type:'checkbox',checked:!st.hideTitle,onChange:function(e:any){setSt({...st,hideTitle:!e.target.checked} as any);},className:'rounded accent-[#3cb371]'}),'显示'),
          React.createElement('span',{className:'text-xs ml-1 '+t2},'列数：'),
          React.createElement('select',{className:'px-2 py-1 text-[10px] rounded border '+in_,value:st.columns,onChange:function(e:any){setSt({...st,columns:parseInt(e.target.value)});}},([1,2,3,4,5]as number[]).map(function(n){return React.createElement('option',{key:n,value:n},n+'列');})),
          React.createElement('span',{className:'text-xs ml-1 '+t2},'样式：'),
            React.createElement('select',{className:'px-2 py-1 text-[10px] rounded border '+in_,value:st.variant||'default',onChange:function(e:any){setSt({...st,variant:e.target.value});}},React.createElement('option',{value:'default'},'标准'),React.createElement('option',{value:'white'},'白底'),React.createElement('option',{value:'black'},'黑底'),React.createElement('option',{value:'borderless'},'无边'),React.createElement('option',{value:'glass'},'玻璃'),React.createElement('option',{value:'neon'},'黑曜'),React.createElement('option',{value:'paper'},'纸张'),React.createElement('option',{value:'compact'},'紧凑'))),
        React.createElement('div',{className:'flex gap-4'},
          React.createElement('div',{className:'flex-1 space-y-2'},
            React.createElement('div',{className:'flex items-center justify-between mb-2 gap-2'},React.createElement('span',{className:'text-xs '+t2},fs.length+' 个固定字段 / '+dynamicGroups.length+' 个动态组'),React.createElement('div',{className:'flex flex-wrap gap-1'},React.createElement('button',{onClick:openCopyGroup,className:'px-2 py-1 text-[10px] rounded '+bt},'复制角色组'),React.createElement('button',{onClick:openDeleteGroup,className:'px-2 py-1 text-[10px] rounded '+bD},'删除角色组'),React.createElement('button',{onClick:newDynamicGroup,className:'px-2 py-1 text-[10px] rounded '+bG},'+ 新建动态组'),React.createElement('button',{onClick:af,className:'px-2 py-1 text-[10px] rounded '+bG},'+ 添加固定字段'))),
            copying&&React.createElement('div',{className:'flex flex-wrap items-center gap-2 p-2 mb-2 rounded-lg border '+(D?'border-[#444] bg-[#202020]':'border-[#e5e5e5] bg-[#fafafa]')},React.createElement('span',{className:'text-[10px] '+t2},'复制角色组'),React.createElement('select',{className:'px-2 py-1 text-[10px] rounded border '+in_,value:copySource,onChange:function(e:any){setCopySource(e.target.value);}},groupNames.map(function(name){return React.createElement('option',{key:name,value:name},name);})),React.createElement('input',{className:'w-28 px-2 py-1 text-[10px] rounded border '+in_,value:copyTarget,onChange:function(e:any){setCopyTarget(e.target.value);},placeholder:'新角色组名称'}),React.createElement('button',{onClick:confirmCopyGroup,className:'px-2 py-1 text-[10px] rounded '+bG},'确认复制'),React.createElement('button',{onClick:function(){setCopying(false);},className:'px-2 py-1 text-[10px] rounded '+bt},'取消')),
            deletingGroup&&React.createElement('div',{className:'flex flex-wrap items-center gap-2 p-2 mb-2 rounded-lg border '+(D?'border-red-500/40 bg-[#202020]':'border-red-200 bg-red-50')},React.createElement('span',{className:'text-[10px] '+t2},'删除角色组'),React.createElement('select',{className:'px-2 py-1 text-[10px] rounded border '+in_,value:deleteSource,onChange:function(e:any){setDeleteSource(e.target.value);}},groupNames.map(function(name){return React.createElement('option',{key:name,value:name},name);})),React.createElement('button',{onClick:confirmDeleteGroup,className:'px-2 py-1 text-[10px] rounded '+bD},'确认删除'),React.createElement('button',{onClick:function(){setDeletingGroup(false);},className:'px-2 py-1 text-[10px] rounded '+bt},'取消')),
            fs.sort(function(a:any,b:any){return(a.order||0)-(b.order||0);}).map(function(f:any,idx:number){return React.createElement('div',{key:f.key,className:'flex items-center gap-2 p-2 rounded-lg border '+(D?'bg-[#1a1a1a] border-[#333]':'bg-[#fafafa] border-[#eee]')},
              React.createElement('div',{className:'flex flex-col gap-0.5'},React.createElement('button',{onClick:function(){mv(idx,-1);},disabled:idx===0,className:'text-[10px] leading-none '+(idx===0?(D?'text-[#444]':'text-[#ccc]'):t2)},'▲'),React.createElement('button',{onClick:function(){mv(idx,1);},disabled:idx>=fs.length-1,className:'text-[10px] leading-none '+(idx>=fs.length-1?(D?'text-[#444]':'text-[#ccc]'):t2)},'▼')),
              React.createElement('div',{className:'flex items-center gap-2 flex-1 min-w-0 cursor-pointer',onClick:function(){setEditScope('fixed');setEditDynamicGroupId('');setEf({...f});setSh(true);}},React.createElement('span',{className:'text-sm'},f.icon),React.createElement('span',{className:'text-xs font-medium truncate '+tx},f.label),f.characterGroup?React.createElement('span',{className:'text-[10px] px-1 rounded '+(D?'bg-blue-500/20 text-blue-400':'bg-blue-100 text-blue-700')},'👩 '+f.characterGroup):null,React.createElement('span',{className:'text-[10px] '+t2},tl(f.type)+' '+(f.span&&f.span>1?f.span+'列':''))),
              React.createElement('button',{onClick:function(){df(f.key);},className:'px-1.5 py-0.5 text-[10px] rounded '+bD},'✕'));}),
            fs.length===0?React.createElement('p',{className:'text-xs text-center py-4 '+t2},'添加固定字段开始搭建。'):null,
            dynamicGroups.map(function(group:any){
              var groupFields=(group.fields||[]).slice().sort(function(a:any,b:any){return(a.order||0)-(b.order||0);});
              return React.createElement('div',{key:group.id,className:'mt-3 p-3 rounded-xl border '+(D?'bg-[#202020] border-[#3a3a3a]':'bg-[#fafafa] border-[#e1e1e1]')},
                React.createElement('div',{className:'grid grid-cols-[minmax(0,1fr)_44px_64px_auto_auto_auto] gap-1 items-center'},
                  React.createElement('input',{className:'min-w-0 px-2 py-1 rounded text-xs border '+in_,value:group.title,onChange:function(e:any){updateDynamicGroup(group.id,{title:e.target.value});},placeholder:'动态组名称'}),
                  React.createElement('button',{className:'w-11 h-7 rounded text-sm border '+in_,onClick:function(){setEmojiGroupId(emojiGroupId===group.id?'':group.id);},title:'选择动态组图标'},group.icon||'👥'),
                  React.createElement('input',{type:'number',min:1,'aria-label':'人数上限',className:'w-16 px-1 py-1 rounded text-xs border '+in_,value:group.maxInstances||'',onChange:function(e:any){updateDynamicGroup(group.id,{maxInstances:parseInt(e.target.value)||undefined});},placeholder:'人数上限',title:'动态成员人数上限'}),
                  React.createElement('label',{className:'flex items-center gap-1 text-[10px] whitespace-nowrap '+t2},React.createElement('input',{type:'checkbox',checked:group.showTitle!==false,onChange:function(e:any){updateDynamicGroup(group.id,{showTitle:e.target.checked});},className:'rounded accent-[#3cb371]'}),'显示标题'),
                  React.createElement('button',{onClick:function(){copyDynamicGroup(group);},className:'px-2 py-1 text-[10px] rounded '+bt},'复制'),
                  React.createElement('button',{onClick:function(){removeDynamicGroup(group.id);},className:'px-2 py-1 text-[10px] rounded '+bD},'删除')
                ),
                emojiGroupId===group.id?React.createElement('div',{className:'flex flex-wrap gap-1 mt-1 p-1 rounded border '+(D?'border-[#3a3a3a] bg-[#181818]':'border-[#ddd] bg-white')},E.map(function(em){return React.createElement('button',{key:em,onClick:function(){updateDynamicGroup(group.id,{icon:em});},className:'w-6 h-6 text-xs flex items-center justify-center rounded '+(group.icon===em?(D?'bg-[#333]':'bg-[#ddd]'):'')},em);})):null,
                React.createElement('div',{className:'text-[10px] mt-2 mb-1 '+t2},'动态字段 '+groupFields.length+' 个 · 成员上限：'+(group.maxInstances||'不限')+' · 字段结构只对该动态组生效'),
                groupFields.map(function(field:any,index:number){return React.createElement('div',{key:field.key,className:'flex items-center gap-1 p-1.5 mb-1 rounded border '+(D?'bg-[#181818] border-[#333]':'bg-white border-[#eee]')},
                  React.createElement('div',{className:'flex flex-col gap-0.5'},React.createElement('button',{onClick:function(){moveDynamicField(group.id,index,-1);},disabled:index===0,className:'text-[10px] leading-none '+(index===0?(D?'text-[#444]':'text-[#ccc]'):t2)},'▲'),React.createElement('button',{onClick:function(){moveDynamicField(group.id,index,1);},disabled:index>=groupFields.length-1,className:'text-[10px] leading-none '+(index>=groupFields.length-1?(D?'text-[#444]':'text-[#ccc]'):t2)},'▼')),
                  React.createElement('div',{className:'flex-1 min-w-0 cursor-pointer',onClick:function(){setEditScope('dynamic');setEditDynamicGroupId(group.id);setEf({...field});setSh(true);}},React.createElement('span',{className:'text-sm mr-1'},field.icon),React.createElement('span',{className:'text-xs '+tx},field.label),React.createElement('span',{className:'text-[10px] ml-2 '+t2},tl(field.type)),field.type==='select'&&field.options?.length?React.createElement('span',{className:'text-[10px] ml-1 '+t2},'（'+field.options.join(' / ')+'）'):null),
                  React.createElement('button',{onClick:function(){deleteDynamicField(group.id,field.key);},className:'px-1.5 py-0.5 text-[10px] rounded '+bD},'✕')
                );}),
                groupFields.length===0?React.createElement('p',{className:'text-[10px] py-2 '+t2},'该组还没有字段。请按角色卡需求添加，例如健康可用进度条，信任/感染可用枚举。'):null,
                React.createElement('button',{onClick:function(){addDynamicField(group.id);},className:'mt-1 px-2 py-1 text-[10px] rounded '+bG},'+ 添加动态字段')
              );
            }),
             sh&&ef&&React.createElement('div',{className:'p-4 rounded-xl border space-y-2 mt-3 '+cd},
              React.createElement('div',{className:'grid grid-cols-2 gap-2'},
                React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'类型'),React.createElement('select',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.type,onChange:function(e:any){var t=e.target.value;var u:any={...ef,type:t};if(['date','weekday','daycount','period','location','fixedText','achievement','select'].indexOf(t)>=0)u.max=0;if(t==='date'){u.dateFormat=u.dateFormat||'ymd';u.initialText=u.initialText||'2026.06.12';}if(t==='weekday')u.initialText=u.initialText||'周一';if(t==='period'){u.periodRounds=u.periodRounds||9;u.showRound=u.showRound!==false;u.characterGroup='';}if(t==='ratio'){u.max=u.max||100;u.initial=u.initial||0;}if(t==='counter'){u.max=u.max||999;u.initial=u.initial||0;u.decimalPlaces=u.decimalPlaces||0;}if(t==='select'){u.options=u.options||['选项1','选项2'];u.initialText=u.initialText||u.options[0];}if(t==='achievement'){u.characterGroup=u.characterGroup||'角色';u.achievementOperator=u.achievementOperator||'eq';u.achievementValue=u.achievementValue||'';}if(['date','weekday','daycount','location','select'].indexOf(t)>=0)u.characterGroup='';setEf(u);}},
                  React.createElement('option',{value:'date'},'日期'),React.createElement('option',{value:'weekday'},'星期'),React.createElement('option',{value:'daycount'},'天数'),React.createElement('option',{value:'period'},'时段'),React.createElement('option',{value:'location'},'地点'),React.createElement('option',{value:'stat'},'进度条'),React.createElement('option',{value:'ratio'},'比例数值'),React.createElement('option',{value:'text'},'文本'),React.createElement('option',{value:'counter'},'计数'),React.createElement('option',{value:'fixedText'},'固定文本'),React.createElement('option',{value:'achievement'},'成就图标'),React.createElement('option',{value:'select'},'枚举'))),
                 dateEditor,
                 weekdayEditor,
                 optionsEditor,
                React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'角色组'),React.createElement('input',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.characterGroup||'',onChange:function(e:any){setEf({...ef,characterGroup:e.target.value});},placeholder:'留空不分组',disabled:editScope==='dynamic'||['date','weekday','daycount','period','location','select'].indexOf(ef.type)>=0})),
                React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'Key'),React.createElement('input',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.key,onChange:function(e:any){setEf({...ef,key:e.target.value});}})),
                React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'标签'),React.createElement('input',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.label,onChange:function(e:any){setEf({...ef,label:e.target.value});}})),
                React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'图标'),React.createElement('input',{className:'w-full px-2 py-1 rounded text-xs border mb-1 '+in_,value:ef.icon,onChange:function(e:any){setEf({...ef,icon:e.target.value});}}),React.createElement('div',{className:'flex flex-wrap gap-1 max-h-16 overflow-y-auto p-1 rounded border '+(D?'border-[#3a3a3a]':'border-[#ddd]')},E.map(function(em){return React.createElement('button',{key:em,onClick:function(){setEf({...ef,icon:em});},className:'w-6 h-6 text-xs flex items-center justify-center rounded '+(ef.icon===em?(D?'bg-[#333]':'bg-[#ddd]'):'')},em);}))),
                React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'颜色'),React.createElement('input',{type:'color',className:'w-full h-8 rounded border',value:ef.color,onChange:function(e:any){setEf({...ef,color:e.target.value});}})),
                React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'占宽'),React.createElement('select',{className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.span||1,onChange:function(e:any){setEf({...ef,span:parseInt(e.target.value)});}},([1,2,3,4,5]as number[]).map(function(n){return React.createElement('option',{key:n,value:n},n+'列');}))),
                ['stat','ratio','counter'].indexOf(ef.type)>=0?React.createElement(React.Fragment,null,React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'最大值'),React.createElement('input',{type:'number',step:ef.decimalPlaces===1?'0.1':'1',className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.max||'',onChange:function(e:any){setEf({...ef,max:parseFloat(e.target.value)||0});},placeholder:'0 表示不限制'})),React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'初始值'),React.createElement('input',{type:'number',step:ef.decimalPlaces===1?'0.1':'1',className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.initial,onChange:function(e:any){setEf({...ef,initial:parseFloat(e.target.value)||0});}})),React.createElement('label',{className:'col-span-2 flex items-center gap-1 text-[10px] '+tx},React.createElement('input',{type:'checkbox',checked:ef.decimalPlaces===1,onChange:function(e:any){setEf({...ef,decimalPlaces:e.target.checked?1:0});},className:'rounded accent-[#3cb371]'}),'允许 1 位小数（如 1.1）')):null,
                ef.type==='period'?React.createElement(React.Fragment,null,React.createElement('div',null,React.createElement('label',{className:'text-[10px] block '+t2},'每时段轮数'),React.createElement('input',{type:'number',className:'w-full px-2 py-1 rounded text-xs border '+in_,value:ef.periodRounds||9,onChange:function(e:any){setEf({...ef,periodRounds:parseInt(e.target.value)||9});}})),React.createElement('label',{className:'flex items-center gap-1 text-[10px] '+tx},React.createElement('input',{type:'checkbox',checked:ef.showRound!==false,onChange:function(e:any){setEf({...ef,showRound:e.target.checked});},className:'rounded accent-[#3cb371]'}),'显示轮数')):null,
                achievementEditor,
              ef.type==='stat'?React.createElement('div',{className:'flex gap-2 items-center'},React.createElement('label',{className:'flex items-center gap-1 text-[10px] cursor-pointer '+tx},React.createElement('input',{type:'checkbox',checked:ef.showNumber,onChange:function(e:any){setEf({...ef,showNumber:e.target.checked});},className:'rounded accent-[#3cb371]'}),'显示数值'),React.createElement('select',{className:'px-2 py-1 rounded text-[10px] border '+in_,value:ef.barStyle,onChange:function(e:any){setEf({...ef,barStyle:e.target.value as any});}},React.createElement('option',{value:'solid'},'实心条'),React.createElement('option',{value:'gradient'},'渐变条'),React.createElement('option',{value:'segments'},'分段条'))):null,
               React.createElement('div',{className:'flex gap-2'},React.createElement('button',{onClick:sf,className:'px-2 py-1 text-[10px] rounded '+bG},'确定'),React.createElement('button',{onClick:function(){setSh(false);setEf(null);},className:'px-2 py-1 text-[10px] rounded '+bt},'取消')))),
          React.createElement('div',{className:'w-full sm:w-72 flex-shrink-0'},React.createElement('span',{className:'text-xs block mb-2 '+t2},'预览'),
             React.createElement(Preview,{fields:fs,style:st,isDark:D,dynamicGroups:dynamicGroups})))))));
}

function Preview(p:{fields:StatusBarField[];style:any;isDark:boolean;dynamicGroups?:DynamicStatusGroup[]}){
  var fs=p.fields,st=p.style,groups=p.dynamicGroups||[],variantName=st.variant||'default',D=(p.isDark&&variantName!=='white'&&variantName!=='paper')||variantName==='black'||variantName==='neon',cols=st.columns||3;if(fs.length===0&&groups.length===0)return React.createElement('div',{className:'p-4 rounded-lg border text-center text-xs '+(D?'bg-[#2a2a2a] border-[#3a3a3a] text-[#888]':'bg-white border-[#ddd] text-[#999]')},'暂无字段');
  var previewSnapshot=createInitialStatusSnapshot({fields:fs,dynamicGroups:groups,style:st,version:5});
  var srt=fs.slice().sort(function(a:any,b:any){return(a.order||0)-(b.order||0);});var seen:any={};
  var variant=st.variant||'default';var panelDark=D||variant==='black'||variant==='neon';var panelStyle:any={background:st.background||(panelDark?'#2a2a2a':'white'),borderColor:st.borderColor||(panelDark?'#3a3a3a':'#e0e0e0'),borderRadius:(st.borderRadius||8)+'px',borderWidth:'1px',borderStyle:'solid',padding:variant==='compact'?'6px 8px':'10px',display:'grid',gridTemplateColumns:'repeat('+cols+',minmax(0,1fr))',gap:'4px',alignItems:'start',width:'fit-content',maxWidth:'100%',minWidth:0,boxSizing:'border-box',overflowWrap:'anywhere'};if(variant==='white'){panelStyle.background='#fff';panelStyle.borderColor='#ddd';}if(variant==='black'){panelStyle.background='#111';panelStyle.borderColor='#333';panelStyle.boxShadow='0 4px 18px rgba(0,0,0,.28)';}if(variant==='borderless'){panelStyle.borderWidth='0';panelStyle.borderColor='transparent';}if(variant==='glass'){panelStyle.background=panelDark?'rgba(30,30,30,.84)':'rgba(255,255,255,.82)';panelStyle.backdropFilter='blur(12px)';panelStyle.borderColor=panelDark?'rgba(255,255,255,.22)':'rgba(0,0,0,.12)';panelStyle.boxShadow='0 8px 24px rgba(0,0,0,.12)';}if(variant==='neon'){panelStyle.background='#10141f';panelStyle.borderColor='#38bdf8';panelStyle.boxShadow='0 0 0 1px rgba(56,189,248,.25),0 0 18px rgba(56,189,248,.18)';}if(variant==='paper'){panelStyle.background='#fffaf0';panelStyle.borderColor='#e6d5b8';panelStyle.boxShadow='0 3px 10px rgba(120,80,20,.08)';}
  return React.createElement('div',{style:panelStyle},
    !st.hideTitle&&st.title?React.createElement('div',{style:{fontSize:'11px',fontWeight:600,marginBottom:'3px',color:D?'#e0e0e0':'#1a1a1a',gridColumn:'1/-1'}},st.title):null,
    srt.map(function(f:any){var nh=f.characterGroup&&!seen[f.characterGroup];if(f.characterGroup)seen[f.characterGroup]=true;var icons=f.characterGroup?srt.filter(function(a:any){return a.type==='achievement'&&a.characterGroup===f.characterGroup&&isAchievementUnlocked(a,previewSnapshot);}).map(function(a:any){return a.icon;}).join(''):'';return React.createElement(React.Fragment,{key:f.key},nh?React.createElement('div',{style:{fontSize:'10px',fontWeight:600,color:D?'#aaa':'#777',marginTop:'2px',marginBottom:'1px',borderBottom:'1px solid '+(D?'#333':'#eee'),paddingBottom:'2px',gridColumn:'1/-1'}},'👩 '+f.characterGroup+icons):null,f.type==='achievement'?null:React.createElement('div',{style:{gridColumn:'span '+(f.span||1)}},React.createElement(Pf,{f:f,isDark:D})));}),
    groups.map(function(group:any){var example=(group.fields||[]).slice().sort(function(a:any,b:any){return(a.order||0)-(b.order||0);}).map(function(f:any){return React.createElement('div',{key:f.key,style:{fontSize:'9px',color:D?'#bbb':'#666',gridColumn:'span '+(f.span||1),minWidth:0,overflowWrap:'anywhere'}},f.icon+' '+f.label+':示例');});return React.createElement('div',{key:group.id,style:{gridColumn:'1/-1',borderTop:'1px solid '+(D?'#333':'#eee'),paddingTop:'3px',marginTop:'2px'}},group.showTitle!==false?React.createElement('div',{style:{fontSize:'10px',fontWeight:600,color:D?'#aaa':'#777',marginBottom:'2px'}},group.icon+' '+group.title+'（示例角色 · 最多'+(group.maxInstances||'不限')+'人）'):null,React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat('+cols+',minmax(0,1fr))',gap:'4px',minWidth:0}},example));})
  );
}
function Pf(p:{f:StatusBarField;isDark:boolean}){var f=p.f,D=p.isDark;
  if(f.type==='date'||f.type==='weekday')return React.createElement('div',{style:{fontSize:'10px',color:D?'#ccc':'#555'}},f.icon+' '+(f.initialText||'2026.06.12'));
  if(f.type==='daycount')return React.createElement('div',{style:{fontSize:'10px',color:D?'#ccc':'#555'}},f.icon+' 第5天');
  if(f.type==='period')return React.createElement('div',{style:{fontSize:'10px',color:D?'#ccc':'#555'}},f.icon+' 清晨'+(f.showRound!==false?' · '+(f.periodRounds?String(f.periodRounds).padStart(2,'0'):'09'):''));
  if(f.type==='location')return React.createElement('div',{style:{fontSize:'10px',color:D?'#ccc':'#555'}},f.icon+' 中央广场');
  if(f.type==='counter')return React.createElement('div',{style:{fontSize:'10px',display:'flex',justifyContent:'space-between'}},React.createElement('span',{style:{color:D?'#999':'#888'}},f.icon+' '+f.label),React.createElement('span',{style:{color:f.color,fontWeight:600}},'×'+f.initial));
  if(f.type==='text'||f.type==='fixedText'||f.type==='select')return React.createElement('div',{style:{fontSize:'10px',color:D?'#ddd':'#555',display:'flex',gap:'4px',alignItems:'center'}},React.createElement('span',null,f.icon),React.createElement('span',null,f.type==='select'?(f.options?.[0]||'示例值'):'示例值'));
  if(f.type==='ratio')return React.createElement('div',{style:{fontSize:'10px',color:D?'#ddd':'#555'}},f.icon+' '+f.label+' '+(f.initial||0)+'/'+f.max);
  if(f.type==='achievement')return null;
  return React.createElement('div',null,React.createElement('div',{style:{fontSize:'9px',display:'flex',justifyContent:'space-between',color:D?'#999':'#888'}},React.createElement('span',null,f.icon+' '+f.label),f.showNumber?React.createElement('span',null,f.initial+'/'+f.max):null),React.createElement('div',{style:{height:'4px',borderRadius:'2px',background:D?'#444':'#eee',overflow:'hidden'}},React.createElement('div',{style:{height:'100%',width:(f.initial/f.max*100)+'%',background:f.color,borderRadius:'2px'}})));
}
