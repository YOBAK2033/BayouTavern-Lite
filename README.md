# BayouTavern Lite 经典版

一个以浏览器为运行环境、以本地数据为优先的 AI 角色互动沙盒。项目面向喜欢角色卡、世界书、状态追踪和长期记忆的用户，提供一个可以直接游玩的轻量化界面。

> 本仓库保留经典版程序与历史数据格式。新版 **BayouTavern Lite 2.0** 已独立发布在 [BayouTavern-Lite-2.0](https://github.com/YOBAK2033/BayouTavern-Lite-2.0)，两者是不同程序，请按需要选择。旧 Release 的数字标签是历史构建编号，不代表新版 2.0。
>
> 作者与维护：**Bayaga_x256**。

## 在线使用与下载

- 在线网页：[BayouTavern Lite](https://yobak2033.github.io/BayouTavern-Lite/)
- 单文件 HTML：[最新 Release](https://github.com/YOBAK2033/BayouTavern-Lite/releases/latest)
- 源代码：[YOBAK2033/BayouTavern-Lite](https://github.com/YOBAK2033/BayouTavern-Lite)

GitHub Pages 自动发布生产构建结果；标记一个 `v*` 版本号后，GitHub Actions 会自动生成 Release，并附带可下载的 `BayouTavern-Lite.html`。

## 项目定位

经典版是纯前端应用：

- 角色卡、世界书、对话、记忆、状态栏和拓展库数据默认保存在当前浏览器的 IndexedDB。
- 主模型与记忆官模型可以分别配置，API Key 不会随数据导出。
- 可以使用兼容 OpenAI Chat Completions 格式的模型服务，包括 DeepSeek 及其他兼容服务。
- 可以部署到 GitHub Pages，也可以构建成单个 HTML 文件在本地打开。
- 支持桌面端和手机浏览器布局，并提供 PWA manifest 与 Service Worker。

应用不会代替模型服务商保存或管理 API Key。用户填写的 API 配置会保留在本地浏览器中，请不要在公共设备上填写自己的密钥。

## 主要功能

### 角色卡与卡包

- 创建、编辑、删除和导入角色卡。
- 角色头像、封面支持本地保存和压缩。
- 角色卡可以绑定世界书、状态栏、快捷键和图鉴。
- 删除角色卡时按确认后的级联规则处理其关联数据。
- 支持角色卡包导入、导出与分享。

### 对话与模型

- 基于角色卡创建多个独立对话。
- 对话历史、删除和对话管理保持同步。
- 主模型 API 配置与记忆官模型配置互不影响。
- 支持流式 SSE 回复、思考过程显示/隐藏、重新生成和错误提示。
- 支持短期上下文、世界书注入和长期记忆条目。

### 世界书与记忆官

- 世界书按关键词和绑定关系注入上下文。
- 记忆官可以按设定间隔总结当前轮次的信息。
- 记忆列表支持查看、编辑、删除；删除对话时会同步删除对应记忆条目。
- 导入数据前支持快照/失败回滚，并进行基本 schema 校验。

### 状态栏

- 可视化搭建固定字段、固定角色组和可实例化的动态组。
- 支持单人、多人、动态多人等预设，并允许继续修改字段。
- 支持日期、星期和天数联动，字段类型包括文本、枚举、计数、进度、成就等。
- 支持多种卡片样式、列数、角色图标和预览。
- 状态栏配置可生成可编辑的系统提示词，配置本身作为唯一 schema。

### 拓展库

- 快捷键指令：发送模型可见或隐藏的指令。
- 图鉴快捷键：不经过模型，直接在对话中发送图鉴卡片。
- 图鉴卡片册：支持图片、GIF 和视频，可配置标题、媒体说明、多行多列布局和在线/本地媒体。
- 快捷键样式、前缀显示和角色绑定可以统一管理。
- 修改已绑定的拓展项后，会同步到对应角色卡和已有对话。

### 数据管理

- 完整数据导入/导出。
- 单个角色卡包导入/导出，包括其关联配置、对话和记忆。
- 导出时自动剔除主模型与记忆官模型的 API Key。
- 导入失败时保留快照并支持回滚，避免半导入状态污染现有数据。

## 单文件 HTML 与 PWA 的区别

运行 `npm run build` 后会生成 `dist/index.html`。构建脚本会将 JavaScript、CSS、欢迎动图和捐赠二维码一并内嵌，因此 `dist/index.html` 可以作为真正的单文件版本发布。

- 单文件 HTML：适合下载、备份和直接分享；不依赖项目源码。
- GitHub Pages：适合长期在线使用，支持 Service Worker、PWA 安装和自动更新。
- PWA 功能需要 HTTPS 或 localhost；直接用 `file://` 打开时不会注册 Service Worker，但核心前端功能仍可尝试运行，具体取决于浏览器对本地文件 IndexedDB 的支持。

## 本地开发

要求 Node.js 18 或更高版本。

```bash
npm install
npm run dev
```

生产构建和测试：

```bash
npm test
npm run build
npm run preview
```

构建产物：

```text
dist/index.html             # 内嵌资源的单文件版本
dist/manifest.webmanifest   # PWA 清单
dist/sw.js                  # Service Worker
dist/welcome.gif             # Pages/PWA 使用的静态资源副本
dist/donate-qr.jpg          # Pages/PWA 使用的静态资源副本
```

## GitHub 自动部署

`.github/workflows/deploy.yml` 在推送到 `main` 后自动执行：

1. 安装依赖。
2. 运行测试。
3. 构建单文件版本。
4. 将 `dist/` 发布到 GitHub Pages。

创建版本 Release：

```bash
# 新发布使用经典版标签；已有历史标签保留
git tag v1-classic.1
git push origin v1-classic.1
```

`.github/workflows/release.yml` 会测试并构建项目，然后把单文件命名为 `BayouTavern-Lite.html` 上传到 GitHub Release。

## 项目结构

```text
./
├── index.html
├── package.json
├── vite.config.js
├── public/                    # manifest、Service Worker、静态媒体
├── scripts/                   # 单文件构建辅助脚本
├── src/
│   ├── components/            # 聊天、卡包、设置、状态栏、拓展库等 UI
│   ├── db/                    # IndexedDB/localForage 数据层与写入锁
│   ├── hooks/                 # 全局状态、对话、模型、记忆等业务逻辑
│   ├── types/                 # TypeScript 类型
│   └── utils/                 # SSE、状态栏、数据传输等工具
└── .github/workflows/
    ├── deploy.yml             # GitHub Pages 自动部署
    └── release.yml            # 单文件 HTML Release
```

## 存储、隐私与安全边界

- 数据主要存储在浏览器 IndexedDB；清除站点数据会删除本机数据，请先导出备份。
- `localStorage` 只保存少量界面偏好，例如主题、快捷键样式和显示选项。
- 导出数据不包含模型 API Key。
- 在线图片、GIF、视频依赖第三方 URL 的稳定性、跨域策略和防盗链设置；重要素材建议上传本地或使用稳定 CDN。
- 角色卡和 AI 生成内容由使用者自行负责，请遵守所在地法律法规及模型服务商的使用协议。

## 使用声明与免责

本项目由 Bayaga_x256 创建并负责后续维护，开发参考了 B 站 Up 橙橙乔乔的 [Easy酒馆Pro](https://github.com/muqiao1234-ui/easy-jiuguan-pro)，在此表示感谢。

本项目仅提供浏览器端工具，不对模型生成内容作保证、背书或事实判断。请勿将本项目用于违法违规用途，也请注意保护自己的 API Key、角色卡和私人对话数据。

项目唯一正版官方发布渠道为 B 站 Bayaga_x256。

## 许可证

MIT License。项目中的第三方依赖遵循各自许可证。
