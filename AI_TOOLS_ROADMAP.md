# AI Tools 功能开发路线图

本文档记录 Orca Note AI 插件的工具函数（Function Calling）开发进度和实现指南。

---

## ✅ 已完成功能

### 1. 标签查询 `searchBlocksByTag`

**实现时间**: 2025-12-20
**状态**: ✅ 完成并测试通过

**功能描述**:

- 按标签名称搜索笔记块
- 支持结果排序（按修改时间倒序）
- 最多返回 50 条结果

**API 调用**:

```typescript
await orca.invokeBackend("get-blocks-with-tags", [tagName]);
```

**参数映射**:

- 接受参数名: `tagName`, `tag`, `query`（兼容多种 AI 命名）
- 可选参数: `maxResults` (默认 50)

**返回格式**:

```typescript
{
  id: number;
  title: string;        // 第一行或前50字符
  content: string;      // 前200字符预览
  modified?: Date;
  tags?: string[];
}
```

**实现文件**:

- `src/services/search-service.ts` - 搜索服务
- `src/views/AiChatPanel.tsx` - 工具定义和执行

---

### 2. 文本搜索 `searchBlocksByText`

**实现时间**: 2025-12-20
**状态**: ✅ 完成并测试通过

**功能描述**:

- 全文搜索笔记内容
- 支持关键词匹配
- 按修改时间排序

**API 调用**:

```typescript
await orca.invokeBackend("search-blocks-by-text", searchText);
```

**参数映射**:

- 接受参数名: `searchText`, `text`, `query`
- 可选参数: `maxResults` (默认 50)

**返回格式**: 同 `searchBlocksByTag`

---

## 📋 待实现功能

### 📝 基础功能

#### 3. 块属性查询 `searchBlocksByProperty`

**优先级**: 🔴 高
**Kind**: 9

**功能描述**:

- 按块的自定义属性查询（如 `author::张三`）
- 支持属性名和属性值过滤

**API 调用**:

```typescript
// 需要研究 Orca API 中的块属性查询方法
// 可能的实现方式：
await orca.invokeBackend(
  "get-blocks-with-property",
  propertyName,
  propertyValue
);
```

**实现提示**:

1. 先用 `orca.invokeBackend("get-blocks", [blockId])` 测试块数据结构
2. 查找块对象中的属性字段（可能是 `properties` 或 `attrs`）
3. 实现属性过滤逻辑
4. 添加 12 种操作符支持（`=`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `startsWith`, `endsWith`, `in`, `notIn`, `exists`）

**工具定义示例**:

```typescript
{
  name: "searchBlocksByProperty",
  description: "Search blocks by custom property (e.g., author, status, priority)",
  parameters: {
    propertyName: "string",
    propertyValue: "string",
    operator: "enum ['=', '!=', '>', '<', 'contains', ...]" // 默认 '='
  }
}
```

---

#### 4. 任务查询 `searchTasks`

**优先级**: 🔴 高
**Kind**: 11

**功能描述**:

- 查询待办事项（TODO/DOING/DONE）
- 支持按状态过滤
- 支持按截止日期过滤

**API 调用**:

```typescript
// 需要研究任务查询API
// 可能的实现：
await orca.invokeBackend("get-tasks", status); // status: "TODO" | "DOING" | "DONE" | "ALL"
```

**实现提示**:

1. 查找任务块的数据结构（可能有 `task` 或 `checkbox` 字段）
2. 实现状态过滤（未完成/进行中/已完成）
3. 支持截止日期范围查询
4. 返回任务的父块作为上下文

**工具定义示例**:

```typescript
{
  name: "searchTasks",
  description: "Search TODO tasks with optional status and date filters",
  parameters: {
    status: "enum ['TODO', 'DOING', 'DONE', 'ALL']",
    dueDateFrom: "string (YYYY-MM-DD)",
    dueDateTo: "string (YYYY-MM-DD)",
    maxResults: "number"
  }
}
```

---

#### 5. 日记查询 `searchJournals`

**优先级**: 🟡 中
**Kind**: 3

**功能描述**:

- 查询日记页面
- 支持日期范围查询
- 获取今日日记

**API 调用**:

```typescript
// 可能的API：
await orca.invokeBackend("get-journal", date); // date: "YYYY-MM-DD"
await orca.invokeBackend("get-journal-range", startDate, endDate);
```

**实现提示**:

1. 研究日记页面的命名规则和存储方式
2. 实现日期解析和范围查询
3. 添加 `getTodayJournal()` 快捷方法
4. 支持自然语言日期（"今天"、"昨天"、"本周"）

**工具定义示例**:

```typescript
{
  name: "searchJournals",
  description: "Search journal entries by date or date range",
  parameters: {
    date: "string (YYYY-MM-DD) or 'today'",
    startDate: "string (YYYY-MM-DD)",
    endDate: "string (YYYY-MM-DD)"
  }
}
```

---

#### 6. 引用查询 `searchReferences`

**优先级**: 🟡 中
**Kind**: 6

**功能描述**:

- 查找引用了某个块的所有位置
- 反向链接查询

**API 调用**:

```typescript
// 可能的API：
await orca.invokeBackend("get-block-references", blockId);
await orca.invokeBackend("get-backlinks", blockId);
```

**实现提示**:

1. 理解 Orca 的块引用机制（可能是 `((blockId))` 格式）
2. 实现双向引用查询
3. 返回引用块的上下文
4. 支持按引用类型过滤（直接引用/嵌入引用）

---

#### 7. 获取块内容 `getBlockContent`

**优先级**: 🟢 低

**功能描述**:

- 根据块 ID 获取完整内容
- 支持获取子块

**API 调用**:

```typescript
await orca.invokeBackend("get-block-tree", blockId)
await orca.invokeBackend("get-blocks", [blockId1, blockId2, ...])
```

**实现提示**:

1. 使用 `get-block-tree` 获取块及其子块
2. 递归处理子块结构
3. 格式化输出为可读文本
4. 保留缩进和层级关系

---

#### 8. 获取页面列表 `getPages`

**优先级**: 🟢 低

**功能描述**:

- 获取所有页面列表
- 支持搜索页面标题

**API 调用**:

```typescript
// 需要研究获取所有页面的API
await orca.invokeBackend("get-all-pages");
await orca.invokeBackend("search-pages", keyword);
```

**实现提示**:

1. 区分页面和普通块
2. 返回页面标题、创建时间、修改时间
3. 支持按标题搜索
4. 支持分页

---

#### 9. 创建页面 `createPage`

**优先级**: 🟢 低

**功能描述**:

- 创建新页面
- 插入初始内容

**API 调用**:

```typescript
await orca.invokeBackend("create-page", title);
await orca.invokeBackend("insert-markdown", pageId, markdown);
```

**实现提示**:

1. 创建页面并获取页面 ID
2. 插入 Markdown 格式的初始内容
3. 返回新页面的链接
4. 处理重名情况

---

#### 10. 插入内容 `insertMarkdown`

**优先级**: 🟢 低

**功能描述**:

- 在指定位置插入 Markdown 文本
- 支持插入到当前页面

**API 调用**:

```typescript
await orca.invokeBackend("insert-markdown", blockId, markdown, position);
```

**实现提示**:

1. 支持插入位置：`before`, `after`, `prepend`, `append`
2. 验证 Markdown 格式
3. 返回新创建的块 ID
4. 处理插入失败的情况

---

### ⚡ 核心功能（高级）

#### 11. AND/OR 逻辑组合查询 `advancedSearch`

**优先级**: 🔴 高
**Kind**: 100 (AND), 101 (OR)

**功能描述**:

- 支持多条件组合查询
- AND: 所有条件都满足
- OR: 任一条件满足
- 支持嵌套逻辑

**实现提示**:

1. 设计查询 DSL（Domain Specific Language）
2. 实现查询解析器
3. 将多个基础查询结果进行集合运算
4. 示例查询：`(tag:工作 AND property:priority=high) OR (tag:紧急)`

**工具定义示例**:

```typescript
{
  name: "advancedSearch",
  description: "Advanced search with AND/OR logic combinations",
  parameters: {
    query: "string - JSON query object with and/or operators",
    // 示例: { "and": [{"tag": "工作"}, {"property": {"priority": "high"}}] }
  }
}
```

---

#### 12. 祖先/后代链式查询 `searchByHierarchy`

**优先级**: 🟡 中
**Kind**: 106

**功能描述**:

- 查询某个块的所有祖先块
- 查询某个块的所有后代块
- 支持层级深度限制

**API 调用**:

```typescript
await orca.invokeBackend("get-block-tree", blockId); // 获取后代
// 祖先查询可能需要自己实现向上遍历
```

**实现提示**:

1. 使用 `get-block-tree` 获取子树（后代）
2. 实现向上遍历获取祖先链
3. 支持深度限制参数
4. 返回树形结构或扁平列表

---

#### 13. 日期范围查询 `searchByDateRange`

**优先级**: 🟡 中

**功能描述**:

- 按创建时间/修改时间范围查询
- 支持自然语言日期（本周、上月等）

**实现提示**:

1. 解析自然语言日期（使用 date-fns 或类似库）
2. 过滤块的 `created` 和 `modified` 字段
3. 支持相对日期（"最近 7 天"）
4. 组合其他查询条件

---

#### 14. 统计分析 `getStatistics`

**优先级**: 🟢 低

**功能描述**:

- 统计标签使用频率
- 统计任务完成率
- 统计笔记数量趋势

**实现提示**:

1. 聚合查询结果
2. 计算统计指标
3. 生成图表数据（返回 JSON 供前端渲染）
4. 支持按时间分组

---

## 🛠️ 实现指南

### 通用开发流程

1. **研究 Orca API**

   - 使用 `orca.invokeBackend()` 测试可用的 API
   - 查看返回的数据结构
   - 记录 API 参数和返回值

2. **实现搜索服务** (`src/services/search-service.ts`)

   - 添加新的搜索函数
   - 处理参数验证
   - 格式化返回结果
   - 添加错误处理和日志

3. **定义 AI 工具** (`src/views/AiChatPanel.tsx`)

   - 在 `TOOLS` 数组中添加工具定义
   - 编写清晰的 description（AI 会根据这个决定何时调用）
   - 定义参数 schema（JSON Schema 格式）
   - 标记必需参数

4. **实现工具执行** (`src/views/AiChatPanel.tsx` - `executeTool`)

   - 在 `executeTool` 函数中添加新的 case
   - 支持参数名的多种变体（AI 可能使用不同命名）
   - 调用搜索服务
   - 格式化结果为自然语言文本

5. **测试**
   - 构建插件：`npm run build`
   - 在 Orca Note 中重新加载
   - 用自然语言测试（如"帮我找..."）
   - 检查控制台日志
   - 验证 AI 回复

### 参数命名兼容性

为了提高 AI 的调用成功率，建议在 `executeTool` 中支持多种参数名：

```typescript
// 示例：支持多种日期参数名
const date = args.date || args.day || args.when || args.time;
const status = args.status || args.state || args.condition;
```

### 错误处理

```typescript
try {
  // API 调用
} catch (error) {
  console.error(`[functionName] Error:`, error);
  return `Error: ${error?.message || "Unknown error"}`;
}
```

### 日志规范

使用统一的日志前缀便于调试：

```typescript
console.log("[functionName] Called with:", args);
console.log("[functionName] API result:", result);
console.log("[functionName] Formatted output:", output);
```

---

## 📊 开发进度

- ✅ 已完成: 2/10 基础功能
- 🚧 进行中: 0
- 📋 待开发: 8 基础功能 + 4 高级功能

**下一步建议**:

1. 实现 `searchBlocksByProperty`（块属性查询）- 应用广泛
2. 实现 `searchTasks`（任务查询）- 用户需求高
3. 实现 `searchJournals`（日记查询）- 完善日常使用

---

## 🔗 相关文档

- [Orca Plugin API](../src/orca.d.ts) - TypeScript 类型定义
- [CLAUDE.md](../CLAUDE.md) - 项目架构说明
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling) - 官方文档

---

_最后更新: 2025-12-20_
