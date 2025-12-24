# Project Context

## Purpose

**Orca Note AI Chat Plugin** - 为 Orca Note（块级笔记应用）添加 AI 聊天功能的插件。

**核心功能：**
- OpenAI 兼容的 AI 对话接口（支持流式传输）
- 智能上下文管理（选择块/页面/标签作为对话上下文）
- 高级查询系统（支持属性过滤的复杂查询）
- AI 工具集成（块搜索、创建、查询等）
- 双栏布局 UI（聊天 + 上下文预览）

**用户场景：**
- 与 AI 讨论笔记内容，AI 可搜索/创建/查询笔记块
- 通过右键菜单选择上下文，AI 可直接访问选中的块内容
- 使用高级查询过滤笔记（如：优先级 >= 8 的任务）

## Tech Stack

**核心技术：**
- **TypeScript 5.2+** - 严格模式，完整类型检查
- **React 18.2** (via `window.React`) - 宿主环境提供，插件不打包
- **Valtio 1.13** (via `window.Valtio`) - 响应式状态管理
- **Vite 5.2** - 开发服务器和构建工具
- **SWC** - 快速 React 编译

**构建配置：**
- 单文件输出：`dist/main.js` (ESM 格式)
- 外部依赖：React 和 Valtio 由宿主提供
- 插件 API：全局 `orca` 对象

**运行时依赖：**
- Orca Note 应用（提供 Plugin API、React、Valtio）
- OpenAI 兼容的 API 服务（用户配置）

## Project Conventions

### Code Style

**文件命名：**
- UI 注册/协调层：`src/ui/*.ts`
- React 组件：`src/views/*.tsx`
- 状态 Store：`src/store/*-store.ts`
- 业务逻辑服务：`src/services/*.ts`
- 工具函数：`src/utils/*.ts`
- 配置 Schema：`src/settings/*.ts`
- 类型定义：`src/orca.d.ts`

**React 模式：**
```typescript
// ❌ 不使用 JSX
// ✅ 使用 createElement
const { createElement, useState } = window.React as any;
const { useSnapshot } = window.Valtio as any;
const { Button } = orca.components;
```

**样式约定：**
- 仅使用 `--orca-color-*` CSS 变量（主题兼容）
- 优先使用 `orca.components` 组件库
- 内联样式写在 `createElement` 调用中

**命名规范：**
- 组件：PascalCase (`AiChatPanel`)
- 函数/变量：camelCase (`buildContext`, `selectedBlocks`)
- Store：kebab-case 文件名 (`context-store.ts`)
- 常量：UPPER_SNAKE_CASE (`MAX_RESULTS`)

**代码注释：**
- **中文注释**（与现有代码库一致）
- JSDoc 用于公共 API 和复杂逻辑
- 内联注释用于非显而易见的实现细节

### Architecture Patterns

**插件生命周期：**
```typescript
export async function load(name: string) {
  // L10N → Settings → UI Registration
}

export async function unload() {
  // Close Panels → Unregister
}
```

**状态管理模式（Valtio）：**
```typescript
// ✅ 使用 proxy 创建响应式 store
export const uiStore = proxy({ panelId: null });

// ✅ 组件中使用 useSnapshot 读取
const snap = useSnapshot(uiStore);
```

**后端 API 调用模式：**
```typescript
// ✅ 始终使用适配器函数处理响应
const blocks = unwrapBlocks(await orca.invokeBackend("get-blocks", ids));
const result = unwrapBackendResult<T>(await orca.invokeBackend(...));
```

**分层架构：**
```
UI Layer (src/ui/*.ts, src/views/*.tsx)
    ↓
Service Layer (src/services/*.ts)
    ↓
Store Layer (src/store/*-store.ts)
    ↓
Utils Layer (src/utils/*.ts)
    ↓
Orca Plugin API (global orca object)
```

**关注点分离：**
- **UI**: 仅处理渲染和用户交互
- **Service**: 业务逻辑和外部 API 调用
- **Store**: 状态管理和响应式更新
- **Utils**: 纯函数工具和类型转换

### Testing Strategy

**测试框架：**
- 纯 TypeScript 测试（无额外框架依赖）
- 自定义测试运行器：`scripts/run-tests.mjs`

**测试组织：**
- 测试文件：`tests/*.test.ts`
- 测试命名：`describe` + `it` 模式
- 断言：自定义 `assertEqual`、`assertTrue` 等

**测试覆盖：**
- ✅ Query Builder (`query-builder.test.ts`)
- ✅ Query Converters (`query-converters.test.ts`)
- ✅ Advanced Query (`query-advanced.test.ts`)
- ✅ Query Reference (`query-reference.test.ts`)
- ✅ Markdown Renderer (`markdown-renderer.test.ts`)

**运行测试：**
```bash
npm run test
```

### Git Workflow

**分支策略：**
- `main` - 稳定分支，所有 PR 合并到这里
- Feature 分支：直接在 main 上开发或创建临时分支

**提交约定：**
- 简洁的中文 commit message
- 描述"为什么"而非"做了什么"
- 示例：`优化跳转`、`优化成功`

**部署流程：**
```bash
npm run build       # 构建 dist/main.js
./deploy.bat        # Windows 部署脚本
```

## Domain Context

**Orca Note 核心概念：**

**Block（块）：**
- Orca Note 的基本单位，类似 Notion 的 block
- 每个块有唯一 ID、内容、属性、标签
- 块之间形成父子树状结构

**Page（页面）：**
- 根块（root block）及其所有子块的集合
- 每个页面有唯一的根块 ID

**Tag（标签）：**
- 块可以附加标签（如 `#task`、`#note`）
- 标签可以有属性（如 `task::priority=8`）

**Property（属性）：**
- 标签的键值对（如 `priority: 8`、`status: "done"`）
- 支持多种类型：数字、文本、日期、布尔等

**Context System（上下文系统）：**
- `ContextRef` 类型：`block` | `page` | `tag`
- AI 聊天可访问用户选中的上下文
- 右键菜单添加块/页面/标签到上下文

**Query System（查询系统）：**
- `QueryDescription2` - Orca 后端查询格式
- 支持复杂条件组合（AND/OR）
- 支持属性过滤（>=、>、<=、<、==、!=、is null 等）

## Important Constraints

**技术约束：**
1. **不能打包 React/Valtio** - 必须使用 `window.React` 和 `window.Valtio`
2. **单文件输出** - 构建必须输出单个 `dist/main.js`
3. **仅 ESM 格式** - 不支持 CommonJS
4. **严格类型检查** - TypeScript strict mode 必须开启
5. **主题兼容** - 仅使用 `--orca-color-*` CSS 变量

**API 约束：**
1. **后端 API 格式不一致** - 必须使用适配器函数（`unwrapBlocks`、`unwrapBackendResult`）
2. **响应式数据** - 必须通过 `useSnapshot` 读取 Valtio store
3. **面板生命周期** - 必须正确注册/注销面板和侧边栏工具

**性能约束：**
1. **上下文大小限制** - 避免一次性加载过多块内容
2. **流式传输** - AI 响应必须使用 SSE 流式传输
3. **响应式更新** - 避免不必要的 re-render

## External Dependencies

**Orca Plugin API（`global orca`）：**
- `orca.state.*` - 应用状态（panels, blocks, locale）
- `orca.invokeBackend(type, ...args)` - 后端调用
- `orca.components.*` - UI 组件库
- `orca.panels.registerPanel()` - 面板注册
- `orca.editorSidetools.registerEditorSidetool()` - 侧边栏工具
- `orca.nav.addTo()` / `orca.nav.close()` - 导航 API

**OpenAI Compatible API：**
- 用户配置的 API endpoint
- 支持 `/v1/chat/completions`
- SSE 流式传输格式
- 支持 Function Calling（AI Tools）

**宿主环境提供：**
- `window.React` (v18.2+)
- `window.Valtio` (v1.13+)
- CSS 变量系统（`--orca-color-*`）

**开发依赖：**
- Vite - 开发服务器和构建
- SWC - React 快速编译
- TypeScript - 类型检查
- rollup-plugin-external-globals - 外部依赖映射
