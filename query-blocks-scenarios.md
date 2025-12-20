# query_blocks 实际使用场景详解

## 概述

`query_blocks` 是 Orca 中最强大的查询工具,它使用 `QueryDescription2` 格式执行复杂查询。本文档结合实际场景,展示如何在 AI 插件中使用这个工具。

---

## 📋 核心概念回顾

### 1. 查询组 (Query Groups)

| Kind | 名称      | 逻辑     | 说明                                  |
| ---- | --------- | -------- | ------------------------------------- |
| 100  | SELF_AND  | 全部满足 | 所有条件都必须匹配                    |
| 101  | SELF_OR   | 任一满足 | 至少一个条件匹配                      |
| 106  | CHAIN_AND | 链式匹配 | 在祖先(inside)或后代(outside)中都匹配 |

### 2. 条件类型 (Condition Types)

| Kind | 类型        | 用途                         |
| ---- | ----------- | ---------------------------- |
| 3    | Journal     | 匹配日期范围内的日记块       |
| 4    | Tag         | 匹配带特定标签和属性的块     |
| 6    | Reference   | 匹配引用其他块的块           |
| 8    | Text        | 匹配包含特定文本的块         |
| 9    | Block       | 按块属性匹配(类型、父子关系) |
| 11   | Task        | 匹配任务块及完成状态         |
| 12   | Block Match | 按 ID 匹配特定块             |

### 3. 属性操作符 (根据当前库文档)

| 操作符   | Code | 适用类型         | 说明         |
| -------- | ---- | ---------------- | ------------ |
| equals   | 1    | 所有类型         | 等于         |
| !=       | 2    | 所有类型         | 不等于       |
| 包含     | 3    | 数组类型         | 包含某个值   |
| 不包含   | 4    | 数组类型         | 不包含某个值 |
| 匹配     | 5    | 文本             | 正则匹配     |
| 不匹配   | 6    | 文本             | 正则不匹配   |
| <        | 7    | Number, DateTime | 小于         |
| <=       | 8    | Number, DateTime | 小于等于     |
| >        | 9    | Number, DateTime | 大于         |
| >=       | 10   | Number, DateTime | 大于等于     |
| is null  | 11   | 所有类型         | 值为空       |
| not null | 12   | 所有类型         | 值不为空     |

---

## 🎯 实际使用场景

### 场景 1: 任务管理 - 查找高优先级未完成任务

**用户需求**: "帮我找出所有优先级大于等于 8 的未完成任务"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 100, // SELF_AND - 所有条件都要满足
      conditions: [
        {
          kind: 4, // Tag query
          name: "task",
          properties: [
            {
              name: "priority",
              op: 10, // >= 操作符
              value: 8, // 注意:必须是 number 类型,不是 "8"
              type: 3, // PropType.Number
            },
          ],
        },
        {
          kind: 11, // Task query
          completed: false, // 未完成
        },
      ],
    },
    sort: [["priority", "DESC"]], // 按优先级降序
    pageSize: 50,
  },
});
```

**关键点**:

- ✅ 使用 `kind: 100` (AND) 组合多个条件
- ✅ `priority` 值必须是 `number` 类型 (参考 `property-value-type-answer.md`)
- ✅ 结合 `QueryTag` 和 `QueryTask` 两种查询类型

---

### 场景 2: 内容检索 - 查找特定作者的草稿文章

**用户需求**: "找出张三写的所有草稿文章,按修改时间排序"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 4, // Tag query
      name: "article",
      properties: [
        {
          name: "author",
          op: 1, // equals
          value: "张三",
          type: 1, // PropType.Text
        },
        {
          name: "status",
          op: 1, // equals
          value: "draft",
          type: 6, // PropType.TextChoices
        },
      ],
    },
    sort: [["modified", "DESC"]],
    pageSize: 20,
  },
});
```

**关键点**:

- ✅ 单个 `QueryTag` 内的多个 `properties` 是 AND 关系
- ✅ 文本属性使用 `PropType.Text` (type: 1)
- ✅ 选择类属性使用 `PropType.TextChoices` (type: 6)

---

### 场景 3: 复杂组合 - 查找项目相关的所有内容

**用户需求**: "找出所有标记为'AI 项目'的块,或者引用了'AI 项目'块的内容"

**实现方案**:

```typescript
const projectBlockId = 123456; // AI项目块的 ID

const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 101, // SELF_OR - 满足任一条件即可
      conditions: [
        {
          kind: 4, // Tag query
          name: "project",
          properties: [
            {
              name: "name",
              op: 1, // equals
              value: "AI项目",
              type: 1,
            },
          ],
        },
        {
          kind: 6, // Reference query
          blockId: projectBlockId, // 引用了这个块的所有块
        },
      ],
    },
    sort: [["modified", "DESC"]],
    pageSize: 100,
  },
});
```

**关键点**:

- ✅ 使用 `kind: 101` (OR) 实现"或"逻辑
- ✅ 结合 `QueryTag` 和 `QueryReference`
- ✅ `QueryReference` 可以找到所有引用特定块的内容

---

### 场景 4: 时间范围查询 - 查找本周的日记

**用户需求**: "显示我这周的所有日记"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 3, // Journal query
      from: {
        t: 1, // 相对时间
        v: -7, // 7天前
        u: "d", // 单位:天
      },
      to: {
        t: 1,
        v: 0, // 今天
        u: "d",
      },
    },
    sort: [["created", "DESC"]],
    pageSize: 50,
  },
});
```

**日期格式说明**:

- **相对日期**: `{"t": 1, "v": -7, "u": "d"}` (7 天前)
- **绝对日期**: `{"t": 2, "v": 1640995200000}` (时间戳)
- **单位**: `s`=秒, `m`=分钟, `h`=小时, `d`=天, `w`=周, `M`=月, `y`=年

---

### 场景 5: 嵌套查询 - 查找项目下的高优先级任务

**用户需求**: "在'网站重构'项目下,找出所有优先级>5 的任务"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 106, // CHAIN_AND
      inside: true, // 在祖先中匹配
      conditions: [
        {
          kind: 4, // Tag query - 项目标签
          name: "project",
          properties: [
            {
              name: "name",
              op: 1,
              value: "网站重构",
              type: 1,
            },
          ],
        },
        {
          kind: 100, // SELF_AND - 嵌套组
          conditions: [
            {
              kind: 4, // Tag query - 任务标签
              name: "task",
            },
            {
              kind: 4, // 同一个 tag 的属性条件
              name: "task",
              properties: [
                {
                  name: "priority",
                  op: 9, // >
                  value: 5,
                  type: 3,
                },
              ],
            },
          ],
        },
      ],
    },
    sort: [["priority", "DESC"]],
    pageSize: 50,
  },
});
```

**关键点**:

- ✅ `kind: 106` (CHAIN_AND) 用于层级关系查询
- ✅ `inside: true` 表示在祖先中查找第一个条件
- ✅ 可以嵌套多层 `conditions`

---

### 场景 6: 文本搜索 + 标签过滤

**用户需求**: "在所有笔记中搜索包含'机器学习'的内容,但排除已归档的"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 100, // SELF_AND
      conditions: [
        {
          kind: 8, // Text query
          text: "机器学习",
          caseSensitive: false,
        },
        {
          kind: 4, // Tag query
          name: "note",
        },
        // 排除已归档的 (使用 NOT 逻辑)
        {
          kind: 4,
          name: "note",
          properties: [
            {
              name: "archived",
              op: 1, // equals
              value: false,
              type: 4, // PropType.Boolean
            },
          ],
        },
      ],
    },
    sort: [["modified", "DESC"]],
    pageSize: 30,
  },
});
```

**关键点**:

- ✅ `QueryText` (kind: 8) 用于全文搜索
- ✅ 布尔属性使用 `PropType.Boolean` (type: 4)
- ✅ 组合多个条件实现复杂过滤

---

### 场景 7: 查找缺失属性的块

**用户需求**: "找出所有没有设置分类的笔记"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 4, // Tag query
      name: "note",
      properties: [
        {
          name: "category",
          op: 11, // is null
          type: 1, // PropType.Text
        },
      ],
    },
    sort: [["created", "DESC"]],
    pageSize: 50,
  },
});
```

**关键点**:

- ✅ 使用 `op: 11` (is null) 查找缺失属性
- ✅ 使用 `op: 12` (not null) 查找已设置属性

---

### 场景 8: 分组统计 - 按状态统计任务

**用户需求**: "统计各状态的任务数量"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 4,
      name: "task",
    },
    groupBy: "status", // 按 status 属性分组
    stats: ["count"], // 统计数量
    pageSize: 100,
  },
});

// 结果格式:
// {
//   groups: [
//     { key: "todo", count: 15 },
//     { key: "in-progress", count: 8 },
//     { key: "done", count: 32 }
//   ]
// }
```

**关键点**:

- ✅ `groupBy` 指定分组字段
- ✅ `stats` 指定统计类型 (count, sum, avg, etc.)

---

### 场景 9: 日历视图 - 按日期展示事件

**用户需求**: "以日历形式显示本月的所有事件"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 4,
      name: "event",
      properties: [
        {
          name: "date",
          op: 10, // >=
          value: new Date("2025-12-01"),
          type: 5, // PropType.DateTime
        },
        {
          name: "date",
          op: 8, // <=
          value: new Date("2025-12-31"),
          type: 5,
        },
      ],
    },
    asCalendar: {
      dateField: "date", // 使用哪个字段作为日期
      viewType: "month", // 月视图
    },
    pageSize: 100,
  },
});
```

**关键点**:

- ✅ 日期属性使用 `PropType.DateTime` (type: 5)
- ✅ `asCalendar` 配置日历视图参数

---

### 场景 10: 表格视图 - 项目看板

**用户需求**: "以表格形式显示所有项目的关键信息"

**实现方案**:

```typescript
const result = await orca.invokeBackend("query", {
  repoId: currentRepoId,
  description: {
    q: {
      kind: 4,
      name: "project",
    },
    asTable: true, // 表格格式
    sort: [
      ["priority", "DESC"],
      ["deadline", "ASC"],
    ],
    pageSize: 50,
  },
});

// 结果会包含所有属性的表格化数据
// 可以直接用于 UI 渲染
```

---

## 🛠️ AI 工具实现建议

### 1. 智能查询构建器

```typescript
async function buildSmartQuery(userRequest: string) {
  // 根据用户自然语言构建查询
  const intent = parseUserIntent(userRequest);

  const queryBuilder = {
    conditions: [],
    sort: [],
    filters: {},
  };

  // 示例:识别时间范围
  if (intent.timeRange) {
    queryBuilder.conditions.push({
      kind: 3, // Journal
      from: intent.timeRange.from,
      to: intent.timeRange.to,
    });
  }

  // 识别标签和属性
  if (intent.tags) {
    intent.tags.forEach((tag) => {
      queryBuilder.conditions.push({
        kind: 4,
        name: tag.name,
        properties: tag.properties?.map((prop) => ({
          name: prop.name,
          op: mapOperator(prop.operator),
          value: convertValue(prop.value, prop.type),
          type: prop.type,
        })),
      });
    });
  }

  return buildFinalQuery(queryBuilder);
}
```

### 2. 类型安全的值转换

```typescript
function convertValue(value: any, propType: number): any {
  switch (propType) {
    case 3: // Number
      return typeof value === "string" ? Number(value) : value;
    case 4: // Boolean
      return typeof value === "string" ? value === "true" : value;
    case 5: // DateTime
      return value instanceof Date ? value : new Date(value);
    default:
      return value;
  }
}
```

### 3. 操作符映射

```typescript
const OPERATOR_MAP = {
  equals: 1,
  "==": 1,
  "!=": 2,
  "not equals": 2,
  includes: 3,
  contains: 3,
  "not includes": 4,
  matches: 5,
  "not matches": 6,
  "<": 7,
  "less than": 7,
  "<=": 8,
  lte: 8,
  ">": 9,
  "greater than": 9,
  ">=": 10,
  gte: 10,
  "is null": 11,
  null: 11,
  "is not null": 12,
  "not null": 12,
};

function mapOperator(op: string): number {
  return OPERATOR_MAP[op.toLowerCase()] || 1;
}
```

---

## ⚠️ 常见陷阱与解决方案

### 陷阱 1: 属性值类型不匹配

❌ **错误**:

```typescript
properties: [
  {
    name: "priority",
    value: "5", // ❌ 字符串
    type: 3, // PropType.Number
  },
];
```

✅ **正确**:

```typescript
properties: [
  {
    name: "priority",
    value: 5, // ✅ 数字
    type: 3,
  },
];
```

**参考**: `property-value-type-answer.md` - Backend 需要严格的类型匹配

---

### 陷阱 2: 忘记指定 tag name

❌ **错误**:

```typescript
{
  kind: 4, // QueryTag
  properties: [...] // ❌ 缺少 name
}
```

✅ **正确**:

```typescript
{
  kind: 4,
  name: "task", // ✅ 必须指定标签名
  properties: [...]
}
```

---

### 陷阱 3: 在非 Tag 查询中使用 properties

❌ **错误**:

```typescript
{
  kind: 9, // QueryBlock
  properties: [...] // ❌ Block 查询不支持 properties
}
```

✅ **正确**:

```typescript
{
  kind: 4, // ✅ 只有 QueryTag 支持 properties
  name: "task",
  properties: [...]
}
```

**参考**: `tag-property-query-answer.md` - 只有 `QueryTag` 支持属性查询

---

## 📊 性能优化建议

### 1. 使用分页

```typescript
// 避免一次性加载大量数据
description: {
  q: {...},
  page: 1,
  pageSize: 50, // 合理的页面大小
}
```

### 2. 精确的查询条件

```typescript
// ✅ 好:精确的条件
{
  kind: 4,
  name: "task",
  properties: [{name: "priority", op: 10, value: 8}]
}

// ❌ 差:过于宽泛
{
  kind: 8, // Text query
  text: "task" // 会搜索所有包含"task"的块
}
```

### 3. 合理使用排序

```typescript
// 只在需要时排序
sort: [["priority", "DESC"]], // 明确的排序需求
```

---

## 🎓 学习路径建议

1. **基础查询** → 从单一条件开始 (场景 1-2)
2. **组合查询** → 学习 AND/OR 逻辑 (场景 3)
3. **时间查询** → 掌握日期范围 (场景 4)
4. **层级查询** → 理解 CHAIN_AND (场景 5)
5. **高级功能** → 分组、统计、视图 (场景 8-10)

---

## 📚 相关文档

- `tag-property-query-answer.md` - 标签属性查询详解
- `property-value-type-answer.md` - 属性值类型说明
- `plugin-docs/query-api.md` - 完整 API 文档
- `plugin-docs/constants/db.md` - PropType 定义

---

## 总结

`query_blocks` 是一个功能强大但需要仔细使用的工具。关键要点:

✅ **类型安全**: 属性值必须与 PropType 匹配  
✅ **结构清晰**: 使用正确的 kind 和嵌套结构  
✅ **性能优化**: 合理使用分页和精确条件  
✅ **灵活组合**: 善用 AND/OR/CHAIN 逻辑

通过这些实际场景,你可以构建强大的 AI 搜索和查询功能! 🚀
