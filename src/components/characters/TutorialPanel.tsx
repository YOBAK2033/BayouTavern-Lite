import React, { useState, type ReactNode } from 'react';
import { useApp } from '../../hooks/useApp';
import { ModelConnectionHelp } from '../settings/ModelConnectionHelp';

export function TutorialPanel() {
  const { state } = useApp();
  const isDark = state.theme === 'dark';
  const bg = isDark ? 'bg-[#111]' : 'bg-[#f5f5f5]';
  const card = isDark ? 'bg-[#202020] border-[#3a3a3a]' : 'bg-white border-[#e2e2e2]';
  const text = isDark ? 'text-[#e9e9e9]' : 'text-[#171717]';
  const muted = isDark ? 'text-[#aaa]' : 'text-[#666]';
  const soft = isDark ? 'bg-[#292929] border-[#444]' : 'bg-[#f8faf9] border-[#e4eee8]';
  const code = isDark ? 'bg-[#171717] border-[#444] text-[#9be59b]' : 'bg-[#f3f8f4] border-[#d9eadf] text-[#287a4b]';
  const inputDemo = isDark ? 'bg-white border-[#dfe5e1] text-slate-700 shadow-sm' : code;
  const notice = isDark ? 'bg-[#332b18] border-[#6c5721] text-[#f0d98b]' : 'bg-[#fff9e8] border-[#f0dfaa] text-[#765d18]';
  const danger = isDark ? 'bg-[#3a2222] border-[#633838] text-[#ffb0b0]' : 'bg-[#fff0f0] border-[#f1caca] text-[#9a3b3b]';
  const linkCard = isDark ? 'bg-[#252525] border-[#444]' : 'bg-[#fbfbfb] border-[#e8e8e8]';
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={'flex-1 overflow-y-auto p-3 sm:p-6 ' + bg}>
      <div className="mx-auto max-w-5xl space-y-5">
        <section className={'rounded-2xl border p-5 shadow-sm sm:p-7 ' + card}>
          <div className="flex items-start gap-3">
            <span className="text-3xl" aria-hidden="true">📖</span>
            <div>
              <h2 className={'text-xl font-semibold ' + text}>BayouTavern Lite 使用教程</h2>
              <p className={'mt-2 text-sm leading-6 ' + muted}>第一次使用不用一次看懂全部功能，按顺序先设置好，再慢慢深入了解。</p>
            </div>
          </div>
          <div className={'mt-5 grid gap-2 sm:grid-cols-4 ' + text}>
            <PathBadge number="1" label="接入模型" color="bg-[#3cb371]" onClick={() => jumpTo('tutorial-step-1')} />
            <PathBadge number="2" label="准备角色" color="bg-[#4d9de0]" onClick={() => jumpTo('tutorial-step-2')} />
            <PathBadge number="3" label="开始游玩" color="bg-[#9b7ede]" onClick={() => jumpTo('tutorial-step-3')} />
            <PathBadge number="4" label="高级管理" color="bg-[#e39b45]" onClick={() => jumpTo('tutorial-step-4')} />
          </div>
          <div className={'mt-5 rounded-xl border p-3 text-xs leading-6 ' + notice}>
            <strong>最短路径：</strong>设置 → 配置一个主模型 → 新建或导入角色卡 → 左侧“新建对话” → 选择角色开始聊天。
          </div>
        </section>

        <StepSection id="tutorial-step-1" number="1" title="配置主模型与记忆官模型" card={card} text={text} muted={muted} accent="bg-[#3cb371]">
          <p>主模型负责主要角色回复和剧情推进；记忆官模型是后台的小助手，只把新发生的内容整理成记忆，供主模型以后参考。两套配置互相独立，可以使用不同服务商、不同模型。</p>
          <div className="mt-4">
            <div>
              <div className={'mt-4 rounded-xl border p-3 ' + inputDemo}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-70">配置填写示意</div>
                <MockInput label="Base URL" value="https://api.deepseek.com" />
                <MockInput label="API Key" value="sk-••••••••••••••" />
                <div className="mt-2 flex items-center gap-2"><span className="w-20 text-[10px] opacity-70">模型名称</span><span className="flex-1 rounded border border-current/20 px-2 py-1 text-[10px]">点击“获取模型”后选择或手动填写</span><span className="rounded bg-[#3cb371] px-2 py-1 text-[10px] text-white">获取模型</span></div>
                <div className="mt-2 flex items-center gap-1.5"><span className="shrink-0 rounded bg-[#3cb371]/80 px-1.5 py-0.5 text-[9px] leading-4 text-white">Ping</span><span className="text-[10px] leading-4 opacity-70">用于测试下网络是否正常，正常会显示网速。失败时查看下方“常见模型连接问题”进行排查。</span></div>
              </div>
              <div className="mt-4">
                <h3 className={'text-sm font-semibold ' + text}>先看懂这 4 个参数</h3>
                <div className={'mt-3 grid gap-3 sm:grid-cols-2'}>
                  <ParamItem label="名称" text="这是 API 配置第一行的备注名称，可以自定义随便填写，方便区分不同配置，不影响 API 设置和调用。" textClass={muted} titleClass="text-[#3cb371]" />
                  <ParamItem label="Base URL（服务地址）" text="API 的入口地址，不是普通网页首页。请按服务商给出的地址原样粘贴，例如 https://api.deepseek.com。" textClass={muted} titleClass="text-[#3cb371]" />
                  <ParamItem label="API Key（密钥）" text="服务商发给你的调用凭证，相当于密码。只填自己的 Key，不要发给别人，也不要放进公开截图。" textClass={muted} titleClass="text-[#3cb371]" />
                  <ParamItem label="模型名称" text="具体要调用的模型 ID，必须和服务商接口返回的名称一致。现在点“获取模型”即可从列表选择，也可以手动填写。" textClass={muted} titleClass="text-[#3cb371]" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5"><ModelConnectionHelp isDark={isDark} /></div>

          <h3 className={'mt-6 text-sm font-semibold ' + text}>可选的模型渠道</h3>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <ProviderCard title="DeepSeek（最便捷的付费模型，主模型优先推荐）" textClass={muted} titleClass={text} className={linkCard}>
              <p>注册并创建 API Key 后填入设置。每日 <strong className="text-[#d97706]">9:00～12:00</strong> 和 <strong className="text-[#d97706]">14:00～18:00</strong> 为峰值定价时段，价格为平时的 2 倍。</p>
              <div className="mt-2"><ExternalLink href="https://api-docs.deepseek.com/zh-cn/" label="📖 DeepSeek 文档 / 获取 Key" /></div>
            </ProviderCard>
            <ProviderCard title="DeepSeek V4 Flash Free（免费渠道）" textClass={muted} titleClass={text} className={linkCard}>
              <p>可参考教程获取免费模型使用方式。需要先注册 GitHub 账号；具体额度、速度和可用性以教程页面及服务商实际情况为准。</p>
              <ExternalLink href="https://ncn9oq8kz997.feishu.cn/wiki/GmzWwGcFFiorl3k6ImocWVennwd" label="🔑 打开获取教程" />
            </ProviderCard>
            <ProviderCard title="智谱 GLM（部分免费模型，低智）" textClass={muted} titleClass={text} className={linkCard}>
              <p>先打开页面<strong className="text-[#3cb371]">创建 API Key</strong>。目前免费的模型只有 <strong className="text-[#3cb371]">agnes-2.0-flash</strong>，其他模型可能收费，请先确认价格。</p>
              <div className="mt-2 flex flex-wrap gap-2"><ExternalLink href="https://platform.agnes-ai.com/settings/apiKeys" label="🔑 创建 Key" /><CopyValue value="https://apihub.agnes-ai.com/v1" label="复制 Base URL" /><CopyValue value="agnes-2.0-flash" label="复制模型名" /></div>
            </ProviderCard>
            <ProviderCard title="Google Gemini（部分免费模型，低智）" textClass={muted} titleClass={text} className={linkCard}>
              <p>需要魔法网络（梯子）和非国区 Google 账号，否则可能跳转到“适用区域”提醒。免费模型只有 <strong className="text-[#3cb371]">gemma-4-31b-it</strong> 和 <strong className="text-[#3cb371]">gemma-4-26b-a4b-it</strong>。</p>
              <div className="mt-2 flex flex-wrap gap-2"><ExternalLink href="https://aistudio.google.com/api-keys?project=gen-lang-client-0413505854" label="🔑 打开页面获取 Key" /><CopyValue value="https://generativelanguage.googleapis.com/v1beta/openai/" label="复制 Base URL" /><CopyValue value="gemma-4-31b-it" label="复制 gemma-4-31b-it" /><CopyValue value="gemma-4-26b-a4b-it" label="复制 gemma-4-26b-a4b-it" /></div>
            </ProviderCard>
            <ProviderCard title="公益站渠道（免费但繁琐）" textClass={muted} titleClass={text} className={linkCard}>
              <p>这类渠道通常需要耐心完成流程，适合不急着开玩的用户：</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5"><li>注册 <strong className="text-[#5865f2]">Discord</strong> 账号并进入类脑社区（需要邀请）。</li><li>完成新人答题，不会的题目可以去 AI 问答案。</li><li>等待约 8 天缓冲期；挑战完道馆流程后，等待时间可缩短到约 3 天。</li><li>在公益站频道注册对应公益站，完成后获得免费 API。一般可以使用 Gemini 正常模型以及部分 DeepSeek V4。</li></ol>
              <div className="mt-3"><ExternalLink href="https://discord.com/" label="💬 注册 / 打开 Discord" /></div>
            </ProviderCard>
          </div>
          <div className={'mt-5 rounded-xl border-2 p-4 text-sm leading-6 ' + notice}>
            <strong>⚠ 免费模型使用提醒</strong><br />免费模型通常会出现智力较弱、吐字较慢、响应不稳定或额度变化等情况。更建议把免费模型配置到<strong>记忆官模型</strong>，主模型尽量使用稳定、速度和额度更可靠的模型。
          </div>
        </StepSection>

        <StepSection id="tutorial-step-2" number="2" title="创建或导入角色卡" card={card} text={text} muted={muted} accent="bg-[#4d9de0]">
          <p>角色卡就是你要互动的角色资料：它决定角色是谁、怎么说话、知道什么、遵守哪些规则。一个角色卡可以创建多条独立对话，删除某条对话不会删除角色卡本身。</p>
          <div className="mt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <InfoCard title="导入已有角色卡" icon="📥" textClass={muted} titleClass={text} className={soft + ' md:order-2'}>
                <ol className="list-decimal space-y-1 pl-5"><li>进入“卡包 → 角色卡”，点击“导入角色”。</li><li>选择角色卡文件，等待头像、封面和关联资料读取完成。</li><li>回到左侧点击“新建对话”，选择它就能开始游玩。</li></ol>
              </InfoCard>
              <InfoCard title="自己创建角色卡" icon="✍️" textClass={muted} titleClass={text} className={soft + ' md:order-1'}>
                <ol className="list-decimal space-y-1 pl-5"><li>点击“新建角色”，填写名字、头像、封面和开场白。</li><li>在 System Prompt 写清身份、性格、说话方式、行为边界和互动规则。</li><li>做好状态栏后，点击“保存模板 → 生成提示词”，把生成的提示词复制到角色卡的 System Prompt 中。</li><li>保存后先开一条测试对话，确认口吻再继续细调。</li></ol>
              </InfoCard>
              <div className={'rounded-xl border p-4 md:col-span-2 md:order-3 ' + code}>
                <h4 className="text-xs font-semibold">推荐的完善顺序</h4>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><StepChip label="创卡提示词" /><span>→</span><StepChip label="世界书" /><span>→</span><StepChip label="状态栏" /><span>→</span><StepChip label="拓展库（可选）" /></div>
                <p className="mt-3 text-[11px] leading-5 opacity-80">先把角色本身写清楚，再用世界书补充背景，用状态栏追踪数值，最后按玩法需要加快捷指令或图鉴。</p>
              </div>
            </div>
          </div>
        </StepSection>

        <StepSection id="tutorial-step-3" number="3" title="新建对话，直接开始游玩" card={card} text={text} muted={muted} accent="bg-[#9b7ede]">
          <p>点击左侧对话历史栏上方的“+ 新建对话”，选择角色卡并创建。之后在底部输入框发送消息，模型就会按照角色卡、世界书和状态栏设定回复你。你可以为同一角色开多条不同剧情线，互不影响。</p>
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <MockFigure title="界面图例：左侧新建对话与底部输入框" />
              <div className={'mt-3 rounded-xl border p-3 text-xs leading-5 ' + soft}><strong className={text}>怎么玩：</strong>选好角色后直接输入你想说的话；如果角色没有按预期回复，先检查模型是否连通，再检查角色卡的 System Prompt 和世界书。</div>
            </div>
            <InfoCard title="输入框左下角的快捷键" icon="🎮" textClass={muted} titleClass={text} className={soft}>
              <div className="space-y-3"><GuideItem icon={<MiniMonitorIcon />} title="思考过程" text="展开或收起模型返回的思考/分析内容。不是每个模型都会提供，关闭只影响显示。" textClass={muted} titleClass={text} /><GuideItem icon={<MiniClockIcon />} title="长期记忆" text="开启时会按设定间隔总结并保存记忆；关闭后不会进行记忆总结，也不会新增记忆条目。这个开关默认开启。" textClass={muted} titleClass={text} /><GuideItem icon={<MiniBoltIcon />} title="快捷键" text="展开或收起绑定到当前角色卡的快捷指令，例如隐藏指令或直接展示图鉴。" textClass={muted} titleClass={text} /><GuideItem icon={<MiniDownIcon />} title="回到底部" text="长对话中快速跳回最新消息和输入框。" textClass={muted} titleClass={text} /></div>
            </InfoCard>
          </div>
        </StepSection>

        <StepSection id="tutorial-step-4" number="4" title="高级功能：让长对话更稳定、更好管理" card={card} text={text} muted={muted} accent="bg-[#e39b45]">
          <p>等你已经能正常游玩后，再来调整下面这些功能。它们不是开始游戏的前置条件，默认直接开玩即可。</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <AdvancedCard title="上下文配置" icon="⚙️" textClass={muted} titleClass={text} className={soft} visual={<ContextVisual />} description="短期记忆长度决定每次发送多少轮最近对话；世界书条目上限决定每轮最多带多少设定；长期记忆条目数量决定模型能检索多少旧记忆。越大参考越多，也会占用更多上下文。" />
            <AdvancedCard title="记忆设置" icon="🧠" textClass={muted} titleClass={text} className={soft} visual={<MemoryVisual />} description="长期记忆控制是否启用记忆官和每隔几轮总结一次；记忆列表可以查看、编辑、删除条目；记忆官提示词决定副 AI 怎样提取当前轮发生的事情。" />
            <AdvancedCard title="数据导入 / 导出" icon="💾" textClass={muted} titleClass={text} className={soft} visual={<DataVisual />} description="在通用设置的数据管理中，可以备份和恢复项目数据。更换浏览器、清理网站数据或迁移设备前，建议先导出一份。" />
            <AdvancedCard title="角色导入 / 导出" icon="🗂️" textClass={muted} titleClass={text} className={soft} visual={<CharacterVisual />} description="卡包的角色卡页面可以单独导入或导出角色及其关联资料，方便分享、备份和在不同浏览器使用。" />
          </div>
          <div className={'mt-5 rounded-xl border p-4 ' + danger}><strong>小提醒：</strong>高级功能可以逐项调整，不需要一开始全部改动，熟练后可自己慢慢调整。遇到模型回复变慢，优先减少上下文长度、世界书条目数或长期记忆条目数。</div>
        </StepSection>

        <section className={'rounded-2xl border p-5 shadow-sm sm:p-6 ' + card}>
          <h2 className={'text-base font-semibold ' + text}>卡包功能速查</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><GuideItem icon="📚" title="世界书" text="按关键词把设定注入对话，适合放世界观、地点、组织和规则等资料。" textClass={muted} titleClass={text} /><GuideItem icon="📊" title="状态栏" text="追踪日期、地点、数值和角色状态，可生成提示词交给模型维护；状态栏也支持单独导入和导出。" textClass={muted} titleClass={text} /><GuideItem icon="✨" title="拓展库" text="制作快捷指令、图鉴快捷键和图鉴卡片册，按需绑定到角色卡。" textClass={muted} titleClass={text} /><GuideItem icon="📱" title="手机使用" text="在线版本可以用手机浏览器访问，也可以通过浏览器菜单添加到主屏幕。" textClass={muted} titleClass={text} /></div>
        </section>
      </div>
    </div>
  );
}

function PathBadge({ number, label, color, onClick }: { number: string; label: string; color: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-2 rounded-lg border border-black/5 bg-black/[0.03] px-3 py-2 text-left text-xs transition hover:-translate-y-0.5 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04]"><span className={'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ' + color}>{number}</span><span>{label}</span></button>;
}

function StepSection({ id, number, title, card, text, muted, accent, children }: { id: string; number: string; title: string; card: string; text: string; muted: string; accent: string; children: ReactNode }) {
  return <section id={id} className={'scroll-mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ' + card}><div className="flex items-center gap-3"><span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl font-bold text-white ' + accent}>{number}</span><h2 className={'text-lg font-semibold ' + text}>{title}</h2></div><div className={'mt-5 text-sm leading-6 ' + muted}>{children}</div></section>;
}

function ParamItem({ label, text, textClass, titleClass }: { label: string; text: string; textClass: string; titleClass: string }) {
  return <div><h5 className={'text-xs font-semibold ' + titleClass}>{label}</h5><p className={'mt-1 text-xs leading-5 ' + textClass}>{text}</p></div>;
}

function ProviderCard({ title, textClass, titleClass, className, children }: { title: string; textClass: string; titleClass: string; className: string; children: ReactNode }) {
  return <div className={'rounded-xl border p-4 ' + className}><h4 className={'text-sm font-semibold ' + titleClass}>{title}</h4><div className={'mt-2 text-xs leading-5 ' + textClass}>{children}</div></div>;
}

function InfoCard({ title, icon, textClass, titleClass, className, children }: { title: string; icon: string; textClass: string; titleClass: string; className: string; children: ReactNode }) {
  return <div className={'rounded-xl border p-4 text-xs leading-5 ' + className}><h4 className={'flex items-center gap-2 text-sm font-semibold ' + titleClass}><span>{icon}</span>{title}</h4><div className={'mt-2 ' + textClass}>{children}</div></div>;
}

function StepChip({ label }: { label: string }) { return <span className="rounded-full bg-[#3cb371]/15 px-3 py-1 text-xs font-semibold text-[#2a9a5f]">{label}</span>; }

function AdvancedCard({ title, icon, textClass, titleClass, className, visual, description }: { title: string; icon: string; textClass: string; titleClass: string; className: string; visual: ReactNode; description: string }) {
  return <div className={'rounded-xl border p-4 ' + className}><h4 className={'flex items-center gap-2 text-sm font-semibold ' + titleClass}><span>{icon}</span>{title}</h4><div className="mt-3">{visual}</div><p className={'mt-3 text-xs leading-5 ' + textClass}>{description}</p></div>;
}

function MiniPanel({ children }: { children: ReactNode }) { return <div className="rounded-lg border border-slate-200 bg-white p-3 text-slate-700 shadow-sm">{children}</div>; }
function MiniSlider({ label, value }: { label: string; value: string }) { return <div className="flex items-center gap-2 text-[10px]"><span className="w-20 shrink-0">{label}</span><span className="h-1.5 flex-1 rounded-full bg-[#8bd5a7]"><span className="block h-1.5 w-1/2 rounded-full bg-[#3cb371]" /></span><span className="w-5 text-right text-slate-500">{value}</span></div>; }
function ContextVisual() { return <MiniPanel><div className="mb-2 text-[10px] font-semibold">上下文配置</div><div className="space-y-2"><MiniSlider label="最近对话轮数" value="20" /><MiniSlider label="世界书条目数" value="3" /><MiniSlider label="记忆条目数" value="5" /></div></MiniPanel>; }
function MemoryVisual() { return <MiniPanel><div className="flex items-center justify-between text-[10px] font-semibold"><span>长期记忆</span><span className="rounded bg-[#3cb371] px-1.5 py-0.5 text-white">启用 ✓</span></div><div className="mt-2"><MiniSlider label="总结间隔" value="每轮" /></div><div className="mt-2 rounded border border-slate-200 px-2 py-1 text-[9px]">🧠 记忆列表　共 4 条　▼</div><div className="mt-1 rounded border border-slate-200 px-2 py-1 text-[9px]">记忆官提示词　保存提示词</div></MiniPanel>; }
function DataVisual() { return <MiniPanel><div className="mb-2 text-[10px] font-semibold">数据管理</div><div className="grid grid-cols-2 gap-2"><span className="rounded bg-[#d4f5d4] px-2 py-1 text-center text-[9px]">📥 导出数据</span><span className="rounded bg-[#eef2f4] px-2 py-1 text-center text-[9px]">📤 导入数据</span><span className="rounded bg-[#d4f5d4] px-2 py-1 text-center text-[9px]">导出角色包</span><span className="rounded bg-[#eef2f4] px-2 py-1 text-center text-[9px]">导入角色包</span></div></MiniPanel>; }
function CharacterVisual() { return <MiniPanel><div className="flex items-center justify-between border-b pb-2 text-[10px] font-semibold"><span>角色卡</span><span className="rounded bg-[#3cb371] px-1.5 py-0.5 text-white">新建角色</span></div><div className="mt-2 flex gap-2"><div className="h-14 w-10 rounded bg-gradient-to-b from-[#9bc7ed] to-[#d7e7f5]" /><div className="flex-1 space-y-2"><div className="h-4 rounded border" /><div className="flex gap-1"><span className="rounded bg-[#eef2f4] px-2 py-1 text-[9px]">导入角色</span><span className="rounded bg-[#fee2e2] px-2 py-1 text-[9px] text-red-600">删除角色</span></div></div></div></MiniPanel>; }

function MockInput({ label, value }: { label: string; value: string }) { return <div className="mt-2 flex items-center gap-2"><span className="w-20 shrink-0 text-[10px] opacity-70">{label}</span><span className="min-w-0 flex-1 truncate rounded border border-current/20 px-2 py-1 text-[10px]">{value}</span></div>; }

function MockFigure({ title }: { title: string }) {
  return <div className="rounded-2xl border-2 border-[#c4b3e8] bg-[#faf7ff] p-3 shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold text-slate-500">{title}</span><span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] text-slate-400">示意图</span></div><div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"><div className="flex items-center gap-2 border-b bg-slate-50 px-3 py-2"><span className="h-2 w-2 rounded-full bg-[#3cb371]" /><span className="text-[10px] font-semibold">BayouTavern Lite</span><span className="ml-auto text-[9px] text-slate-400">教程　卡包　设置</span></div><div className="grid min-h-[150px] grid-cols-[0.75fr_1.25fr] gap-2 p-3"><div className="space-y-2"><div className="h-3 w-3/4 rounded bg-slate-200" /><div className="h-3 w-full rounded bg-slate-100" /><div className="h-3 w-5/6 rounded bg-slate-100" /><div className="mt-5 h-8 rounded bg-[#d4f5d4]" /></div><div className="space-y-2 rounded-lg border border-slate-200 p-2"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold">对话输入</span><span className="rounded bg-[#3cb371] px-1.5 py-0.5 text-[8px] text-white">发送</span></div><div className="h-5 rounded border bg-slate-50" /><div className="mt-2 flex items-center gap-1"><MiniMonitorIcon /><MiniClockIcon /><MiniBoltIcon /><MiniDownIcon /></div></div></div></div></div>;
}

function MiniMonitorIcon() { return <span title="思考过程" className="flex h-6 w-6 items-center justify-center rounded text-[#8b68c7]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /><circle cx="12" cy="10" r="2" fill="currentColor" /><path d="M15 10a3 3 0 11-6 0" /></svg></span>; }
function MiniClockIcon() { return <span title="长期记忆" className="flex h-6 w-6 items-center justify-center rounded text-[#3cb371]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg></span>; }
function MiniBoltIcon() { return <span title="快捷指令" className="flex h-6 w-6 items-center justify-center rounded text-amber-500"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg></span>; }
function MiniDownIcon() { return <span title="回到底部" className="flex h-6 w-6 items-center justify-center rounded text-slate-500"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>; }

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else throw new Error('clipboard unavailable');
    } catch {
      const area = document.createElement('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1400);
  };
  return <button type="button" onClick={() => void handleCopy()} className="rounded-md border border-[#3cb371]/35 bg-[#3cb371]/10 px-2 py-1 text-[10px] font-medium text-[#2a9a5f] hover:bg-[#3cb371]/20">{copied ? '✓ 已复制' : '📋 ' + label}</button>;
}

function ExternalLink({ href, label }: { href: string; label: string }) { return <a href={href} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-[#3cb371] px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-[#2a9a5f]">{label}</a>; }

function GuideItem({ icon, title, text, textClass, titleClass }: { icon: ReactNode; title: string; text: string; textClass: string; titleClass: string }) { return <div className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center text-lg" aria-hidden="true">{icon}</span><div><h3 className={'text-sm font-medium ' + titleClass}>{title}</h3><p className={'mt-1 text-xs leading-5 ' + textClass}>{text}</p></div></div>; }
