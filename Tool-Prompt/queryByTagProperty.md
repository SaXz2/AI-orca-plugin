# queryByTagProperty - 标签属性查询

## 功能
按标签的属性值过滤查询笔记，用于查找特定状态、优先级等的内容。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tagName | string | ✅ | 标签名，不带#号 |
| property | string | ❌ | 属性名称 |
| value | string | ❌ | 属性值 |
| maxResults | number | ❌ | 最大结果数，默认20 |

## 使用示例
```json
{"tagName": "Task", "property": "状态", "value": "Done"}
{"tagName": "Task", "property": "优先级", "value": "高"}
{"tagName": "book", "property": "状态", "value": "reading"}
{"tagName": "project"}
```

## 何时使用
- 用户问"已完成的任务"、"高优先级的xxx"
- 用户问"正在读的书"、"进行中的项目"
- 需要按标签属性筛选内容

## 注意事项
- tagName 不需要带 `#` 号
- 如果只提供 tagName，返回所有带该标签的块
- 属性名和值需要与标签定义一致
