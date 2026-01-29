# updateTagProperties - 修改标签属性

## 功能
修改已存在标签的属性值。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| blockId | number | ✅ | 目标块ID |
| tagName | string | ✅ | 标签名，不带#号 |
| properties | array | ✅ | 要更新的属性数组 |

## properties 格式
```json
[
  {"name": "属性名", "value": "新值"}
]
```

## 使用示例
```json
{"blockId": 123, "tagName": "book", "properties": [{"name": "status", "value": "已读"}]}
{"blockId": 456, "tagName": "Task", "properties": [{"name": "状态", "value": "Done"}]}
{"blockId": 789, "tagName": "project", "properties": [{"name": "优先级", "value": "低"}, {"name": "进度", "value": "80%"}]}
```

## 何时使用
- 用户要求更新笔记状态
- 用户说"把xxx标记为已完成"
- 用户要求修改属性值

## 注意事项
- 块必须已经有该标签
- 只更新指定的属性，其他属性保持不变
- 属性名必须与标签架构中定义的一致
