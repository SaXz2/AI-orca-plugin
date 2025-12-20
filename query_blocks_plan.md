# query_blocks 功能实施计划

## 📝 需求确认

**目标**: 实现通用的 query_blocks 查询构建器作为 AI 工具函数，让 AI 可以通过自然语言交互搜索全库内容

**核心能力**:
- 通过 AI 交互查询任务（例如："查找优先级>=8的未完成任务"）
- 支持复杂组合查询（标签、属性、时间范围、文本搜索等）
- 取代或增强现有的简单搜索功能

---

## ✅ 可行性审查

### 1. API 支持验证

根据插件文档审查：

**✅ 后端 API 支持**:
- `orca.invokeBackend("query", description)` - **完全支持 `QueryDescription2` 格式**
- 支持的查询类型：
  - ✅ `QueryGroup2` (100-106): SELF_AND, SELF_OR, ANCESTOR_AND, DESCENDANT_AND, CHAIN_AND 等
  - ✅ `QueryTag2` (kind: 4): 标签查询 + 属性过滤
  - ✅ `QueryText2` (kind: 8): 文本搜索
  - ✅ `QueryJournal2` (kind: 3): 日期范围查询
  - ✅ `QueryRef2` (kind: 6): 引用查询
  - ✅ `QueryBlock2` (kind: 9): 块属性查询（类型、父子关系、创建/修改时间等）
  - ✅ `QueryTask` (kind: 11): 任务查询（完成状态）
  - ✅ `QueryBlockMatch2` (kind: 12): 按 ID 匹配特定块

**✅ PropType 支持** (from `plugin-docs/constants/db.md`):
- PropType.JSON = 0
- PropType.Text = 1
- PropType.BlockRefs = 2
- PropType.Number = 3
- PropType.Boolean = 4
- PropType.DateTime = 5
- PropType.TextChoices = 6

**✅ 操作符支持**:
- QueryEq = 1 (equals)
- QueryNotEq = 2 (not equals)
- QueryIncludes = 3 (includes)
- QueryNotIncludes = 4 (not includes)
- QueryHas = 5 (has)
- QueryNotHas = 6 (not has)
- QueryGt = 7 (>)
- QueryLt = 8 (<)
- QueryGe = 9 (>=)
- QueryLe = 10 (<=)
- QueryNull = 11 (is null)
- QueryNotNull = 12 (not null)

### 2. 文档场景可行性

**已验证可实现的场景** (from `query-blocks-scenarios.md`):

| 场景 | 可行性 | 备注 |
|------|--------|------|
| 场景 1: 任务管理 - 高优先级未完成任务 | ✅ 可实现 | 使用 QueryTag2 + QueryTask |
| 场景 2: 内容检索 - 查找特定作者的草稿 | ✅ 可实现 | 使用 QueryTag2 + properties |
| 场景 3: 复杂组合 - 项目相关内容 | ✅ 可实现 | 使用 QueryGroup2 (SELF_OR) |
| 场景 4: 时间范围 - 本周日记 | ✅ 可实现 | 使用 QueryJournal2 |
| 场景 5: 嵌套查询 - 项目下的任务 | ✅ 可实现 | 使用 QueryGroup2 (CHAIN_AND) |
| 场景 6: 文本搜索 + 标签过滤 | ✅ 可实现 | 使用 QueryGroup2 + QueryText2 + QueryTag2 |
| 场景 7: 查找缺失属性的块 | ✅ 可实现 | 使用 QueryTag2 + op: 11 (is null) |
| 场景 8: 分组统计 | ✅ 可实现 | 使用 groupBy + stats |
| 场景 9: 日历视图 | ✅ 可实现 | 使用 asCalendar |
| 场景 10: 表格视图 | ✅ 可实现 | 使用 asTable |

**结论**: 文档中的所有 10 个场景均可实现 ✅

### 3. 现有功能对比

**现有实现** (`src/services/search-service.ts`):
- `searchBlocksByTag(tagName, maxResults)` - 简单标签搜索
- `searchBlocksByText(searchText, maxResults)` - 简单文本搜索

**新实现的优势**:
- ✅ 支持属性过滤（例如 priority >= 8）
- ✅ 支持复杂组合查询（AND/OR/CHAIN）
- ✅ 支持时间范围查询
- ✅ 支持任务完成状态查询
- ✅ 支持分组统计
- ✅ 更强大的排序和分页

**决策**: 保留现有函数作为快速路径，新增通用查询构建器作为高级功能

---

## 🎯 实施方案

### 架构设计

```
AI 工具函数层 (AI-facing)
    ↓
查询构建器 (Query Builder)
    ↓
类型转换器 (Type Converter)
    ↓
Orca Backend API (orca.invokeBackend("query", description))
```

### 核心模块

**1. AI 工具函数** (`src/services/query-blocks-tool.ts`)
```typescript
/**
 * 通用查询构建器工具函数 - 供 AI 调用
 * @param query - 自然语言查询参数（由 AI 解析后传入）
 * @returns 查询结果
 */
export async function queryBlocks(query: QueryBlocksInput): Promise<QueryBlocksResult>
```

**2. 查询构建器** (`src/services/query-builder.ts`)
```typescript
/**
 * 将结构化查询参数转换为 QueryDescription2 格式
 */
export function buildQueryDescription(input: QueryBlocksInput): QueryDescription2
```

**3. 类型转换器** (`src/services/type-converter.ts`)
```typescript
/**
 * 将字符串值转换为正确的类型
 */
export function convertValue(value: any, propType: number): any
export function mapOperator(op: string): number
```

---

## 📋 分步实施计划

### **阶段 1: 基础查询构建器** (核心功能)

**目标**: 实现基本的标签 + 属性查询

**任务**:
1. ✅ 创建类型定义文件 `src/types/query-blocks.ts`
2. ✅ 实现类型转换器 `src/services/type-converter.ts`
3. ✅ 实现基础查询构建器 `src/services/query-builder.ts`
   - 支持 QueryTag2
   - 支持属性过滤（op: 1-12）
   - 支持排序和分页
4. ✅ 实现 AI 工具函数 `src/services/query-blocks-tool.ts`
   - `queryBlocksByTag()` - 标签查询 + 属性过滤
5. ✅ 单元测试 - 验证基本查询功能

**验收标准**:
- [ ] AI 可以调用 `queryBlocksByTag("task", { priority: { op: ">=", value: 8 } })`
- [ ] 返回正确的查询结果
- [ ] 属性值类型转换正确（例如 priority: 8 是 number，不是 "8"）
- [ ] 查询结果包含完整的块信息（id, title, content, fullContent, tags, properties）

**示例 AI 调用**:
```typescript
// AI: "查找优先级>=8的任务"
await queryBlocksByTag("task", {
  properties: [{
    name: "priority",
    op: ">=",
    value: 8
  }]
})
```

---

### **阶段 2: 复杂组合查询** (增强功能)

**目标**: 支持 AND/OR/CHAIN 组合查询

**任务**:
1. ✅ 扩展查询构建器支持 QueryGroup2
   - SELF_AND (kind: 100)
   - SELF_OR (kind: 101)
   - CHAIN_AND (kind: 106)
2. ✅ 实现组合查询 AI 工具函数
   - `queryBlocksAdvanced()` - 支持任意复杂查询
3. ✅ 单元测试 - 验证组合查询

**验收标准**:
- [ ] AI 可以调用 AND 查询（例如："查找优先级>=8 且 未完成的任务"）
- [ ] AI 可以调用 OR 查询（例如："查找标记为'项目A'或引用了项目A的块"）
- [ ] AI 可以调用 CHAIN 查询（例如："在'网站重构'项目下的所有任务"）

**示例 AI 调用**:
```typescript
// AI: "查找优先级>=8 且 未完成的任务"
await queryBlocksAdvanced({
  kind: 100, // SELF_AND
  conditions: [
    {
      kind: 4, // QueryTag
      name: "task",
      properties: [{ name: "priority", op: ">=", value: 8 }]
    },
    {
      kind: 11, // QueryTask
      completed: false
    }
  ]
})
```

---

### **阶段 3: 时间范围与文本搜索** (扩展功能)

**目标**: 支持时间范围查询和文本搜索

**任务**:
1. ✅ 实现 QueryJournal2 支持（日期范围）
2. ✅ 实现 QueryText2 支持（文本搜索）
3. ✅ 实现 QueryBlock2 支持（块属性）
4. ✅ 扩展 AI 工具函数
   - `queryBlocksByDateRange()` - 时间范围查询
   - `queryBlocksByText()` - 文本搜索（取代现有的 searchBlocksByText）
5. ✅ 单元测试

**验收标准**:
- [ ] AI 可以查询时间范围（例如："本周的日记"）
- [ ] AI 可以文本搜索 + 标签过滤（例如："包含'机器学习'的笔记"）
- [ ] 支持相对日期（例如："7天前到今天"）

**示例 AI 调用**:
```typescript
// AI: "查找本周的日记"
await queryBlocksByDateRange({
  from: { t: 1, v: -7, u: "d" },  // 7天前
  to: { t: 1, v: 0, u: "d" }       // 今天
})
```

---

### **阶段 4: 高级功能** (可选增强)

**目标**: 支持分组统计、日历视图、表格视图

**任务**:
1. ✅ 实现 groupBy 和 stats 支持
2. ✅ 实现 asCalendar 支持
3. ✅ 实现 asTable 支持
4. ✅ 扩展 AI 工具函数
   - `queryBlocksWithStats()` - 统计查询
5. ✅ 单元测试

**验收标准**:
- [ ] AI 可以统计查询（例如："按状态统计任务数量"）
- [ ] AI 可以请求日历视图（例如："以日历形式显示本月事件"）
- [ ] AI 可以请求表格视图（例如："以表格形式显示所有项目"）

---

## 🧪 测试策略

### 单元测试

**文件**: `src/services/__tests__/query-blocks-tool.test.ts`

**测试覆盖**:
1. ✅ 类型转换器测试
   - 数字转换
   - 布尔转换
   - 日期转换
   - 操作符映射
2. ✅ 查询构建器测试
   - 简单标签查询
   - 属性过滤
   - 组合查询 (AND/OR/CHAIN)
   - 时间范围查询
3. ✅ AI 工具函数测试
   - Mock orca.invokeBackend
   - 验证查询结果格式
   - 错误处理

### 集成测试

**文件**: `src/services/__tests__/query-blocks-integration.test.ts`

**测试覆盖**:
1. ✅ 端到端查询测试（使用真实数据）
2. ✅ 性能测试（大数据集查询）
3. ✅ 边界条件测试（空结果、无效参数等）

### AI 工具函数验收测试

**手动测试清单**:

**阶段 1 验收**:
- [ ] AI: "查找优先级>=8的任务" → 返回正确结果
- [ ] AI: "查找作者是张三的笔记" → 返回正确结果
- [ ] AI: "查找没有设置分类的笔记" → 使用 op: 11 (is null)

**阶段 2 验收**:
- [ ] AI: "查找优先级>=8 且 未完成的任务" → AND 查询正确
- [ ] AI: "查找标记为'项目A'或引用了项目A的块" → OR 查询正确
- [ ] AI: "在'网站重构'项目下查找优先级>5的任务" → CHAIN 查询正确

**阶段 3 验收**:
- [ ] AI: "显示本周的日记" → 时间范围查询正确
- [ ] AI: "查找包含'机器学习'的笔记，但排除已归档的" → 文本 + 标签组合正确

**阶段 4 验收**:
- [ ] AI: "按状态统计任务数量" → 分组统计正确
- [ ] AI: "以日历形式显示本月的事件" → 日历视图正确

---

## 📁 文件结构

```
src/
├── services/
│   ├── query-blocks-tool.ts       (NEW) - AI 工具函数入口
│   ├── query-builder.ts           (NEW) - 查询构建器
│   ├── type-converter.ts          (NEW) - 类型转换器
│   ├── search-service.ts          (KEEP) - 保留现有简单搜索
│   └── __tests__/
│       ├── query-blocks-tool.test.ts       (NEW)
│       ├── query-builder.test.ts           (NEW)
│       └── type-converter.test.ts          (NEW)
├── types/
│   └── query-blocks.ts            (NEW) - 类型定义
└── ...
```

---

## 🚀 实施时间线

| 阶段 | 预计工作量 | 依赖 |
|------|-----------|------|
| 阶段 1: 基础查询构建器 | 核心开发 | 无 |
| 阶段 2: 复杂组合查询 | 增强开发 | 阶段 1 |
| 阶段 3: 时间范围与文本搜索 | 扩展开发 | 阶段 2 |
| 阶段 4: 高级功能 | 可选开发 | 阶段 3 |

**推荐路径**: 按阶段逐步实施，每个阶段完成后进行验收测试，确认功能正常后再进入下一阶段。

---

## ⚠️ 潜在风险与对策

### 风险 1: 属性值类型不匹配

**问题**: AI 可能传入字符串 "8" 而不是数字 8
**对策**: 实现严格的类型转换器 (`type-converter.ts`)

### 风险 2: 查询性能问题

**问题**: 复杂查询可能导致性能下降
**对策**:
- 实施分页 (pageSize 默认 50)
- 提供性能测试
- 建议用户使用精确查询条件

### 风险 3: 文档与实际 API 不一致

**问题**: `query-blocks-scenarios.md` 是 AI 生成的，可能有错误
**对策**:
- 每个场景都进行实际测试验证
- 发现错误时更新文档

### 风险 4: AI 理解查询意图的难度

**问题**: AI 可能难以将自然语言转换为正确的查询参数
**对策**:
- 提供清晰的工具函数描述（JSON Schema）
- 提供丰富的示例
- 实现智能查询建议

---

## 📚 参考文档

- `query-blocks-scenarios.md` - 10 个实际使用场景
- `src/orca.d.ts` - 完整的 QueryDescription2 类型定义
- `plugin-docs/documents/Backend-API.md` - Backend API 文档
- `plugin-docs/constants/db.md` - PropType 和 RefType 常量
- `src/services/search-service.ts` - 现有搜索实现参考

---

## 🎯 成功标准

1. ✅ 所有 10 个文档场景均可通过 AI 工具函数实现
2. ✅ 单元测试覆盖率 >= 80%
3. ✅ 集成测试通过
4. ✅ AI 调用成功率 >= 95%（通过手动验收测试）
5. ✅ 查询性能满足要求（50 条结果 < 1s）
6. ✅ 代码通过 TypeScript 类型检查
7. ✅ 文档完善（包括 AI 工具函数使用说明）

---

## 🔄 下一步行动

**立即开始**: 阶段 1 - 基础查询构建器

**优先任务**:
1. 创建类型定义文件
2. 实现类型转换器（含测试）
3. 实现基础查询构建器
4. 实现第一个 AI 工具函数：`queryBlocksByTag()`
5. 编写单元测试
6. 执行验收测试

**问题**:
- 你希望我现在开始实施阶段 1 吗？
- 你希望一次性实施所有阶段，还是分阶段进行验收？
- 你对 AI 工具函数的接口设计有特殊要求吗（例如参数格式、返回值格式）？
