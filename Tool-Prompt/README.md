# Tool-Prompt 工具说明目录

本目录存放 AI 工具的详细使用说明，采用 **按需加载** 机制以节省 token。

## 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│  工具定义 (ai-tools.ts)                                      │
│  description: "全文搜索笔记" ← 极简描述（节省 token）         │
└─────────────────────────────────────────────────────────────┘
                              ↓ AI 决定调用某工具
┌─────────────────────────────────────────────────────────────┐
│  Tool-Prompt/searchNotes.md ← 按需加载详细说明               │
│  # searchNotes                                               │
│  ## 参数说明、使用示例、注意事项...                           │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
Tool-Prompt/
├── README.md                 # 本说明文件
├── searchNotes.md            # 工具说明（可编辑）
├── get_page.md
├── get_page_by_name.md
├── get_blocks_text.md
├── insert_markdown.md
├── create_page.md
├── batch_insert_tags.md
├── get_tags_and_pages.md
├── webSearch.md
└── ...
```

## 如何使用

### 自定义工具说明

直接编辑 `Tool-Prompt/` 目录下的 `.md` 文件即可，无需重启。

例如，想让 AI 在搜索时优先使用中文关键词：
```markdown
# searchNotes - 全文搜索笔记

## 搜索技巧
- 优先使用中文关键词
- 多个词用空格分隔
...
```

### 文件被删除怎么办？

**不用担心！** 默认模板硬编码在代码中，即使整个 Tool-Prompt 目录被删除也能自动恢复。

- 删除单个文件 → 下次加载时自动恢复
- 删除整个目录 → 插件启动时自动重建

### 添加新工具说明

1. 在 `src/services/tool-prompt-defaults.ts` 中添加默认模板
2. 系统会自动在 `Tool-Prompt/` 目录创建对应文件
3. 在代码中使用 `loadToolPrompt("myTool")` 加载

## 文件格式

每个工具说明文件建议包含：

```markdown
# 工具名 - 简短描述

## 功能
一句话说明工具用途。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| xxx | string | ✅ | 描述 |

## 使用示例
\`\`\`json
{"param": "value"}
\`\`\`

## 何时使用
- 场景1
- 场景2

## 注意事项
- 注意点1
- 注意点2
```

## 当前支持的工具

### 搜索工具
- `searchNotes` - 全文搜索笔记
- `queryByTagProperty` - 标签属性查询
- `query_blocks` - 高级组合查询
- `searchBlocksByReference` - 反向链接搜索

### 读取工具
- `get_page` - 查找块所属页面
- `get_page_by_name` - 读取页面内容
- `get_blocks_text` - 读取块内容
- `getBlockMeta` - 获取块元数据
- `getBlockLinks` - 获取块链接关系
- `get_tags_and_pages` - 获取标签和页面

### 日记工具
- `get_today_journal` - 获取今日日记
- `get_journal_by_date` - 获取指定日期日记
- `get_journals` - 获取日记范围

### 写入工具
- `insert_markdown` - 插入 Markdown
- `create_page` - 创建页面
- `batch_insert_tags` - 批量添加标签

### 联网工具
- `webSearch` - 联网搜索
- `imageSearch` - 图片搜索
- `wikipedia` - 维基百科查询
- `fetch_url` - 网页内容抓取
- `currency` - 汇率查询与转换

### 其他工具
- `getSavedAiConversations` - 获取已保存对话
