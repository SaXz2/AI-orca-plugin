# getJournals - 获取日记范围

## 功能
获取一段时间范围内的日记，支持多种时间指定方式。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | ❌ | 最近N天，如7表示最近7天 |
| month | string | ❌ | 某月，格式YYYY-MM如2024-05 |
| week | string | ❌ | "this"（本周）或 "last"（上周） |
| startDate | string | ❌ | 自定义起始日期 YYYY-MM-DD |
| endDate | string | ❌ | 自定义结束日期 YYYY-MM-DD |
| includeChildren | boolean | ❌ | 包含子块，默认true |
| maxResults | number | ❌ | 最大结果数，默认31 |

## 参数优先级
`days` > `month` > `week` > `startDate/endDate`

## 使用示例
```json
{"days": 7}
{"days": 30}
{"month": "2024-05"}
{"week": "this"}
{"week": "last"}
{"startDate": "2024-05-01", "endDate": "2024-05-15"}
```

## 何时使用
- 用户问"最近一周的日记"
- 用户问"这个月写了什么"
- 用户问"上周的内容"
- 用户问"回顾最近的记录"
- 用户要求总结某段时间的内容

## 注意事项
- 一次只需提供一种时间范围参数
- 如果时间范围很大，结果可能会被截断
- 建议先用少量数据测试
