/**
 * Dynamic System Prompt Builder
 *
 * 参考 CoreCoder prompt.py 设计：基础提示词 + 按能力动态组装段落。
 * 只在相关功能启用时才注入对应指令，避免浪费 token。
 */

import type { OpenAITool } from "./openai-client";

const BASE_PROMPT = `你是笔记库智能助手。遵守工具返回的所有指令。

## 核心原则
- **精确执行**：严格使用用户原词，不擅自替换、扩展或联想
- **真实可靠**：只引用工具实际返回的内容，绝对禁止编造
- **简洁直接**：结论先行，短句优先，不废话`;

const TOOL_USE_SECTION = `## 工具使用
- 看到 "✅ Search complete" 或 "🚫 STOP" 立即停止，不再调用其他工具
- 搜索0结果时才能尝试近义词，且必须明确告知用户
- ❌ 禁止在回复中直接粘贴工具返回的原始 JSON 数据，必须用自然语言总结
- 工具结果中如出现"...[已截断"字样，说明数据过长已被截断，不要抱怨截断`;

const MCP_TOOLS_SECTION = `- 以 mcp__ 开头的是外部 MCP 工具，根据描述和场景按需调用`;

const TODOIST_SECTION = `## Todoist 任务管理
- 用户可通过 /todoist-ai 模式管理 Todoist 任务
- 创建任务时，若用户未指定日期，默认设为今天
- 完成任务前先确认任务 ID`;

const CITATION_SECTION = `## 引用标注规范
- 引用笔记块时，在句中使用双括号包裹块 ID，格式：((数字))
- 多个块引用连续书写，示例：((5006))((1003))
- 引用位置要紧跟被引用内容之后
- ❌ 禁止：无标题时使用 () 或 (未命名) 等空括号占位
- blockid 必须从工具返回中复制，禁止编造`;

const WEB_SEARCH_SECTION = `## 联网搜索
- webSearch 用于获取实时信息
- imageSearch 用于搜索相关图片
- 优先使用用户笔记库中的内容，只在需要外部信息时搜索`;

const DRAGGED_CONTEXT_SECTION = `## 上下文优先
- 用户已提供具体内容块，优先基于这些块回答
- 不需要再搜索笔记库`;

export interface PromptOptions {
  hasMcpTools?: boolean;
  hasTodoistTools?: boolean;
  hasWebSearch?: boolean;
  hasDraggedContext?: boolean;
}

export function buildDynamicSystemPrompt(options: PromptOptions = {}): string {
  const sections: string[] = [BASE_PROMPT];

  // 工具使用（有 MCP 工具时才扩展）
  if (options.hasMcpTools) {
    sections.push(TOOL_USE_SECTION + "\n" + MCP_TOOLS_SECTION);
  } else {
    sections.push(TOOL_USE_SECTION);
  }

  // 引用格式
  sections.push(CITATION_SECTION);

  // 联网搜索相关
  if (options.hasWebSearch) {
    sections.push(WEB_SEARCH_SECTION);
  }

  // 拖入上下文
  if (options.hasDraggedContext) {
    sections.push(DRAGGED_CONTEXT_SECTION);
  }

  // Todoist 模式
  if (options.hasTodoistTools) {
    sections.push(TODOIST_SECTION);
  }

  return sections.join("\n\n");
}

/**
 * 从工具列表分析当前可用的能力
 */
export function analyzeToolCapabilities(tools: OpenAITool[]): PromptOptions {
  const toolNames = tools.map((t) => t.function.name);

  return {
    hasMcpTools: toolNames.some((n) => n.startsWith("mcp__")),
    hasTodoistTools: toolNames.some((n) => n.startsWith("todoist_")),
    hasWebSearch: toolNames.includes("webSearch"),
    hasDraggedContext: false, // 由调用方覆盖
  };
}
