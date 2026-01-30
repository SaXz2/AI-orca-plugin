# insert_markdown - 插入 Markdown

## 功能
在指定参考块（`refBlockId`）下创建一个新的子块，并插入 Markdown/文本内容（默认作为 `lastChild`）。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| refBlockId | number | ✅ | 参考块 ID（通常是页面根块、今日日记 blockId 等） |
| markdown | string | ✅ | 要插入的内容（可包含 Markdown） |

兼容参数：`content` / `text` 也可用，但推荐使用 `markdown`。

## 使用示例
```json
{"refBlockId": 12345, "markdown": "今天完成：\n- 任务A\n- 任务B"}
```

## 何时使用
- 用户明确要求“添加/记录/写入”内容
- 用户已给出目标块 ID（或先用 `get_today_journal` / `get_page_by_name` 获取目标）

## 注意事项
- ⚠️ 只在用户明确要求写入时调用
- ⚠️ 成功后不要重复调用（避免重复插入）
- 引用页面请使用 `[[页面名]]`，不要在正文里用 `orca-block:xxx` 来当作页面引用
