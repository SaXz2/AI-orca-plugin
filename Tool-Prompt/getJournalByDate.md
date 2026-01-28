# getJournalByDate - 获取指定日期日记

## 功能
获取指定日期的日记完整内容。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | ✅ | 日期，格式YYYY-MM-DD 或 "yesterday" |
| includeChildren | boolean | ❌ | 是否包含子块，默认true |

## 使用示例
```json
{"date": "2026-01-05"}
{"date": "yesterday"}
{"date": "2026-01-15", "includeChildren": false}
```

## 何时使用
- 用户问"昨天的日记"
- 用户问"1月5号写了什么"
- 用户问"看看某某天的内容"

## 日期格式说明
- 标准格式：`YYYY-MM-DD`（如 2026-01-15）
- 特殊值：`yesterday`（昨天）

## 注意事项
- 日期格式必须正确，否则会出错
- 如果该日期没有日记会返回空
