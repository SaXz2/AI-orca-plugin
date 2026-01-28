# createBlock - 创建笔记块

## 功能
在指定位置创建新的笔记块。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | ✅ | 笔记内容，纯文本或Markdown |
| pageName | string | ❌ | 目标页面名称（推荐） |
| refBlockId | number | ❌ | 参考块ID（与pageName二选一） |
| position | string | ❌ | 插入位置，默认lastChild |

## position 可选值
- `firstChild`: 作为第一个子块
- `lastChild`: 作为最后一个子块（默认）
- `before`: 在参考块之前
- `after`: 在参考块之后

## 使用示例
```json
{"content": "这是一条新笔记", "pageName": "日记"}
{"content": "- 项目进度\n  - 完成需求分析\n  - 开始设计", "pageName": "项目A"}
{"content": "新增内容", "refBlockId": 12345, "position": "after"}
```

## 何时使用
- 用户明确要求"创建"、"添加"、"写入"笔记
- 用户说"帮我记录"、"写下来"
- 用户要求保存某些内容

## 内容格式
- 使用纯文本或 Markdown
- 引用页面用 `[[页面名称]]`
- **不要**使用 `orca-block:xxx` 格式

## 注意事项
⚠️ **只在用户明确要求时创建**，不要主动创建
⚠️ 成功后立即停止，不要重复创建
⚠️ 优先使用 pageName，更安全可靠
