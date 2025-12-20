# Troubleshooting Guide

本文档记录 Orca Note AI Chat Plugin 开发过程中遇到的关键问题及解决方案。

## 搜索功能问题集 (Search Service Issues)

### 1. 搜索返回数据格式不兼容

**问题描述**：
调用 `orca.invokeBackend("search-blocks-by-text", searchText)` 时，后端返回的是包含两个数组的元组 `[aliasMatches, contentMatches]`，而代码直接将其作为单一数组处理，导致找不到块数据。

**症状**：
- 搜索工具返回空结果
- 日志显示 `Got blocks: Array(2)` 但实际块数量为 0
- AI 收到空白的搜索结果列表

**根本原因**：
Orca 的不同 API 返回不同的数据结构：
- `search-blocks-by-text`: `[aliasMatches[], contentMatches[]]`
- `get-blocks-with-tags`: 直接返回 `blocks[]` 或 `[count, blocks[]]`
- `get-block-tree`: 可能返回 `[status, tree]` 或直接返回 `tree`

**解决方案** (`src/services/search-service.ts:23-42`)：

```typescript
function unwrapBlocks(result: any): any[] {
  if (!result) return [];

  // Handle [aliasMatches, contentMatches] from search-blocks-by-text
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && Array.isArray(result[1])) {
    return [...result[0], ...result[1]];
  }

  // Handle [count, blocks] from some other APIs
  if (Array.isArray(result) && result.length === 2 && typeof result[0] === "number" && Array.isArray(result[1])) {
    return result[1];
  }

  if (Array.isArray(result)) return result;

  // If it's a single object, wrap it
  if (typeof result === "object" && result.id) return [result];

  return [];
}
```

**要点**：
- ✅ 始终使用 `unwrapBlocks()` 处理搜索 API 返回值
- ✅ 兼容多种数据格式（元组、数组、单个对象）
- ✅ 优雅降级（无效数据返回空数组）

---

### 2. 内容提取不完整（空文本问题）

**问题描述**：
搜索到的块内容为空，AI 工具返回形如 `"1. \n2. \n"` 的空列表。

**症状**：
- `r.content` 和 `r.fullContent` 均为空字符串
- 后端返回的块对象中 `block.text` 为空
- `block.content` 数组中的片段无法被正确解析

**根本原因**：
Orca 在内容片段（content fragments）中使用 `t: "t"` 作为文本类型的**简写**（通常对应 `t: "text"`），原代码只检查 `f.t === "text"`，导致简写格式被忽略。

**原有代码**（错误）：
```typescript
function safeText(block: any): string {
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) => f?.t === "text" && typeof f.v === "string" ? f.v : "")
      .join("").trim();
  }
  return "";
}
```

**修复后代码** (`src/services/search-service.ts:332-344`)：

```typescript
function safeText(block: any): string {
  if (!block) return "";
  if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) =>
        (f?.t === "text" || f?.t === "t") && typeof f.v === "string" ? f.v : "",
      )
      .join("")
      .trim();
  }
  return "";
}
```

**关键改动**：
- ✅ 同时检查 `f.t === "text"` 和 `f.t === "t"`（简写格式）
- ✅ 优先检查 `block.text` 字段（有些块直接存储文本）
- ✅ 在多个地方同步（`src/services/search-service.ts` 和 `src/views/AiChatPanel.tsx`）

**同步修改**：
`src/views/AiChatPanel.tsx:55-67` 也需要同步更新 `safeText` 函数。

---

### 3. AI 工具调用参数兼容性问题

**问题描述**：
AI 调用 `searchBlocksByText` 时传递了**数组参数** `{"queries": ["优化5"]}`，但代码期望字符串，导致搜索失败。

**症状**：
- 日志显示 `Invalid searchText: ['优化5']`
- AI 收到 "No notes found" 错误

**根本原因**：
OpenAI 函数调用（Tool Calling）可能以不同的参数格式传递：
- 字符串：`{"query": "text"}`
- 数组：`{"queries": ["text"]}`
- 字段名变化：`searchText`, `text`, `query`, `queries`

**解决方案** (`src/views/AiChatPanel.tsx:175-189`)：

```typescript
} else if (toolName === "searchBlocksByText") {
  // Support multiple parameter names: searchText, text, query, queries
  let searchText = args.searchText || args.text || args.query || args.queries;

  // Handle array parameters (AI sometimes sends ["text"] instead of "text")
  if (Array.isArray(searchText)) {
    searchText = searchText[0];
  }

  const maxResults = args.maxResults || 50;
  console.log("[executeTool] searchBlocksByText params:", { searchText, maxResults });

  if (!searchText || typeof searchText !== "string") {
    console.error("[executeTool] Missing or invalid searchText parameter, args:", args);
    return "Error: Missing search text parameter";
  }

  // ... 继续执行
}
```

**要点**：
- ✅ 支持多个可能的参数名称
- ✅ 自动解包数组参数（取第一个元素）
- ✅ 严格类型检查（确保最终是字符串）

---

## 通用经验法则 (General Lessons Learned)

### 1. 处理第三方 API 返回值
- ❌ **不要假设**返回值格式是单一的
- ✅ **总是编写**适配器函数（如 `unwrapBlocks`, `unwrapBackendResult`）
- ✅ **兼容多种格式**：数组、元组、包装对象、裸对象

### 2. 数据提取与解析
- ❌ **不要只检查**标准字段名（如 `t: "text"`）
- ✅ **考虑简写和别名**（如 `t: "t"`, `body` vs `content`）
- ✅ **优先级兼容**：先检查直接字段，再检查数组/对象字段

### 3. AI 工具调用参数处理
- ❌ **不要假设** AI 会严格按照 schema 传参
- ✅ **支持多种参数名**（同义词）
- ✅ **自动类型转换**（数组→字符串，字符串→数字）
- ✅ **详细错误日志**（打印完整 `args` 对象）

### 4. 调试策略
- ✅ 在关键数据转换点添加临时 `console.log`
- ✅ 使用 `JSON.stringify` 检查嵌套对象结构
- ✅ 修复后**立即移除**调试日志，保持代码整洁

---

## 相关文件索引

- 搜索服务实现：`src/services/search-service.ts`
- 工具调用处理：`src/views/AiChatPanel.tsx` (executeTool 函数)
- 类型定义：`src/services/search-service.ts` (SearchResult 接口)

---

## 版本历史

- **2025-12-20**: 初始版本，记录搜索功能三大核心问题
