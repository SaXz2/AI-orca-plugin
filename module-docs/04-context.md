# 模块：上下文读取与选择（block / page / tag）

## 目标与范围

完成 Step 2：让用户能在 AI 面板中选择要提供给 AI 的上下文，并生成可预览的“上下文纯文本”，包括：

- block：读取指定 block 的树（含子块）并转成文本
- page：读取当前活动页面（root block）并转成文本
- tag：读取指定 tag 下的 blocks 并拼接成文本
- 右键菜单：在 block/tag 的右键菜单中“一键加入 AI Context”，并自动打开 AI 面板

## 关联文件

- `src/store/context-store.ts`：上下文选择状态（selected/preview）
- `src/services/context-builder.ts`：读取与转文本（`get-block-tree` / `get-blocks-with-tags`）
- `src/views/AiChatContextPane.tsx`：ContextSelector + Build Preview UI
- `src/ui/ai-chat-context-menu.ts`：block/tag 右键菜单命令
- `src/ui/ai-chat-ui.ts`：记录 `lastRootBlockId`，并在需要时自动打开面板

## 数据结构

`ContextRef`（简化）：

- `block`: `{ kind: "block", blockId }`
- `page`: `{ kind: "page", rootBlockId }`
- `tag`: `{ kind: "tag", tag }`

去重 key：

- `block:${blockId}` / `page:${rootBlockId}` / `tag:${normalizedTag}`

## 读取与转文本策略

### block / page：`get-block-tree`

- 调用：`orca.invokeBackend("get-block-tree", id)`
- 转文本：递归遍历 tree，尽可能读取 `text`，否则尝试从 `content` fragments 提取（仅做最小可读格式）
- 注意：部分情况下 `get-block-tree` 的 children 可能是“ID 列表”（而不是完整 block 对象）；此时会额外用 `get-blocks` 批量补齐缺失 blocks，以保证预览能展示子块内容
- 限制保护：
  - `maxBlocks`（默认 200）
  - `maxDepth`（默认 8）
  - `maxChars`（默认 40k，超出截断并附带说明）

### tag：`get-blocks-with-tags`

- 调用：`orca.invokeBackend("get-blocks-with-tags", [tagName])`
- 转文本：对每个命中的 block 输出一行标题，并展开其子树（通过 `get-block-tree` + 必要时 `get-blocks` 补齐缺失 blocks）
- tag 规范化：允许输入 `#tag` 或 `tag`，统一去掉 `#`

## UI（ContextSelector）

入口与行为：

- `Add Context`：一个统一区域，通过下拉选择类型：
  - `Block`：选择 block（若选中的是 page root，会自动作为 page context）
  - `Page`：可直接 `Use Current Page`，或选择一个 blockId（若不是 page root，会降级为 block context）
  - `Tag`：输入 tag 名称（支持 `#tag`）
- `Expand more`：开关控制限制策略（默认有限制；开启后扩大 maxBlocks/maxDepth/maxChars/maxTagRoots，可能更慢）
- `Build Preview`：调用 builder 生成 `previewText`，展示在只读文本框中（并显示当前 limitMode）
- `Clear`：清空已选 contexts 与预览

## 右键菜单

- Block 菜单：`Add to AI Context`
  - 加入 block context
  - 记录 `rootBlockId` 到 `uiStore.lastRootBlockId`
  - 自动打开 AI 面板
- Tag 菜单：`Add to AI Context`
  - 从 `tagBlock.aliases[0]` / `tagBlock.text` 推导 tag 名
  - 加入 tag context
  - 自动打开 AI 面板

## 已知限制

- `get-block-tree` 返回结构在不同版本可能差异（当前实现做了多字段兼容与降级处理）。
- tag 读取会对命中的 blocks 逐个请求 `get-block-tree` 并展开子树；当命中数量很大时可能较慢（建议先用默认限制，必要时再开启 `Expand more`）。

## 去重规则（自动）

- 如果已选择某个 page context，则再添加该 page 内部的普通 block 会被自动跳过（提示 “already covered by selected page context”）。

## 下一步

- Step 3：把 `previewText` 与 prompt/history 一起组装为 messages，接入 OpenAI-compatible API，并支持流式输出。

## 更新记录

- 2025-12-19：完成 ContextSelector、读取与预览、block/tag 右键菜单入口
- 2025-12-19：统一 Add Context 区域（block/page/tag）、tag 默认展开子树、增加 Expand more 开关与 page 覆盖去重
- 2025-12-19：修复 page/block 预览可能显示 `(empty)`：当子块未加载到 `orca.state.blocks` 时，自动用 `get-blocks` 补齐后再生成预览
