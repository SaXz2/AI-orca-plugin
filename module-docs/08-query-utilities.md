# 模块：查询工具链（Query Utilities）

## 目标与范围

提供查询构建、过滤器解析、值转换等工具函数，支持 `queryBlocksByTag` 的高级查询功能。

## 关联文件

| 文件                               | 职责             |
| ---------------------------------- | ---------------- |
| `src/utils/query-types.ts`         | 类型定义与常量   |
| `src/utils/query-filter-parser.ts` | 过滤器字符串解析 |
| `src/utils/query-builder.ts`       | 查询描述构建     |
| `src/utils/query-converters.ts`    | 操作符与值转换   |
| `src/utils/text-utils.ts`          | 共享文本工具     |

## query-types.ts

### 常量

```typescript
export const PropType = {
  Text: 0,
  Number: 1,
  Boolean: 5,
  // ...
};
```

### 类型

- `QueryOperatorString`: `">="|">"|"<="|"<"|"=="|"!="|"is null"|"not null"|...`
- `QueryPropertyFilterInput`: 过滤器输入对象
- `QuerySortInput`: 排序输入
- `QueryBlocksByTagOptions`: 查询选项

## query-filter-parser.ts

### parsePropertyFilters

```typescript
function parsePropertyFilters(input: unknown): QueryPropertyFilterInput[];
```

解析多种格式的过滤器输入：

- 字符串: `"priority >= 8 and category is null"`
- 数组: `[{ name: "priority", op: ">=", value: 8 }]`
- 对象: `{ name: "priority", op: ">=", value: 8 }`

支持的分隔符：`,`、`;`、`&&`、`and`、`且`、`并且`

## query-builder.ts

### buildQueryDescription

```typescript
function buildQueryDescription(input: BuildQueryInput): QueryDescription2;
```

构建符合 Orca 后端 `query` API 的查询描述对象。

## query-converters.ts

### mapOperator

将字符串操作符转换为数字代码：

- `"=="` → 1, `"!="` → 2
- `">="` → 7, `">"` → 8, `"<="` → 9, `"<"` → 10
- `"is null"` → 11, `"not null"` → 12

### convertValue

根据属性类型转换值（Number、Boolean、Text）。

## text-utils.ts（共享）

### safeText

```typescript
function safeText(block: any): string;
```

从 block 对象提取文本，支持 `text` 字段和 `content` 数组格式。

### nowId

```typescript
function nowId(): string;
```

生成唯一 ID：`${Date.now()}-${random}`

## 更新记录

- 2025-12-21：新增 `text-utils.ts`，整合重复的 `safeText` 函数
