# getTodayJournal - 获取今日日记

## 功能
获取今天日记的完整内容，包含所有子块。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| includeChildren | boolean | ❌ | 是否包含子块，默认true |

## 使用示例
```json
{}
{"includeChildren": true}
{"includeChildren": false}
```

## 何时使用
- 用户问"今天写了什么"
- 用户问"今天的日记"
- 用户问"今天的计划"
- 用户问"看看今天"

## 注意事项
- 直接返回今日日记内容，无需指定日期
- includeChildren 为 false 时只返回顶层内容
