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

| Module | Location | Purpose |
|--------|----------|---------|
| UI Shell | `src/ui/ai-chat-ui.ts` | Panel registration, sidetool, toggle/open/close logic |
| Chat Panel | `src/views/AiChatPanel.tsx` | Main chat UI with two-column layout (chat + context) |
| Context Pane | `src/views/AiChatContextPane.tsx` | Right column for selected context display |
| Context Store | `src/store/context-store.ts` | Valtio proxy store for selected blocks/pages/tags |
| Context Builder | `src/services/context-builder.ts` | Builds text preview from ContextRef items |
| OpenAI Client | `src/services/openai-client.ts` | OpenAI-compatible chat completions (SSE streaming) |
| Settings | `src/settings/ai-chat-settings.ts` | OpenAI-compatible API settings schema |
| Context Menu | `src/ui/ai-chat-context-menu.ts` | Block/tag right-click menu entries |

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
const taggedBlocks = await orca.invokeBackend("get-blocks-with-tags", [tagName]);
```

### Panel Tree Traversal
Use `findViewPanelById` from `src/utils/panel-tree.ts` to locate panels in the nested panel structure.

## Current Development Status

Per `progress.md`, completed steps:
1. UI Shell (EditorSidetool, panel toggle)
2. Chat Panel (mock conversation, dual-column layout)
3. Settings (OpenAI-compatible schema)
4. Context system (block/page/tag selection, preview)

Remaining:
5. (Optional) Session persistence (`setData/getData`)
6. Polish (keyboard shortcuts, export, prompt templates)
