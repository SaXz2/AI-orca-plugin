/**
 * Lazy Tool Loading Architecture
 * 
 * 延迟加载工具定义架构 - 真正减少上下文占用
 * 
 * 工作原理：
 * 1. 系统提示词中只包含工具名和简短描述（非工具定义格式）
 * 2. AI 通过特殊格式表达工具使用意图：<tool>toolName</tool>
 * 3. 系统检测到意图后，动态注入该工具的完整定义
 * 4. 发起第二次请求，AI 用完整参数调用工具
 * 
 * 优势：
 * - 第一阶段：0 个工具定义（只有简短文本描述）
 * - 第二阶段：1 个工具定义（只加载需要的工具）
 * - 进一步减少 token 消耗，真正按需加载
 */

import type { OpenAITool } from "./openai-client";

/**
 * 工具简短描述注册表（用于系统提示词）
 * 格式：工具名: 简短描述
 */
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  // 搜索类
  searchBlocksByText: "全局搜索笔记库的文本内容",
  searchBlocksByTag: "按标签搜索笔记块",
  query_blocks_by_tag: "按标签和属性组合查询笔记",
  query_blocks: "使用高级条件组合搜索笔记",
  searchBlocksByReference: "搜索某个页面的反向链接",
  
  // 读取类
  getPage: "读取页面的完整内容",
  getBlock: "读取指定块的内容",
  getBlockMeta: "批量获取块的元数据",
  getBlockLinks: "获取块的出链和入链",
  
  // 写入类
  createBlock: "创建新的笔记块",
  createPage: "创建页面或别名",
  insertTag: "为笔记块添加标签",
  updateTagProperties: "更新标签的属性值",
  
  // 日记类
  getTodayJournal: "获取今天的日记内容",
  getRecentJournals: "获取最近几天的日记",
  getJournalByDate: "获取指定日期的日记",
  getJournalsByDateRange: "获取日期范围内的日记",
  
  // 元工具
  tool_instructions: "获取工具的详细使用说明",
  get_tag_schema: "获取标签的属性定义",
  
  // 对话
  getSavedAiConversations: "获取已保存的 AI 对话列表",
  
  // 联网类
  webSearch: "联网搜索实时信息",
  imageSearch: "搜索网络图片",
  wikipedia: "查询 Wikipedia 百科",
  currency: "查询汇率或货币转换",
};

/**
 * 生成系统提示词中的工具列表文本（非工具定义格式）
 */
export function buildToolListPrompt(enabledTools: string[]): string {
  const toolList = enabledTools
    .filter(tool => TOOL_DESCRIPTIONS[tool])
    .map(tool => `- ${tool}: ${TOOL_DESCRIPTIONS[tool]}`)
    .join("\n");

  return `
## 可用工具

当你需要执行以下操作时，请使用 <tool>工具名</tool> 标记来表达意图：

${toolList}

**使用方式**：
当你决定使用某个工具时，在回复中包含 <tool>工具名</tool>，例如：
- 要搜索笔记，使用：<tool>searchBlocksByText</tool>
- 要获取日记，使用：<tool>getTodayJournal</tool>

**注意**：
- 只在需要执行实际操作时使用工具
- 如果可以直接回答用户问题，不要使用工具
- 一次只表达一个工具意图
`.trim();
}

/**
 * 从 AI 回复中检测工具使用意图
 * @returns 检测到的工具名称，如果没有则返回 null
 */
export function detectToolIntent(aiResponse: string): string | null {
  const toolTagRegex = /<tool>([^<]+)<\/tool>/;
  const match = aiResponse.match(toolTagRegex);
  
  if (match && match[1]) {
    const toolName = match[1].trim();
    // 验证是否是有效的工具名
    if (TOOL_DESCRIPTIONS[toolName]) {
      return toolName;
    }
  }
  
  return null;
}

// 导入所有工具定义
import { 
  TOOLS, 
  WEB_SEARCH_TOOL, 
  IMAGE_SEARCH_TOOL,
  WIKIPEDIA_TOOL,
  CURRENCY_TOOL 
} from "./ai-tools";

/**
 * 根据工具名获取完整的工具定义
 * 从 ai-tools.ts 导入实际的工具定义
 */
export function getToolDefinition(toolName: string): OpenAITool | null {
  // 合并所有工具
  const allTools = [
    ...TOOLS,
    WEB_SEARCH_TOOL,
    IMAGE_SEARCH_TOOL,
    WIKIPEDIA_TOOL,
    CURRENCY_TOOL
  ];
  
  // 根据工具名查找
  const tool = allTools.find(t => t.function.name === toolName);
  return tool || null;
}

/**
 * 创建第二阶段的请求消息
 * 在检测到工具意图后，引导 AI 使用正确的参数调用工具
 */
export function buildToolCallPrompt(toolName: string, originalQuery: string): string {
  return `根据用户的原始问题："${originalQuery}"，请使用 ${toolName} 工具来完成任务。请直接调用工具，不要回复文本。`;
}

/**
 * 工具执行状态
 */
export type ToolLoadingState = {
  stage: "initial" | "tool_detected" | "tool_called" | "completed";
  detectedTool?: string;
  originalResponse?: string;
};

/**
 * 获取启用的工具列表（根据功能开关）
 */
export function getEnabledToolsLazy(
  webSearchEnabled: boolean,
  imageSearchEnabled: boolean,
  wikipediaEnabled: boolean,
  currencyEnabled: boolean
): string[] {
  const baseTools = Object.keys(TOOL_DESCRIPTIONS).filter(
    tool => !["webSearch", "imageSearch", "wikipedia", "currency"].includes(tool)
  );
  
  const tools = [...baseTools];
  
  if (webSearchEnabled) {
    tools.push("webSearch");
    if (imageSearchEnabled) {
      tools.push("imageSearch");
    }
  }
  
  if (wikipediaEnabled) {
    tools.push("wikipedia");
  }
  
  if (currencyEnabled) {
    tools.push("currency");
  }
  
  return tools;
}
