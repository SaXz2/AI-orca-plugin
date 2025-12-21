# 模块：搜索服务（Search Service）

## 目标与范围

提供与 Orca 后端交互的搜索功能，支持按标签、文本内容和属性过滤查询笔记。

## 关联文件

- `src/services/search-service.ts`：核心搜索服务
- `src/utils/text-utils.ts`：共享文本工具函数
- `src/utils/query-builder.ts`：查询描述构建器
- `src/utils/query-types.ts`：查询类型定义

## 数据结构

### SearchResult

```typescript
interface SearchResult {
  id: number; // Block ID
  title: string; // 标题（首行或前50字）
  content: string; // 内容预览（前200字）
  fullContent?: string; // 完整内容（树形展开）
  created?: Date;
  modified?: Date;
  tags?: string[];
  propertyValues?: Record<string, any>;
}
```

## 核心函数

| 函数                                         | 说明         |
| -------------------------------------------- | ------------ |
| `searchBlocksByTag(tagName, maxResults)`     | 按标签搜索   |
| `searchBlocksByText(searchText, maxResults)` | 按文本搜索   |
| `queryBlocksByTag(tagName, options)`         | 高级属性查询 |

## 后端 API 映射

| 函数                 | Orca Backend API        |
| -------------------- | ----------------------- |
| `searchBlocksByTag`  | `get-blocks-with-tags`  |
| `searchBlocksByText` | `search-blocks-by-text` |
| `queryBlocksByTag`   | `query`                 |

## 内部工具函数

- `unwrapBackendResult<T>`: 解包后端返回的 `[code, data]` 格式
- `unwrapBlocks`: 从各种格式中提取 block 数组
- `flattenBlockTreeToLines`: 将 block 树展平为文本行
- `extractTitle/extractContent`: 提取标题和内容预览
- `extractAllProperties`: 提取所有属性值

## 限制与注意事项

- 搜索结果按 `modified` 降序排序
- `fullContent` 最多展开 200 个子 block，深度限制 10 层
- 属性值从 `refs`、`backRefs`、`properties` 多处提取

## 更新记录

- 2025-12-21：重构使用共享 `safeText` 函数
