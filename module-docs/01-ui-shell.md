# 模块：UI 外壳与入口（EditorSidetool / 面板注册）

## 目标与范围

提供 AI Chat 的“入口与承载容器”，包括：

- 在编辑器侧边工具栏（EditorSidetool）提供一个按钮入口
- 注册一个自定义 panel view，用于在左侧打开 AI Chat 面板
- 维护面板开/关状态与 panelId 跟踪，避免重复打开、可正确关闭

## 关联文件

- `src/main.ts`：在 `load()` 时调用注册函数
- `src/ui/ai-chat-ui.ts`：注册/反注册 + toggle/open/close 逻辑
- `src/views/AiChatSidetool.tsx`：EditorSidetool 按钮 UI
- `src/store/ui-store.ts`：保存 `aiChatPanelId`
- `src/utils/panel-tree.ts`：在 panel tree 中查找 ViewPanel

## 关键接口

### `registerAiChatUI(pluginName)`

职责：

- `orca.panels.registerPanel(viewId, renderer)`：注册面板 view
- `orca.editorSidetools.registerEditorSidetool(id, { render })`：注册入口按钮

### `toggleAiChatPanel()`

职责：

- 若已打开：关闭当前 `aiChatPanelId`
- 若未打开：通过 `orca.nav.addTo(activePanel, "left", { view, ... })` 新建左侧 panel，并记录 panelId

### `unregisterAiChatUI()`

职责：

- 若面板仍开着：先关闭
- `unregisterEditorSidetool` + `unregisterPanel`

## 数据流/交互流

1. 用户点击 EditorSidetool 按钮
2. `toggleAiChatPanel()` 判断是否已开
3. 调用 `orca.nav.addTo(..., "left")` 创建左侧面板（或 `orca.nav.close` 关闭）
4. `uiStore.aiChatPanelId` 记录当前打开的 panelId

## 已知限制

- 当前仅追踪“最后一次打开的 AI 面板 panelId”，未做多实例支持。

## 下一步

- Step 2：在右侧信息栏接入 ContextSelector（block/page/tag），并在 UI 外壳层提供“加入上下文”的入口（右键菜单）。

## 更新记录

- 2025-12-19：初始化 UI 外壳、面板注册与开关逻辑

