<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **Orca Note AI Chat Plugin** - a plugin for Orca Note (a block-based note-taking application) that adds AI chat functionality. The plugin has UI + context building, and now supports OpenAI-compatible chat (including streaming + Stop).

## Build Commands

```bash
# Development with hot reload
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

The build outputs to `dist/main.js` as a single-file plugin.

## Architecture

### Plugin Lifecycle

- **Entry**: `src/main.ts` exports `load(name)` and `unload()` functions
- **Load sequence**: L10N setup → Settings schema registration → UI registration
- **Unload sequence**: Close panels → Unregister sidetools/menus/panels

### Core Modules

| Module               | Location                           | Purpose                                                                                                               |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| UI Shell             | `src/ui/ai-chat-ui.ts`             | Panel registration, sidetool, toggle/open/close logic                                                                 |
| Chat Panel           | `src/views/AiChatPanel.tsx`        | Main chat UI with two-column layout (chat + context)                                                                  |
| Context Pane         | `src/views/AiChatContextPane.tsx`  | Right column for selected context display                                                                             |
| Context Store        | `src/store/context-store.ts`       | Valtio proxy store for selected blocks/pages/tags                                                                     |
| Context Builder      | `src/services/context-builder.ts`  | Builds text preview from ContextRef items                                                                             |
| OpenAI Client        | `src/services/openai-client.ts`    | OpenAI-compatible chat completions (SSE streaming)                                                                    |
| Settings             | `src/settings/ai-chat-settings.ts` | OpenAI-compatible API settings schema                                                                                 |
| Context Menu         | `src/ui/ai-chat-context-menu.ts`   | Block/tag right-click menu entries                                                                                    |
| **Search Service**   | `src/services/search-service.ts`   | AI tool functions: searchBlocksByTag, searchBlocksByText, **queryBlocksByTag** (advanced query with property filters) |
| **Query Builder**    | `src/utils/query-builder.ts`       | Builds QueryDescription2 for complex queries                                                                          |
| **Query Converters** | `src/utils/query-converters.ts`    | Type conversion and operator mapping for query parameters                                                             |
| **Query Types**      | `src/utils/query-types.ts`         | TypeScript type definitions for query system                                                                          |

### State Management

Uses **Valtio** (available via `window.Valtio`) for reactive state:

- `uiStore`: Panel ID tracking, last root block ID
- `contextStore`: Selected context items, preview text, building state

### React Pattern

React is accessed via `window.React` (host provides it). Components use `createElement` directly without JSX in `.tsx` files because the plugin doesn't bundle React.

```typescript
const { createElement, useState } = window.React as any;
const { useSnapshot } = window.Valtio as any;
const { Button } = orca.components;
```

### Orca Plugin API

The global `orca` object provides all plugin APIs. Key patterns:

- `orca.state.*` - Reactive application state (panels, blocks, locale)
- `orca.invokeBackend(type, ...args)` - Backend calls (get-block-tree, get-blocks, etc.)
- `orca.components.*` - UI components (Button, CompositionTextArea, Menu, etc.)
- `orca.panels.registerPanel()` - Register custom panel views
- `orca.editorSidetools.registerEditorSidetool()` - Add sidebar tools
- `orca.nav.addTo()` / `orca.nav.close()` - Panel navigation

### Context System (Current Focus)

Context types (`ContextRef`):

- `block`: Single block by ID
- `page`: Entire page by root block ID
- `tag`: All blocks with a specific tag

Context flow:

1. User selects blocks/pages via right-click menu → `ai-chat-context-menu.ts`
2. `contextStore.selected` updated → triggers reactivity
3. `context-builder.ts` builds text preview using backend APIs
4. Preview displayed in `AiChatContextPane.tsx`

## File Naming Conventions

- UI registration/coordination: `src/ui/*.ts`
- React components: `src/views/*.tsx`
- State stores: `src/store/*-store.ts`
- Business logic services: `src/services/*.ts`
- Settings schemas: `src/settings/*.ts`
- Type definitions: `src/orca.d.ts`

## Development Notes

### Styling

- Use only `--orca-color-*` CSS variables for theme compatibility
- Prefer `orca.components` over custom components
- Inline styles in `createElement` calls

### Backend API Calls

```typescript
// Get block tree (includes children structure)
const tree = await orca.invokeBackend("get-block-tree", blockId);

// Get multiple blocks by IDs
const blocks = await orca.invokeBackend("get-blocks", blockIds);

// Get blocks with specific tags
const taggedBlocks = await orca.invokeBackend("get-blocks-with-tags", [
  tagName,
]);

// Search blocks by text (returns [aliasMatches, contentMatches])
const result = await orca.invokeBackend("search-blocks-by-text", searchText);

// Advanced query with property filters (NEW in v1.1.0)
const queryResult = await orca.invokeBackend("query", {
  q: {
    kind: 100, // SELF_AND
    conditions: [
      {
        kind: 4, // QueryTag
        name: "task",
        properties: [
          { name: "priority", op: 9, v: 8 }, // priority >= 8
        ],
      },
    ],
  },
  sort: [["modified", "DESC"]],
  pageSize: 50,
});
```

**Important**: Backend APIs return different data formats. Always use adapter functions:

- `unwrapBlocks()` for search results (handles `[aliasMatches, contentMatches]` tuples)
- `unwrapBackendResult<T>()` for wrapped responses (handles `[status, data]` pairs)
- See `TROUBLESHOOTING.md` for common pitfalls and solutions

### Panel Tree Traversal

Use `findViewPanelById` from `src/utils/panel-tree.ts` to locate panels in the nested panel structure.

## Current Development Status

Per `progress.md`, completed steps:

1. UI Shell (EditorSidetool, panel toggle)
2. Chat Panel (mock conversation, dual-column layout)
3. Settings (OpenAI-compatible schema)
4. Context system (block/page/tag selection, preview)
5. **Query system (Phase 1)**: Advanced query with property filters ✅

### Recent Updates (v1.1.0 - 2024-12-20)

**Query Blocks Feature - Phase 1 Completed**:

- ✅ Advanced query tool `queryBlocksByTag` with property filters
- ✅ Type conversion system for query parameters
- ✅ Query builder for QueryDescription2 format
- ✅ AI tool integration (AI can automatically filter by properties)
- ✅ Support for 10+ comparison operators (>=, >, <=, <, ==, !=, is null, etc.)

See `CHANGELOG-QUERY-BLOCKS.md` for detailed changes.

**UI/UX Enhancements by Gemini**:

- ✅ Code block with copy button
- ✅ Message hover actions
- ✅ Tool call visualization cards

**CreateBlock Tool - MCP-inspired Optimization (2024-12-22)**:

- ✅ Context-independent block creation (no specific panel required)
- ✅ Dual-path block resolution (state → backend API fallback)
- ✅ Page name support (auto-resolve to root block ID)
- ✅ Detailed error handling and logging
- ✅ Flexible parameter design (refBlockId OR pageName)

**CreateBlock Markdown Support (2024-12-24)**:

- ✅ Automatic Markdown parsing in block content
- ✅ Support for bold (`**text**`), italic (`*text*`), wiki-links (`[[page]]`), inline code (`` `code` ``)
- ✅ Uses Orca's native `core.editor.batchInsertText` command
- ✅ Backward compatible with plain text content
- ✅ No regression - all existing tests pass

**New AI Tools: createPage & insertTag (2024-12-24)**:

- ✅ `createPage` tool for creating page aliases (pages are named blocks)
- ✅ `insertTag` tool for adding tags with optional properties
- ✅ Uses Orca's native commands (`core.editor.createAlias`, `core.editor.insertTag`)
- ✅ Enables structured data management through tags
- ✅ Full wiki-link integration

**Skill System (2024-12-26)**:

- ✅ User-defined Skills via `#skill` tag
- ✅ Prompt-type Skills: appends custom system prompt
- ✅ Tools-type Skills: filters available AI tools to whitelist
- ✅ `/` trigger in chat input opens Skill picker
- ✅ SkillChip shows active skill, click X to deactivate
- ✅ Variable support (Phase 2 planned)

See `CREATEBLOCK-OPTIMIZATION.md` for MCP architecture analysis and implementation details.

Remaining: 6. Query system (Phase 2-4): Complex combinations, time ranges, advanced features 7. (Optional) Session persistence (`setData/getData`) 8. Polish (keyboard shortcuts, export, prompt templates)

## AI Tools Reference

The plugin provides the following AI tools (automatically available to AI during chat):

### 1. searchBlocksByTag

Simple tag-based search.

```typescript
searchBlocksByTag(tagName: string, maxResults?: number)
```

### 2. searchBlocksByText

Full-text search across all blocks.

```typescript
searchBlocksByText(searchText: string, maxResults?: number)
```

### 3. queryBlocksByTag (NEW)

Advanced query with property filters.

```typescript
queryBlocksByTag(tagName: string, options?: {
  properties?: Array<{
    name: string;
    op: ">=" | ">" | "<=" | "<" | "==" | "!=" | "is null" | "not null" | "includes" | "not includes";
    value?: any;
  }>;
  maxResults?: number;
})
```

**Examples**:

- Find high-priority tasks: `queryBlocksByTag("task", { properties: [{ name: "priority", op: ">=", value: 8 }] })`
- Find notes without category: `queryBlocksByTag("note", { properties: [{ name: "category", op: "is null" }] })`
- Find specific author: `queryBlocksByTag("article", { properties: [{ name: "author", op: "==", value: "张三" }] })`

### 4. createBlock (NEW - MCP-like)

Create new blocks without requiring specific UI context (MCP-inspired design).

```typescript
createBlock({
  refBlockId: number, // Reference block ID
  pageName: string, // Or page name (auto-resolves to root block)
  position: "before" | "after" | "firstChild" | "lastChild", // Default: "lastChild"
  content: string, // Block content (required)
});
```

**Key Features**:

- **Context-independent**: Works anywhere, no need for specific panel
- **Dual-path resolution**: Tries `state.blocks` first, falls back to `invokeBackend("get-block")` if needed
- **Page name support**: Can reference by page name instead of block ID
- **Markdown support**: Automatically parses Markdown syntax in content (bold, italic, links, code, etc.)
- **Detailed error handling**: Clear error messages for debugging

**Examples**:

- Create by block ID: `createBlock({ refBlockId: 12345, position: "lastChild", content: "New task item" })`
- Create by page name: `createBlock({ pageName: "项目方案", content: "新的想法" })`
- Insert before block: `createBlock({ refBlockId: 100, position: "before", content: "前置内容" })`
- **Markdown formatting**: `createBlock({ refBlockId: 100, content: "**Bold** and *italic* with [[wiki link]]" })`
- **Mixed formatting**: `createBlock({ refBlockId: 100, content: "Review [[Project A]] by *tomorrow* - priority: **HIGH**" })`
- **Inline code**: `createBlock({ refBlockId: 100, content: "Use \`npm install\` to setup" })`

**Architecture**: See `CREATEBLOCK-OPTIMIZATION.md` for detailed technical design inspired by MCP.

### 5. createPage (NEW)

Create a page alias for an existing block, making it referenceable by name.

```typescript
createPage({
  blockId: number, // Block ID to convert to page
  pageName: string, // Unique page name/alias
});
```

**Key Features**:

- **Page creation**: Converts any block into a named page
- **Alias system**: Pages are blocks with unique aliases
- **Wiki-link support**: Created pages can be referenced via `[[pageName]]`

**Examples**:

- Create page: `createPage({ blockId: 12345, pageName: "项目总结" })`
- After creation, reference via: `[[项目总结]]`

### 6. insertTag (NEW)

Add a tag to a block with optional properties (metadata).

```typescript
insertTag({
  blockId: number, // Block ID to tag
  tagName: string, // Tag name
  properties: Array<{
    // Optional properties
    name: string;
    value: any;
  }>,
});
```

**Key Features**:

- **Tag management**: Add tags for categorization
- **Property support**: Attach metadata (dates, status, priority, etc.)
- **Structured data**: Tags can carry typed properties

**Examples**:

- Simple tag: `insertTag({ blockId: 100, tagName: "task" })`
- With properties: `insertTag({ blockId: 100, tagName: "deadline", properties: [{ name: "date", value: "2024-12-31" }] })`
- Multiple properties: `insertTag({ blockId: 100, tagName: "task", properties: [{ name: "priority", value: 8 }, { name: "status", value: "in-progress" }] })`

## Skill System (NEW - 2024-12-26)

The plugin supports user-defined Skills - reusable AI behaviors that can be invoked via `/` trigger.

### Defining a Skill

Create a block with `#skill` tag and child blocks defining its properties:

```
#skill 翻译助手
  - 类型: prompt
  - 描述: 将内容翻译为目标语言
  - 提示词: 你是一个专业的翻译助手。用户发送内容后，将其翻译为{目标语言}。保持原意，语句通顺自然。
  - 变量: 目标语言
```

```
#skill 任务搜索
  - 类型: tools
  - 描述: 只使用任务相关工具
  - 工具: searchTasks, queryBlocksByTag, searchBlocksByTag
  - 提示词: 专注于帮助用户查找和管理任务
```

### Skill Types

| Type     | Behavior                                  |
| -------- | ----------------------------------------- |
| `prompt` | Appends skill prompt to system message    |
| `tools`  | Filters available tools to whitelist only |

### Skill Properties

| Property         | Required        | Description                    |
| ---------------- | --------------- | ------------------------------ |
| 类型/Type        | Yes             | `prompt` or `tools`            |
| 描述/Description | No              | Shown in picker UI             |
| 提示词/Prompt    | No              | Additional system prompt       |
| 工具/Tools       | No (tools type) | Comma-separated tool names     |
| 变量/Variables   | No              | Comma-separated variable names |

### Using Skills

1. Type `/` in chat input (at line start or after space)
2. Select a skill from the picker
3. Skill chip appears above input
4. Click X to deactivate skill

### Architecture

| File                            | Purpose                   |
| ------------------------------- | ------------------------- |
| `src/store/skill-store.ts`      | Skill state management    |
| `src/services/skill-service.ts` | Skill loading and parsing |
| `src/views/SkillPicker.tsx`     | Skill selection UI        |
| `src/views/SkillChip.tsx`       | Active skill indicator    |
