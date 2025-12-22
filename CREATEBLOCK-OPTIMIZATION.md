# CreateBlock Tool Optimization - MCP-like Architecture

## 概述

本次优化参考 MCP (Model Context Protocol) 的设计思路，重构了 `createBlock` AI 工具，使其能够在**任何上下文**中调用，无需依赖特定的 UI panel 或编辑器状态。

## 核心问题

### 原有实现的局限性

原来的 `createBlock` 实现依赖 `orca.state.blocks[refBlockId]` 获取引用块：

```typescript
const refBlock = orca.state.blocks[refBlockId];
if (!refBlock) {
  return `Error: Block ${refBlockId} not found`;
}
```

**问题**：
- `orca.state.blocks` 只包含当前加载在内存中的块
- 如果参考块不在当前打开的 panel 中，无法获取
- 用户必须先打开相关页面才能创建块
- 不符合 MCP 的"上下文无关"设计原则

## MCP 设计参考

### MCP 的核心特点

根据你提供的 MCP 技术分析：

```typescript
// MCP insert_markdown 工具调用
mcp--orca-note--insert_markdown({
  repoId: "虎鲸笔记库",
  refBlockId: 905,
  text: "Testing MCP tool functionality"
})
```

**关键机制**：
1. **通信协议层面**：通过 HTTP/JSON-RPC 与后端通信
2. **上下文无关**：不依赖 UI 状态，只需 `refBlockId`
3. **后端 API 调用**：直接通过 `query` 和 `insert_markdown` 等后端 API 操作数据
4. **数据一致性**：通过 ACID 事务保证数据一致性

### MCP 的查询-插入流程

```typescript
// 1. 查询：通过 QueryDescription2 定位块
{
  q: { kind: 8, text: "测试MCP工具功能" },
  pageSize: 10
}

// 2. 插入：使用获取到的 refBlockId
{
  refBlockId: 905,
  text: "Testing MCP tool functionality"
}
```

## 优化方案

### 核心思路

采用**双层获取策略**：
1. **优先使用 state**：如果块在内存中，直接使用（快速路径）
2. **降级到后端 API**：如果块不在内存，通过 `orca.invokeBackend("get-block", refBlockId)` 获取（兼容路径）

### 实现代码

```typescript
// Get reference block - try state first, then backend API (MCP-like approach)
let refBlock = orca.state.blocks[refBlockId];

if (!refBlock) {
  console.log(`[Tool] Block ${refBlockId} not in state, fetching from backend...`);
  try {
    // Fetch block from backend API (similar to MCP approach)
    refBlock = await orca.invokeBackend("get-block", refBlockId);
    if (!refBlock) {
      return `Error: Block ${refBlockId} not found in repository`;
    }
    console.log(`[Tool] Successfully fetched block ${refBlockId} from backend`);
  } catch (error: any) {
    console.error(`[Tool] Failed to fetch block ${refBlockId}:`, error);
    return `Error: Failed to fetch block ${refBlockId}: ${error?.message || error}`;
  }
}
```

### 新增功能

#### 1. 支持通过页面名称创建块

```typescript
// AI 可以这样调用
createBlock({
  pageName: "项目方案",  // 无需知道块 ID
  position: "lastChild",
  content: "新的想法"
})
```

实现逻辑：
```typescript
// If pageName is provided but no refBlockId, get the page's root block
if (!refBlockId && pageName) {
  const pageResult = await getPageByName(pageName, false);
  refBlockId = pageResult.id;
}
```

#### 2. 更灵活的参数设计

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `refBlockId` | number | 否 | 参考块 ID |
| `pageName` | string | 否 | 参考页面名称（自动获取根块） |
| `position` | string | 否 | 位置（默认：`lastChild`） |
| `content` | string | **是** | 块内容 |

**要求**：必须提供 `refBlockId` 或 `pageName` 之一

#### 3. 详细的错误处理

```typescript
// 页面不存在
Error: Page "不存在的页面" not found. Please check the page name or use refBlockId instead.

// 块不存在
Error: Block 99999 not found in repository

// 创建失败
Error: Failed to create block: [具体错误信息]
```

#### 4. 详细的日志记录

```typescript
console.log("[Tool] createBlock:", {
  refBlockId,
  pageName: pageName || "(not specified)",
  position,
  contentLength: content.length
});

console.log(`[Tool] Successfully created block ${newBlockId} ${position} block ${refBlockId}`);
```

## 与 MCP 的对比

| 特性 | MCP | 优化后的 createBlock |
|------|-----|---------------------|
| 上下文无关 | ✅ 完全独立 | ✅ 无需特定 panel |
| 后端 API | ✅ HTTP/JSON-RPC | ✅ `orca.invokeBackend` |
| 错误处理 | ✅ 超时/重试机制 | ✅ Try-catch + 详细错误 |
| 日志记录 | ✅ 完整日志 | ✅ 详细日志 |
| 页面名支持 | ❓ 未知 | ✅ 支持 |
| Markdown 解析 | ✅ 解析为块结构 | ⚠️ 待实现（Phase 2） |

## 使用示例

### 示例 1：通过块 ID 创建

```typescript
// AI 调用
createBlock({
  refBlockId: 12345,
  position: "lastChild",
  content: "这是一个新的子块"
})

// 返回
Created new block: [67890](orca-block:67890) (as last child of block 12345)
```

### 示例 2：通过页面名称创建

```typescript
// AI 调用
createBlock({
  pageName: "今日待办",
  position: "lastChild",
  content: "- [ ] 完成项目文档"
})

// 内部流程
1. 查询页面 "今日待办" → 获取根块 ID (假设为 45678)
2. 在块 45678 下创建子块
3. 返回结果
```

### 示例 3：不同位置插入

```typescript
// 在块前面插入
createBlock({ refBlockId: 100, position: "before", content: "前置内容" })

// 在块后面插入
createBlock({ refBlockId: 100, position: "after", content: "后续内容" })

// 作为第一个子块
createBlock({ refBlockId: 100, position: "firstChild", content: "第一个子块" })

// 作为最后一个子块（默认）
createBlock({ refBlockId: 100, content: "最后一个子块" })
```

## 技术架构图

```
用户请求 → AI 模型 → createBlock 工具
                          ↓
                    参数解析与验证
                          ↓
              ┌───────────┴───────────┐
              ↓                       ↓
        refBlockId 提供?         pageName 提供?
              ↓                       ↓
              是                  getPageByName()
              ↓                       ↓
        获取引用块              获取页面根块 ID
              └───────────┬───────────┘
                          ↓
                  尝试从 state 获取块
                          ↓
                    块存在？
                     /    \
                   是      否
                   ↓       ↓
              使用块   invokeBackend("get-block")
                   \       ↓
                    \  获取成功？
                     \    /    \
                      \  是     否
                       ↓ ↓      ↓
                    执行插入  返回错误
                       ↓
              invokeEditorCommand(
                "core.editor.insertBlock"
              )
                       ↓
                  返回新块 ID
```

## 未来增强

### Phase 2：Markdown 解析（参考 MCP）

MCP 的 `insert_markdown` 会解析 Markdown 语法：

```markdown
# 标题
- 列表项 1
- 列表项 2
```

解析为块结构：
```
HeaderBlock (level: 1)
├─ ListItemBlock
└─ ListItemBlock
```

**实现计划**：
1. 引入 Markdown 解析器（如 `marked` 或 `markdown-it`）
2. 将 AST 转换为 Orca 块结构
3. 支持批量插入多个块

### Phase 3：高级功能

- **批量创建**：一次调用创建多个块
- **模板支持**：支持块模板（如任务模板、会议记录模板）
- **智能位置**：根据上下文自动推荐插入位置
- **回滚机制**：支持撤销创建操作

## 性能优化

### 当前优化

1. **内存优先**：优先使用 `state.blocks`（O(1) 查找）
2. **按需加载**：只在必要时调用后端 API
3. **错误快速返回**：参数验证在前，避免不必要的 API 调用

### 潜在优化

1. **缓存机制**：缓存近期查询的块（类似 MCP 的 15 分钟缓存）
2. **批量操作**：支持一次创建多个块，减少往返次数
3. **异步优化**：并行处理多个独立的创建请求

## 测试建议

### 单元测试

```typescript
describe("createBlock", () => {
  it("should create block with refBlockId in state", async () => {
    // 测试快速路径
  });

  it("should fetch block from backend if not in state", async () => {
    // 测试后端 API 路径
  });

  it("should support pageName parameter", async () => {
    // 测试页面名称解析
  });

  it("should handle errors gracefully", async () => {
    // 测试错误处理
  });
});
```

### 集成测试

1. 在不同 panel 中测试
2. 测试跨页面块创建
3. 测试并发创建
4. 测试网络故障恢复

## 总结

本次优化成功将 `createBlock` 工具改造为 **MCP 风格的上下文无关工具**：

✅ **无需特定 UI 上下文**：可在任何地方调用
✅ **后端 API 支持**：自动降级到后端获取块
✅ **页面名称支持**：用户无需记住块 ID
✅ **详细错误处理**：友好的错误提示
✅ **完整日志记录**：便于调试和监控

这使得 AI 可以更灵活地帮助用户创建笔记内容，无论用户当前在哪个页面或 panel 中。
