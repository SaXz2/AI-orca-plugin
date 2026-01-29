# getSavedAiConversations - 获取已保存对话

## 功能
获取已保存的AI对话记录。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ❌ | 搜索关键词 |
| maxResults | number | ❌ | 最大结果数，默认10，最大30 |
| briefMode | boolean | ❌ | 只返回标题+摘要 |

## 使用示例
```json
{}
{"query": "Python"}
{"query": "项目讨论", "maxResults": 20}
{"briefMode": true}
```

## 何时使用
- 用户问"之前聊过什么"
- 用户问"找找关于xxx的对话"
- 用户想回顾历史对话

## 注意事项
- 不提供 query 时返回最近的对话
- briefMode=true 只返回简要信息
- 只搜索已保存到笔记库的对话
