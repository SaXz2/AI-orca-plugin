# getBlockMeta - 获取块元数据

## 功能
批量获取多个块的元数据（创建时间、修改时间、标签、属性）。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| blockIds | number[] | ✅ | 块ID数组 |
| fields | string[] | ❌ | 要获取的字段 |

## fields 可选值
- `created`: 创建时间
- `modified`: 修改时间
- `tags`: 标签列表
- `properties`: 标签属性

## 使用示例
```json
{"blockIds": [123, 456]}
{"blockIds": [123], "fields": ["created", "modified"]}
{"blockIds": [123, 456, 789], "fields": ["tags", "properties"]}
```

## 何时使用
- 需要比较多个笔记的时间信息
- 批量获取标签和属性
- 用户问"这些笔记什么时候创建的"

## 注意事项
- 块ID必须是数字类型
- 不指定 fields 时返回所有字段
- 可以一次获取多个块的元数据
