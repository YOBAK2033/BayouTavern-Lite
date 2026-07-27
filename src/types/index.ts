// ===== 基础枚举类型 =====

export type MessageRole = 'user' | 'assistant' | 'system';

export type ViewType = 'chat' | 'characters' | 'models' | 'worldbook';

export type ThemeMode = 'light' | 'dark';

export type WallpaperOverlayMode = 'light' | 'dark';

// ===== 核心数据模型 =====

/** AI 模型配置 */
export interface ModelConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  /** 延迟：-1 未测试, -2 超时, -3 Error/CORS, >=0 正常(ms) */
  latency: number;
  /** 模型最大上下文 Token 数，默认 4000 */
  maxContextTokens: number;
  /** 采样温度，默认 0.8 */
  temperature: number;
  /** Top-P 采样，默认 0.95 */
  topP: number;
}

/** 角色 */
export interface Character {
  id: string;
  name: string;
  /** 头像：Emoji 字符 或 data:image/...;base64,... */
  avatar: string;
  /** IndexedDB 图片资源 ID；avatar 仅保留 emoji/旧版兼容值 */
  avatarAssetId?: string;
  /** 角色卡页面封面，仅用于角色卡列表展示 */
  coverImage?: string;
  coverAssetId?: string;
  /** 预留给角色图鉴的图片资源 ID */
  galleryAssetIds?: string[];
  systemPrompt: string;
  /** 开场白：新对话开始时引导用户 */
  openingLine: string;
  /** 供记忆书记官识别的角色名列表；为空时使用 name */
  memoryRoleNames?: string[];
  /** 角色卡叙事视角，仅用于记忆摘要，不会发送 System Prompt */
  memoryViewpoint?: 'auto' | 'first-person' | 'third-person';
  /** 绑定的世界书 ID */
  worldBookId?: string;
  /** 状态栏模板 */
  statusBarTemplate?: StatusBarTemplate;
  /** 状态栏模板名称，用于编辑页显示当前绑定项 */
  statusBarTemplateName?: string;
  /** 加密角色卡包导入后的受保护标记；普通导入不会设置。 */
  protectionMode?: 'normal' | 'protected';
  protectionMeta?: {
    version: 1;
    packageId: string;
    encryptedAt: string;
    algorithm: 'AES-GCM';
  };
}

export type ImageAssetKind = 'avatar' | 'cover' | 'gallery' | 'video';

export interface ImageAssetRecord {
  id: string;
  kind: ImageAssetKind;
  mimeType: string;
  width: number;
  height: number;
  size: number;
  createdAt: number;
  hash?: string;
  blob: Blob;
}

export type ExtensionModuleType = 'model-shortcut' | 'gallery-shortcut';

export interface ExtensionModule {
  id: string;
  type: ExtensionModuleType;
  name: string;
  characterIds: string[];
  enabled: boolean;
  prompt?: string;
  galleryCardId?: string;
  showIcon?: boolean;
  icon?: string;
  buttonStyle?: 'default' | 'white' | 'black' | 'borderless' | 'green';
  createdAt: number;
  updatedAt: number;
}

export interface GalleryItem {
  id: string;
  type: 'image' | 'video';
  source: 'local' | 'remote';
  assetId?: string;
  url?: string;
  title?: string;
  caption?: string;
}

export interface GalleryRow {
  id: string;
  title: string;
  itemIds: string[];
}

export interface GalleryCard {
  id: string;
  title: string;
  characterIds: string[];
  description?: string;
  items: GalleryItem[];
  rows?: GalleryRow[];
  layout?: 'carousel' | 'stacked';
  gridRows?: number;
  hideTitle?: boolean;
  mediaTextBold?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 对话 */
export interface Conversation {
  id: string;
  title: string;
  /** 单一角色绑定 */
  characterId: string;
  /** 主AI模型 ID */
  modelId: string | null;
}

/** 对话文件夹 */
export interface ConversationFolder {
  id: string;
  name: string;
  conversationIds: string[];
  isCollapsed: boolean;
  createdAt: number;
}

/** 消息节点（扁平时间线） */
export interface MessageNode {
  id: string;
  conversationId: string;
  role: MessageRole;
  senderName: string;
  content: string;
  isArchived: boolean;
  timestamp: number;
  /** 该消息发送时激活的世界书条目 */
  activatedWorldBookEntries?: { id: string; name: string }[];
  /** 上下文 token 预估 */
  tokenEstimate?: number;
  /** 输出 token（completion） */
  tokenCost?: number;
  /** tokenCost 是否来自 API 原生返回 */
  tokenCostIsExact?: boolean;
  /** 输入 token（prompt） */
  tokenCostInput?: number;
  /** 总 token */
  tokenCostTotal?: number;
  /** 思考过程内容 */
  reasoning?: string;
  /** 状态栏快照 */
  statusBarData?: StatusBarSnapshot;
  /** 快捷键产生的隐藏指令，不显示在聊天气泡中。 */
  hidden?: boolean;
  source?: 'user' | 'shortcut' | 'gallery';
  displayType?: 'text' | 'gallery';
  gallery?: GalleryCard;
}

/** 记忆官产出的可检索记忆条目 */
export interface MemoryEntry {
  id: string;
  conversationId: string;
  timestamp: number;
  keywords: string[];
  content: string;
  source: 'ai' | 'user';
  /** 该条目覆盖的对话轮次；手动条目可不填 */
  roundRange?: { start: number; end: number };
}

/** 世界书条目 */
export interface WorldBookEntry {
  id: string;
  keys: string[];
  value: string;
  priority: number;
  /** 固定条目：无需关键词触发，每轮固定发送 */
  pinned?: boolean;
}

/** 世界书（仅手动世界书） */
export interface WorldBook {
  id: string;
  name: string;
  entries: WorldBookEntry[];
}

// ===== 副AI 配置 =====

export interface SubAIConfig {
  /** 是否开启长期记忆 */
  enabled: boolean;
  /** 副AI独立模型 ID */
  modelId: string | null;
  /** 每隔 N 轮触发一次总结 */
  triggerInterval: number;
  /** 自定义 System Prompt */
  customSystemPrompt: string;
}

// ===== 上下文组装 =====

export interface ContextAssemblyConfig {
  /** 最近保留轮数，默认 20 */
  recentRounds: number;
  /** 最大世界书条目数，默认 3 */
  maxWorldBookEntries: number;
  /** 最大记忆条目数，默认 5 */
  maxMemoryEntries: number;
}

export interface AssembledMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AssembledContext {
  messages: AssembledMessage[];
  metadata: {
    worldBookMatches: string[];
    activatedWorldBookEntries: { id: string; name: string }[];
    tokenEstimate: number;
    memoryCount: number;
  };
}

// ===== SSE =====

export interface SSEChunk {
  content: string;
  reasoning: string;
  done: boolean;
}



// ===== 状态栏 =====

export type StatusBarFieldType = 'date' | 'weekday' | 'daycount' | 'period' | 'location' | 'stat' | 'ratio' | 'text' | 'counter' | 'fixedText' | 'achievement' | 'select';

export interface StatusBarField {
  key: string;
  label: string;
  icon: string;
  color: string;
  type: StatusBarFieldType;
  max: number;
  initial: number;
  barStyle: 'solid' | 'gradient' | 'segments';
  showNumber: boolean;
  periodRounds?: number;
  characterGroup?: string;
  order?: number;
  /** Column span (1-3) */
  span?: number;
  /** Date display format; date fields are derived from the linked day counter. */
  dateFormat?: 'ymd' | 'md';
  /** Initial text for date, weekday and other text-like fields. */
  initialText?: string;
  /** Whether a period field displays its round number. */
  showRound?: boolean;
  /** Optional day counter key used for automatic date/weekday linkage. */
  linkedDayKey?: string;
  /** Achievement condition source and comparison. */
  achievementTargetKey?: string;
  achievementOperator?: 'gte' | 'lte' | 'eq' | 'contains';
  achievementValue?: string | number;
  /** Options for enum/select fields. */
  options?: string[];
  /** Number of decimal places allowed for numeric fields. */
  decimalPlaces?: 0 | 1;
}

export interface StatusBarStyle {
  background: string;
  borderColor: string;
  borderRadius: number;
  title: string;
  hideTitle?: boolean;
  columns: number;
  /** Visual treatment for the status panel. Legacy templates default to standard. */
  variant?: 'default' | 'white' | 'black' | 'borderless' | 'glass' | 'compact' | 'neon' | 'paper';
}

/** A repeatable runtime group whose field schema is configured by the template. */
export interface DynamicStatusGroup {
  id: string;
  title: string;
  icon: string;
  titleField?: string;
  iconField?: string;
  maxInstances?: number;
  /** Whether the group header (icon/title/member count) is shown. */
  showTitle?: boolean;
  fields: StatusBarField[];
}

export interface DynamicStatusInstance {
  id: string;
  name: string;
  icon?: string;
  values: Record<string, number>;
  textValues: Record<string, string>;
  lifecycle?: 'active' | 'dead' | 'left' | 'betrayed' | 'dismissed';
}

export interface StatusBarTemplate {
  fields: StatusBarField[];
  dynamicGroups?: DynamicStatusGroup[];
  style: StatusBarStyle;
  version: number;
}

export interface StatusBarSnapshot {
  values: Record<string, number>;
  textValues: Record<string, string>;
  dynamicGroups?: Record<string, DynamicStatusInstance[]>;
}

// ===== 壁纸 =====

export interface WallpaperConfig {
  image: string;
  overlayOpacity: number;
  overlayMode: WallpaperOverlayMode;
}

// ===== App 全局状态 =====

export interface AppState {
  activeView: ViewType;
  currentConversationId: string | null;
  isMobile: boolean;
  sidebarOpen: boolean;
  theme: ThemeMode;
  wallpaper: WallpaperConfig;
  boldColorize: boolean;
  debugMode: boolean;
  lowRateMode: boolean;
  /** 副AI 配置 */
  subAIConfig: SubAIConfig;
  /** 上下文配置 */
  contextConfig: ContextAssemblyConfig;
  // 高级提示词模板
  tplUserWrapper: string;
  tplIdentityAnchor: string;
  tplWorldBookPrefix: string;
  tplMemoryPrefix: string;
  tplOpeningLinePrefix: string;
}

// ===== App Action =====

export type AppAction =
  | { type: 'SET_VIEW'; view: ViewType }
  | { type: 'SET_CONVERSATION'; id: string | null }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_MOBILE'; isMobile: boolean }
  | { type: 'SET_THEME'; theme: ThemeMode }
  | { type: 'SET_WALLPAPER'; config: Partial<WallpaperConfig> }
  | { type: 'SET_BOLD_COLORIZE'; enabled: boolean }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'SET_LOW_RATE_MODE'; enabled: boolean }
  | { type: 'UPDATE_SUB_AI_CONFIG'; config: Partial<SubAIConfig> }
  | { type: 'UPDATE_CONTEXT_CONFIG'; config: Partial<ContextAssemblyConfig> }
  | { type: 'SET_ADV_TPL'; key: string; value: string };
