# searchNotes - 全文搜索笔记

## 功能
在用户的笔记库中进行全文搜索，支持多关键词查询和相关性排序。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| queries | string \| string[] | ❌ | 搜索关键词，字符串或数组。字符串会按空格/逗号自动分词 |
| query | string | ❌ | (兼容旧参数) 搜索关键词 |
| combineMode | "and" \| "or" | ❌ | 组合模式：or=匹配任一关键词(默认)，and=匹配所有关键词 |
| topic | string | ❌ | 聚焦主题，优先返回包含该主题的结果 |
| maxResults | number | ❌ | 最大结果数，默认50，最大100 |
| sortBy | "relevance" \| "modified" \| "created" | ❌ | 排序方式，默认 relevance |

## 使用示例
```json
// 单词搜索（兼容旧用法）
{"query": "会议记录"}

// 多词 OR 搜索（匹配任一关键词，返回更多结果）
{"queries": ["项目A", "进度", "deadline"]}

// 多词 AND 搜索（匹配所有关键词，更精确）
{"queries": ["项目A", "进度"], "combineMode": "and"}

// 带主题聚焦（优先返回包含主题的结果）
{"queries": ["任务", "完成"], "topic": "本周工作"}

// 完整参数示例
{
  "queries": ["React", "hooks", "状态管理"],
  "combineMode": "or",
  "topic": "前端开发",
  "maxResults": 100,
  "sortBy": "relevance"
}
```

## 何时使用
- 用户要求"搜索"、"查找"、"找一下"某些内容
- 用户想知道笔记库中有哪些关于某主题的内容
- 不确定内容在哪个页面时
- 需要同时搜索多个相关关键词时

## 注意事项
- 搜索结果默认按相关性排序，匹配更多关键词的结果排名更高
- 返回的是块级内容，包含所在页面信息
- 如果用户提供了 `[[页面名]]` 格式，应该用 `getPage` 而不是搜索
- 结果包含 `matchedKeywords`（匹配的关键词）和 `relevanceScore`（相关性分数 0-100）
