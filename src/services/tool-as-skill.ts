/**
 * Tool-as-Skill Architecture
 * 
 * 将所有工具以 Skill 的形式按需加载，减少每次请求携带的工具定义，完美命中 API 缓存。
 * 
 * 工作原理：
 * 1. 主工具集只有一个 useSkill 工具
 * 2. skillName 参数枚举所有可用工具（简短一行描述）
 * 3. AI 根据简短描述选择需要的 skill
 * 4. 系统执行对应的实际工具函数
 */

import type { OpenAITool } from "./openai-client";

/**
 * 所有工具的简短描述（用于 useSkill 的 enum description）
 * 格式：工具名: 简短描述（一行，<15字）
 */
export const SKILL_REGISTRY: Record<string, string> = {
  // 搜索类工具
  searchBlocksByText: "按文本搜索笔记",
  searchBlocksByTag: "按标签搜索笔记",
  query_blocks_by_tag: "按标签+属性查询",
  query_blocks: "组合多条件搜索",
  searchBlocksByReference: "搜索反向链接",
  
  // 读取类工具
  getPage: "读取页面完整内容",
  getBlock: "读取块完整内容",
  getBlockMeta: "批量获取块元数据",
  getBlockLinks: "获取出链和入链",
  
  // 写入类工具
  createBlock: "创建新笔记块",
  createPage: "创建页面别名",
  insertTag: "为块添加标签",
  updateTagProperties: "更新标签属性",
  
  // 日记类工具
  getTodayJournal: "获取今天日记",
  getRecentJournals: "获取最近日记",
  getJournalByDate: "获取指定日期日记",
  getJournalsByDateRange: "按范围获取日记",
  
  // 元工具
  tool_instructions: "获取工具详细说明",
  get_tag_schema: "获取标签属性定义",
  
  // 对话类
  getSavedAiConversations: "获取已保存对话",
  
  // 联网类工具（动态添加）
  webSearch: "联网搜索实时信息",
  imageSearch: "搜索相关图片",
  wikipedia: "查询Wikipedia百科",
  currency: "查询汇率转换",
};

/**
 * 构建 useSkill 工具定义
 */
export function buildUseSkillTool(enabledSkills: string[] = Object.keys(SKILL_REGISTRY)): OpenAITool {
  // 构建简短的枚举描述
  const skillDescriptions = enabledSkills
    .map(skill => `${skill}: ${SKILL_REGISTRY[skill] || "未知工具"}`)
    .join("\n");
  
  return {
    type: "function",
    function: {
      name: "useSkill",
      description: `调用特定工具执行操作。每个工具都是一个独立的技能。

🔧 可用工具列表：
${skillDescriptions}

📌 使用方法：
1. 根据用户需求选择合适的 skillName
2. 将工具参数作为 JSON 对象传入 params

⚠️ 注意：
- 搜索结果已包含完整内容，通常不需要再调用 getPage
- 优先使用笔记库工具，只在需要外部信息时使用联网工具
- 只在用户明确要求创建时使用写入工具`,
      parameters: {
        type: "object",
        properties: {
          skillName: {
            type: "string",
            enum: enabledSkills,
            description: "工具名称（见上方列表）",
          },
          params: {
            type: "object",
            description: "工具参数（JSON对象）。具体参数由所选工具决定。如果不确定参数，先调用 useSkill({skillName: 'tool_instructions', params: {toolName: '目标工具名'}}) 查看详细说明",
          },
        },
        required: ["skillName", "params"],
      },
    },
  };
}

/**
 * 获取所有可用的 skill 名称（根据功能开关）
 */
export function getEnabledSkills(
  webSearchEnabled: boolean,
  imageSearchEnabled: boolean,
  wikipediaEnabled: boolean,
  currencyEnabled: boolean
): string[] {
  const baseSkills = Object.keys(SKILL_REGISTRY).filter(
    skill => !["webSearch", "imageSearch", "wikipedia", "currency"].includes(skill)
  );
  
  const skills = [...baseSkills];
  
  if (webSearchEnabled) {
    skills.push("webSearch");
    if (imageSearchEnabled) {
      skills.push("imageSearch");
    }
  }
  
  if (wikipediaEnabled) {
    skills.push("wikipedia");
  }
  
  if (currencyEnabled) {
    skills.push("currency");
  }
  
  return skills;
}
