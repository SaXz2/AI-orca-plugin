# get_journals - 获取日记范围

## 功能
按时间范围获取日记列表（支持最近 N 天 / 指定月 / 指定周 / 自定义日期范围）。

## 参数（优先级：days > month > week > startDate/endDate）
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | ❌ | 最近 N 天 |
| month | string | ❌ | 某月：`YYYY-MM` |
| week | string | ❌ | `this`（本周）或 `last`（上周） |
| startDate | string | ❌ | 自定义起始：`YYYY-MM-DD` |
| endDate | string | ❌ | 自定义结束：`YYYY-MM-DD` |
| includeChildren | boolean | ❌ | 是否包含子块，默认 true |
| maxResults | number | ❌ | 最大返回条数，默认 31 |

## 使用示例
```json
{"days": 7}
```

```json
{"month": "2024-05"}
```

```json
{"startDate": "2024-05-01", "endDate": "2024-05-15"}
```

## 何时使用
- 用户问“最近/这周/上周/这个月的日记”
- 需要回顾某段时间的记录

## 注意事项
- 一次只提供一种范围参数（按优先级生效）
- 范围太大可能会被截断，建议缩小范围或用分页/更小 days
