# insertTag - 添加标签

## 功能
为指定块添加标签，可同时设置标签属性。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| blockId | number | ✅ | 目标块ID |
| tagName | string | ✅ | 标签名，不带#号 |
| properties | array | ❌ | 标签属性数组 |

## properties 格式
```json
[
  {"name": "属性名", "value": "属性值"},
  {"name": "状态", "value": "进行中"}
]
```

## 使用示例
```json
{"blockId": 12345, "tagName": "Task"}
{"blockId": 12345, "tagName": "book", "properties": [{"name": "状态", "value": "reading"}]}
{"blockId": 12345, "tagName": "project", "properties": [{"name": "优先级", "value": "高"}, {"name": "截止日期", "value": "2024-12-31"}]}
```

## 何时使用
- 用户要求"给笔记打标签"
- 用户说"标记为xxx"
- 用户要求添加分类

## 注意事项
- tagName 不需要带 `#` 号
- 属性名和值需要与标签架构匹配
- 如果块已有该标签，可能会覆盖属性
