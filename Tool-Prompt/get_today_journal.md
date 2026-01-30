# get_today_journal - 获取今日日记

## 功能
获取今天的日记内容（如果不存在通常会自动创建），可选是否包含子块。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| includeChildren | boolean | ❌ | 是否包含子块，默认 true |

## 使用示例
```json
{}
```

```json
{"includeChildren": false}
```

## 何时使用
- 用户问“今天的日记/今天写了什么”
- 需要获取今日日记的 blockId（用于后续 `insert_markdown` 写入）

## 注意事项
- 不需要传日期
- `includeChildren=false` 时只返回顶层信息
