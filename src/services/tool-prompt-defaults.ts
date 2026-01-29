/**
 * Tool-Prompt 默认模板
 * 
 * 硬编码在代码中，即使 Tool-Prompt 目录被完全删除也能恢复。
 * 用户可以编辑 Tool-Prompt/ 下的 .md 文件自定义说明。
 */

export const TOOL_PROMPT_DEFAULTS: Record<string, string> = {
  searchNotes: `# searchNotes - 全文搜索笔记

## 功能
在用户的笔记库中进行全文搜索，返回包含关键词的笔记块。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ✅ | 搜索关键词 |
| maxResults | number | ❌ | 最大结果数，默认20 |

## 使用示例
\`\`\`json
{"query": "会议记录"}
{"query": "项目A 进度", "maxResults": 10}
\`\`\`

## 何时使用
- 用户要求"搜索"、"查找"、"找一下"某些内容
- 用户想知道笔记库中有哪些关于某主题的内容
- 不确定内容在哪个页面时

## 注意事项
- 搜索结果按相关性排序
- 返回的是块级内容，包含所在页面信息
- 如果用户提供了 \`[[页面名]]\` 格式，应该用 \`getPage\` 而不是搜索`,

  getPage: `# getPage - 读取页面内容

## 功能
按页面名称获取完整页面内容，包含所有子块。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageName | string | ✅ | 页面名称或别名 |

## 使用示例
\`\`\`json
{"pageName": "项目A"}
{"pageName": "2024-01-15"}
\`\`\`

## 何时使用
- 用户提到具体的页面名称（如 \`[[项目A]]\`）
- 用户要求查看某个页面的内容
- 用户问"打开xxx"、"看看xxx页面"

## 注意事项
- 页面名称不带 \`[[]]\`
- 支持别名匹配
- 返回页面的完整层级结构`,

  getBlocksText: `# getBlocksText - 读取块内容

## 功能
按块ID批量获取块的文本内容，包含所有子块。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| blockIds | number[] | ✅ | 块ID数组 |

## 使用示例
\`\`\`json
{"blockIds": [123]}
{"blockIds": [123, 456, 789]}
\`\`\`

## 何时使用
- 已经从搜索结果中获得了块ID
- 需要获取特定块的详细内容
- 需要批量读取多个块`,

  queryByTagProperty: `# queryByTagProperty - 标签属性查询

## 功能
按标签的属性值过滤查询笔记。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tagName | string | ✅ | 标签名，不带#号 |
| property | string | ❌ | 属性名称 |
| value | string | ❌ | 属性值 |
| maxResults | number | ❌ | 最大结果数，默认20 |

## 使用示例
\`\`\`json
{"tagName": "Task", "property": "状态", "value": "Done"}
{"tagName": "book", "property": "状态", "value": "reading"}
\`\`\`

## 何时使用
- 用户问"已完成的任务"、"高优先级的xxx"
- 用户问"正在读的书"、"进行中的项目"`,

  query_blocks: `# query_blocks - 高级组合查询

## 功能
使用 QueryDescription2 格式执行复杂的组合查询。

## 查询组类型（kind）
- \`100\`: SELF_AND - 所有条件必须匹配
- \`101\`: SELF_OR - 至少一个条件匹配
- \`106\`: CHAIN_AND - 条件在祖先/后代块中匹配

## 条件类型（kind）
- \`3\`: 日记查询  \`4\`: 标签查询  \`8\`: 文本查询  \`11\`: 任务查询

## 常用示例
\`\`\`json
// AND查询
{"q": {"kind": 100, "conditions": [{"kind": 4, "name": "project"}, {"kind": 8, "text": "deadline"}]}}

// 未完成任务
{"q": {"kind": 100, "conditions": [{"kind": 11, "completed": false}]}}

// 最近7天日记
{"q": {"kind": 100, "conditions": [{"kind": 3, "start": {"t": 1, "v": -7, "u": "d"}, "end": {"t": 1, "v": 0, "u": "d"}}]}}
\`\`\``,

  getTodayJournal: `# getTodayJournal - 获取今日日记

## 功能
获取今天日记的完整内容。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| includeChildren | boolean | ❌ | 是否包含子块，默认true |

## 何时使用
- 用户问"今天写了什么"、"今天的日记"、"今天的计划"`,

  getJournalByDate: `# getJournalByDate - 获取指定日期日记

## 功能
获取指定日期的日记完整内容。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | ✅ | 日期，格式YYYY-MM-DD 或 "yesterday" |
| includeChildren | boolean | ❌ | 是否包含子块，默认true |

## 使用示例
\`\`\`json
{"date": "2026-01-05"}
{"date": "yesterday"}
\`\`\``,

  getJournals: `# getJournals - 获取日记范围

## 功能
获取一段时间范围内的日记。

## 参数（优先级：days > month > week > startDate/endDate）
| 参数 | 类型 | 说明 |
|------|------|------|
| days | number | 最近N天 |
| month | string | 某月，格式YYYY-MM |
| week | string | "this"（本周）或 "last"（上周） |
| startDate/endDate | string | 自定义范围 YYYY-MM-DD |

## 使用示例
\`\`\`json
{"days": 7}
{"month": "2024-05"}
{"week": "this"}
\`\`\``,

  searchBlocksByReference: `# searchBlocksByReference - 反向链接搜索

## 功能
搜索引用了某页面的所有笔记（反向链接）。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pageName | string | ✅ | 页面名称，不带[[]] |
| maxResults | number | ❌ | 最大结果数，默认20 |
| countOnly | boolean | ❌ | 只返回数量 |

## 何时使用
- 用户问"哪些笔记提到了[[某页面]]"
- 用户问"某页面被引用了多少次"`,

  getBlockMeta: `# getBlockMeta - 获取块元数据

## 功能
批量获取多个块的元数据（创建/修改时间、标签、属性）。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| blockIds | number[] | ✅ | 块ID数组 |
| fields | string[] | ❌ | 要获取的字段：created, modified, tags, properties |`,

  getBlockLinks: `# getBlockLinks - 获取块链接关系

## 功能
获取块的出链和入链列表。

## 参数
| 参数 | 类型 | 说明 |
|------|------|------|
| blockId | number | 块ID（与pageName二选一） |
| pageName | string | 页面名称 |

⚠️ 只返回文本列表，不生成图谱。要看图谱请告知用户用 \`/localgraph\` 命令`,

  createBlock: `# createBlock - 创建笔记块

## 功能
在指定位置创建新的笔记块。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | ✅ | 笔记内容，纯文本或Markdown |
| pageName | string | ❌ | 目标页面名称（推荐） |
| refBlockId | number | ❌ | 参考块ID（与pageName二选一） |
| position | string | ❌ | firstChild/lastChild/before/after |

## 注意事项
⚠️ **只在用户明确要求时创建**
⚠️ 成功后立即停止，不要重复创建
⚠️ 引用页面用 \`[[页面名称]]\`，不要用 \`orca-block:xxx\``,

  createPage: `# createPage - 创建页面别名

## 功能
为已存在的块创建页面别名（将块提升为独立页面）。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| blockId | number | ✅ | 目标块ID |
| pageName | string | ✅ | 新页面名称 |`,

  insertTag: `# insertTag - 添加标签

## 功能
为指定块添加标签。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| blockId | number | ✅ | 目标块ID |
| tagName | string | ✅ | 标签名，不带#号 |
| properties | array | ❌ | 标签属性 [{name, value}] |`,

  updateTagProperties: `# updateTagProperties - 修改标签属性

## 功能
修改已存在标签的属性值。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| blockId | number | ✅ | 目标块ID |
| tagName | string | ✅ | 标签名，不带#号 |
| properties | array | ✅ | 要更新的属性 [{name, value}] |`,

  webSearch: `# webSearch - 联网搜索

## 功能
联网搜索获取实时信息。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ✅ | 搜索关键词 |
| maxResults | number | ❌ | 最大结果数，默认5 |

## 何时使用
- 用户问最新的新闻、事件、数据
- 需要实时信息（天气、股价等）
- 笔记库中没有的外部知识

⚠️ 优先使用笔记库工具查找用户自己的内容`,

  imageSearch: `# imageSearch - 图片搜索

## 功能
搜索相关图片并在回复中显示。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ✅ | 图片搜索关键词 |
| maxResults | number | ❌ | 最大图片数，默认3 |

## 何时使用 - 优先使用！
- 用户询问人物、地点、物品的外观
- 回答中提到具体的人名、地名、产品名
- 用户问"是什么"、"长什么样"

🌟 图片能大大提升回答质量！`,

  wikipedia: `# wikipedia - 维基百科查询

## 功能
查询 Wikipedia 百科获取权威知识。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ✅ | 搜索关键词 |
| lang | string | ❌ | 语言代码，默认zh |
| fallback | boolean | ❌ | 没结果时尝试英文，默认true |

## 语言建议
- 科技/学术主题 → en（更全面）
- 本地化主题 → zh`,

  fetch_url: `# fetch_url - 网页内容抓取

## 功能
抓取指定 URL 的网页内容。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | ✅ | 完整的 http/https 链接 |
| max_length | number | ❌ | 最大内容长度，默认100000 |

## 何时使用
- 用户提供了具体的网址链接
- 需要提取网页中的表格、数据、文章

⚠️ 不支持需要登录的页面`,

  currency: `# currency - 汇率查询与转换

## 功能
查询实时汇率或进行货币转换。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| from | string | ✅ | 源货币（USD/美元） |
| amount | number | ❌ | 金额，默认1 |
| to | string | ❌ | 目标货币 |

## 使用示例
\`\`\`json
{"from": "USD", "amount": 100, "to": "CNY"}
\`\`\``,

  getSavedAiConversations: `# getSavedAiConversations - 获取已保存对话

## 功能
获取已保存的AI对话记录。

## 参数
| 参数 | 类型 | 说明 |
|------|------|------|
| query | string | 搜索关键词（可选） |
| maxResults | number | 最大结果数，默认10 |
| briefMode | boolean | 只返回标题+摘要 |

## 何时使用
- 用户问"之前聊过什么"
- 用户问"找找关于xxx的对话"`,
};

/**
 * 获取所有工具名称
 */
export function getDefaultToolNames(): string[] {
  return Object.keys(TOOL_PROMPT_DEFAULTS);
}

/**
 * 获取工具的默认模板
 */
export function getDefaultToolPrompt(toolName: string): string | null {
  return TOOL_PROMPT_DEFAULTS[toolName] || null;
}
