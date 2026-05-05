/**
 * Orca Note MCP 工具定义
 *
 * 将 Orca Note 原生 12 个 MCP 工具定义为 OpenAI function calling Schema。
 * AI 可直接看到这些工具并按照标准参数规范调用。
 */

import type { OpenAITool } from "./openai-client";

// ─── query_blocks 条件类型常量 ───────────────────────────────────────────

/** 查询组类型 */
const QUERY_GROUP_KINDS = {
  100: "SELF_AND - 所有条件都必须匹配",
  101: "SELF_OR - 至少一个条件匹配",
  106: "CHAIN_AND - 在祖先/后代链中匹配",
} as const;

/** 条件类型 */
const CONDITION_KINDS = {
  3: "Journal 查询 - 按日期范围查询日志块",
  4: "Tag 查询 - 按标签查询",
  6: "Reference 查询 - 按引用关系查询",
  8: "Text 查询 - 按文本内容查询",
  9: "Block 属性查询 - 按块属性查询（类型、创建时间、子块等）",
  11: "Task 查询 - 按任务完成状态查询",
  12: "Block Match 查询 - 查询特定块",
  13: "Content Format 查询 - 按内容格式查询（粗体、斜体、链接等）",
} as const;

/** 属性操作符 */
const PROPERTY_OPS = {
  1: "等于 (equals)",
  2: "不等于 (not equals)",
  3: "包含 (includes)",
  4: "不包含 (not includes)",
  5: "有 (has)",
  6: "没有 (not has)",
  7: "大于 (greater than)",
  8: "小于 (less than)",
  9: "大于等于 (greater or equal)",
  10: "小于等于 (less or equal)",
  11: "为空 (is null)",
  12: "不为空 (not null)",
} as const;

/** 块类型 */
const BLOCK_TYPES = [
  "text", "task", "heading", "code", "quote",
  "image", "video", "audio", "file", "pdf",
  "whiteboard", "table", "page",
] as const;

/** 内容格式标识符 */
const FORMAT_IDS = {
  b: "粗体", i: "斜体", s: "删除线", u: "下划线",
  c: "行内代码", h: "高亮", l: "链接", m: "公式",
  mr: "行内公式", mc: "公式块", e: "嵌入", t: "标签引用",
  "u+u": "上标", "d+d": "下标",
} as const;

/** 排序内置字段 */
const SORT_FIELDS = ["_created", "_modified", "_text", "_journal", "_refcount"] as const;

// ─── insert_tags 属性类型规范 ────────────────────────────────────────────

const TAG_PROPERTY_TYPES = {
  text: "文本 (string)",
  image: "图片 URL (string)",
  link: "链接 URL (string)",
  place: "地点 (string)",
  phone: "电话 (string)",
  email: "邮箱 (string)",
  number: "数字 (number)",
  boolean: "布尔 (boolean)",
  date: "日期 - Unix 时间戳秒 (number)",
  time: "时间 - HH:MM 格式 (string)",
  datetime: "日期时间 - Unix 时间戳秒 (number)",
  select: "单选 - 必须是预定义选项之一 (string)",
  "multi-select": "多选 - 数组，每个值必须是预定义选项之一 (string[])",
  "block-ref": "块引用 - 块 ID 数组 (number[])",
} as const;

// ─── 工具 Schema ─────────────────────────────────────────────────────────

export const ORCA_MCP_TOOLS: OpenAITool[] = [

  // ═══════════════════════════════════════════════════════════════════════
  // 1. query_blocks - 高级块查询
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "query_blocks",
      description: `高级块查询，支持复杂条件组合（AND/OR/CHAIN），按标签、文本、日期、任务状态、块属性、引用等条件搜索笔记块。

⚠️ 这是最通用的查询工具，可替代大部分其他查询。
查询返回块 ID 数组，如需获取完整内容请配合 get_blocks_text 使用。

查询组类型 (q.kind):
${Object.entries(QUERY_GROUP_KINDS).map(([k, v]) => `  ${k}: ${v}`).join("\n")}

条件类型 (conditions[].kind):
${Object.entries(CONDITION_KINDS).map(([k, v]) => `  ${k}: ${v}`).join("\n")}

属性操作符 (op):
${Object.entries(PROPERTY_OPS).map(([k, v]) => `  ${k}: ${v}`).join("\n")}

日期格式: 相对日期 {"t":1,"v":-7,"u":"d"} (7天前)、绝对日期 {"t":2,"v":1704067200000} (毫秒时间戳)
日期单位: s秒 m分钟 h小时 d天 w周 M月 y年`,
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "object",
            description: "查询条件组，包含 kind 和 conditions",
            properties: {
              kind: {
                type: "number",
                enum: [100, 101, 106],
                description: "100=SELF_AND(全部匹配), 101=SELF_OR(任一匹配), 106=CHAIN_AND(链式)",
              },
              conditions: {
                type: "array",
                description: "条件数组，每个条件必须有 kind 字段指定类型（4=Tag, 8=Text, 3=Journal, 11=Task, 6=Ref, 12=BlockMatch）",
                items: { type: "object" },
              },
            },
            required: ["kind", "conditions"],
          },
          combineMode: {
            type: "string",
            enum: ["and", "or"],
            description: "条件组合方式：and=全部匹配(默认), or=任一匹配",
          },
          pageSize: { type: "number", description: "每页数量，默认 50，最大 50" },
          page: { type: "number", description: "页码，默认 1" },
          sort: {
            type: "array",
            description: "排序，如 [['_created', 'DESC']]。内置字段: _created, _modified, _text, _journal, _refcount",
            items: { type: "array", items: [{ type: "string" }, { type: "string", enum: ["ASC", "DESC"] }] },
          },
          excludeId: { type: "number", description: "排除的块 ID" },
        },
        required: ["q"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 2. get_blocks_text - 获取块文本内容
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "get_blocks_text",
      description: `获取指定块及其子块的文本内容。配合 query_blocks 使用：先用 query_blocks 查块 ID，再用本工具获取完整内容。

⚠️ 参数说明：
- blockIds: 要获取内容的块 ID 数组
- childStartIndex/childEndIndex: 可选，限制子块范围（1-based）`,
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            description: "要获取内容的块 ID 数组",
            items: { type: "number" },
          },
          childStartIndex: {
            type: "number",
            description: "子块起始索引（1-based），必须与 childEndIndex 一起使用",
          },
          childEndIndex: {
            type: "number",
            description: "子块结束索引（1-based，包含）",
          },
        },
        required: ["blockIds"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 3. get_page - 查找包含指定块的页面
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "get_page",
      description: `查找包含指定块的页面或日志。给定块 ID，返回每个块所属的页面信息（pageId, pageName）。`,
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            description: "要查找页面的块 ID 数组",
            items: { type: "number" },
          },
        },
        required: ["blockIds"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 4. get_today_journal - 获取今日日志
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "get_today_journal",
      description: `获取今日日志块。如果今日日志不存在，则自动创建。返回日志块 ID 和日期。

⚠️ 注意：
- 不需要参数
- 返回的是今日日志的根块 ID，可用 get_blocks_text 获取子块内容`,
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 5. get_tags_and_pages - 列出所有标签和页面
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "get_tags_and_pages",
      description: `列出所有标签和页面（支持分页）。返回标签列表（含属性定义）和页面列表。

⚠️ 用途：
- 查看所有可用标签及其属性类型
- 查看所有页面列表
- 为 insert_tags 查询标签属性定义

标签属性类型映射 (创建 vs 查询):
${Object.entries(TAG_PROPERTY_TYPES).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`,
      parameters: {
        type: "object",
        properties: {
          pageNum: {
            type: "number",
            description: "页码，默认 1",
          },
          pageSize: {
            type: "number",
            description: "每页数量，默认 200",
          },
        },
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 6. insert_markdown - 解析 Markdown 并插入
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "insert_markdown",
      description: `解析 Markdown 文本并插入到指定位置。

⚠️ 参数说明：
- refBlockId: 参考块 ID（必需）
- position: 插入位置
  - "before": 在参考块之前
  - "after": 在参考块之后
  - "firstChild": 作为第一个子块
  - "lastChild": 作为最后一个子块
- text: Markdown 文本内容（必需）

示例：在日记中添加笔记
1. get_today_journal 获取今日日志 blockId
2. insert_markdown({refBlockId: xxx, position: "lastChild", text: "# 标题\n内容"})`,
      parameters: {
        type: "object",
        properties: {
          refBlockId: {
            type: "number",
            description: "参考块 ID",
          },
          position: {
            type: "string",
            enum: ["before", "after", "firstChild", "lastChild"],
            description: "插入位置：before=之前, after=之后, firstChild=首个子块, lastChild=末尾子块",
          },
          text: {
            type: "string",
            description: "Markdown 文本内容",
          },
        },
        required: ["refBlockId", "text"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 7. insert_tags - 批量添加标签
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "insert_tags",
      description: `为多个块批量添加标签，可设置标签属性值。

⚠️ 参数说明：
- blockIds: 块 ID 数组（最多 100 个）
- tags: 标签数组（最多 100 个）
  - 字符串形式: "tagName"（仅添加标签）
  - 对象形式: {name: "tagName", props: {propName: value}}（添加标签并设置属性）

属性类型规范:
${Object.entries(TAG_PROPERTY_TYPES).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}

重要注意事项：
- date/datetime 使用 Unix 秒时间戳（不是毫秒！）
- select/multi-select 值必须是预定义选项之一
- block-ref 值必须用 number 数组，如 [123]
- 标签名不能以 _ 开头

示例：
// 仅添加标签
{blockIds: [101], tags: ["important"]}

// 添加标签并设置属性
{blockIds: [101], tags: [{name: "task", props: {priority: "high", due: 1704067200}}]}

// 批量添加混合形式
{blockIds: [101, 102], tags: ["important", {name: "task", props: {priority: "high"}}]}`,
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            description: "块 ID 数组（最多 100 个）",
            items: { type: "number" },
          },
          tags: {
            type: "array",
            description: `标签数组。每个元素可以是：
- 字符串：仅添加标签，如 "important"
- 对象：添加标签并设置属性，如 {"name":"task","props":{"priority":"high","due":1704067200}}

属性值类型规范：
- text/image/link/place/phone/email → string
- number → number
- boolean → true/false
- date/datetime → Unix 秒时间戳 (number)
- time → "HH:MM" 字符串
- select → string (必须是预定义选项之一)
- multi-select → string[] (每个值必须是预定义选项之一)
- block-ref → number[] (块 ID 数组)

⚠️ date/datetime 用秒级时间戳，不是毫秒！block-ref 必须用数组如 [123]`,
            items: {
              type: "object",
              description: "标签定义。仅标签名用 {\"name\":\"标签名\"}；带属性用 {\"name\":\"标签名\",\"props\":{\"属性名\":值}}",
              properties: {
                name: { type: "string", description: "标签名（必需）" },
                props: { type: "object", description: "属性键值对（可选）" },
              },
              required: ["name"],
            },
          },
        },
        required: ["blockIds", "tags"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 8. create_page - 创建页面
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "create_page",
      description: `创建新页面。

⚠️ 参数说明：
- name: 页面名称（必需），不能以 _ 开头
- includeIn: 可选，要包含该页面的其他页面名称列表

返回新页面的 blockId。`,
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "页面名称，不能以 _ 开头",
          },
          includeIn: {
            type: "array",
            description: "要包含该页面的其他页面名称列表",
            items: { type: "string" },
          },
        },
        required: ["name"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 9. create_tags - 批量创建标签定义
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "create_tags",
      description: `批量创建标签定义，可定义标签的属性。

⚠️ 参数说明：
- tags: 标签数组（必需）
  每个标签需包含 name 和可选的 properties 数组

属性类型 (type):
${Object.entries(TAG_PROPERTY_TYPES).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}

对于 select/multi-select 类型，需提供 options 数组定义可选值。

示例：
// 创建简单标签
{tags: [{name: "important"}]}

// 创建带属性的标签
{tags: [{name: "task", properties: [
  {name: "priority", type: "select", options: ["low", "medium", "high"]},
  {name: "due", type: "date"},
  {name: "estimatedHours", type: "number"}
]}]}

注意：标签名不能以 _ 开头。如果标签已存在，会更新其属性定义。`,
      parameters: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            description: "标签定义数组",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "标签名，不能以 _ 开头",
                },
                properties: {
                  type: "array",
                  description: "标签属性定义数组",
                  items: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description: "属性名",
                      },
                      type: {
                        type: "string",
                        enum: Object.keys(TAG_PROPERTY_TYPES),
                        description: "属性类型",
                      },
                      options: {
                        type: "array",
                        description: "用于 select/multi-select 的预定义选项",
                        items: { type: "string" },
                      },
                    },
                    required: ["name", "type"],
                  },
                },
              },
              required: ["name"],
            },
          },
        },
        required: ["tags"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 10. move_blocks - 移动块
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "move_blocks",
      description: `移动块到新父块下。

⚠️ 参数说明：
- blockIds: 要移动的块 ID 数组（必需）
- parentId: 目标父块 ID（必需）
- leftId: 左侧兄弟块 ID（可选，用于指定插入位置）

注意：移动操作会改变块的层级关系和顺序。`,
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            description: "要移动的块 ID 数组",
            items: { type: "number" },
          },
          parentId: {
            type: "number",
            description: "目标父块 ID",
          },
          leftId: {
            type: "number",
            description: "左侧兄弟块 ID，用于指定插入位置（可选）",
          },
        },
        required: ["blockIds", "parentId"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 11. delete_blocks - 删除块
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "delete_blocks",
      description: `删除指定块。

⚠️ 参数说明：
- blockIds: 要删除的块 ID 数组（必需）

⚠️ 警告：
- 删除操作不可逆！被删除的块和所有子块都会被永久删除
- 建议先确认用户意图再执行

注意：删除块的同时会删除其所有子块。`,
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            description: "要删除的块 ID 数组",
            items: { type: "number" },
          },
        },
        required: ["blockIds"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 12. remove_tags - 移除标签
  // ═══════════════════════════════════════════════════════════════════════
  {
    type: "function",
    function: {
      name: "remove_tags",
      description: `从多个块批量移除标签。

⚠️ 参数说明：
- blockIds: 块 ID 数组（最多 100 个）
- tags: 要移除的标签名数组（最多 100 个）

注意：只移除标签关联，不会删除标签定义本身。

示例：
// 从块 101 移除 "important" 标签
{blockIds: [101], tags: ["important"]}

// 批量移除
{blockIds: [101, 102, 103], tags: ["task", "project"]}`,
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            description: "块 ID 数组（最多 100 个）",
            items: { type: "number" },
          },
          tags: {
            type: "array",
            description: "要移除的标签名数组（最多 100 个）",
            items: { type: "string" },
          },
        },
        required: ["blockIds", "tags"],
      },
    },
  },
];

/**
 * 获取所有 MCP 工具的名称列表
 */
export function getMcpToolNames(): string[] {
  return ORCA_MCP_TOOLS.map(t => t.function.name);
}

/**
 * 根据名称获取单个 MCP 工具定义
 */
export function getMcpToolDefinition(toolName: string): OpenAITool | undefined {
  return ORCA_MCP_TOOLS.find(t => t.function.name === toolName);
}
