# searchBlocksByReference - 反向链接搜索

## 功能
搜索引用了某页面的所有笔记（反向链接/入链）。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageName | string | ✅ | 页面名称，不带[[]] |
| maxResults | number | ❌ | 最大结果数，默认20，最大50 |
| countOnly | boolean | ❌ | 只返回数量 |
| briefMode | boolean | ❌ | 只返回标题+摘要 |

## 使用示例
```json
{"pageName": "项目A"}
{"pageName": "Python", "maxResults": 30}
{"pageName": "读书笔记", "countOnly": true}
{"pageName": "会议记录", "briefMode": true}
```

## 何时使用
- 用户问"哪些笔记提到了[[某页面]]"
- 用户问"某页面被引用了多少次"
- 用户想了解某个概念在笔记库中的关联

## 注意事项
- pageName 不需要带 `[[]]`
- 返回的是引用了该页面的块列表
- countOnly=true 时快速获取引用数量
- briefMode=true 时只返回简要信息，适合大量结果
