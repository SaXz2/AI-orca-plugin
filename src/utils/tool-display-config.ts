/**
 * Tool Display Configuration System
 *
 * Provides semantic display configuration for AI tools.
 * Maps tool names to user-friendly icons, animations, and text.
 */

import { skillToolNameToSkillIdCache } from "../services/ai-tools";

// 检查是否是 Skill 工具
function isSkillToolName(toolName: string): boolean {
  return toolName.startsWith("skill_");
}

// 获取 Skill 显示名称
function getSkillDisplayName(toolName: string): string {
  if (!isSkillToolName(toolName)) return toolName;

  // 优先从缓存反查原始 Skill ID（支持中文等）
  const skillId = skillToolNameToSkillIdCache.get(toolName);
  if (skillId) return skillId;

  // 兜底：解析 toolName 结构 skill_<slug>_<hash>
  const parts = toolName.split("_");
  if (parts.length >= 3) {
    // parts[0] = skill, parts[1] = slug
    return parts[1] || "技能";
  }

  return "技能";
}

export type ToolCategory = "create" | "search" | "query";
export type AnimationType = "sparkle" | "pulse" | "flip";

export interface ToolDisplayConfig {
  category: ToolCategory;
  icon: string;
  animation: AnimationType;
  displayName: string;  // 中文显示名称
  loadingText: string;
  successText: string;
  successIcon: string;
}

/**
 * Default configuration for unknown tools
 */
const DEFAULT_CONFIG: ToolDisplayConfig = {
  category: "query",
  icon: "🔧",
  animation: "pulse",
  displayName: "工具",
  loadingText: "正在执行...",
  successText: "已完成",
  successIcon: "✅",
};

const SKILL_CONFIG: ToolDisplayConfig = {
  category: "query",
  icon: "✨",
  animation: "sparkle",
  displayName: "技能",
  loadingText: "正在执行技能...",
  successText: "技能已完成",
  successIcon: "✅",
};

/**
 * Tool-specific display configurations
 */
const TOOL_CONFIGS: Record<string, ToolDisplayConfig> = {
  // ─────────────────────────────────────────────────────────────────────────────
  // Create Tools (✨ sparkle animation)
  // ─────────────────────────────────────────────────────────────────────────────
  createBlock: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    displayName: "创建块",
    loadingText: "正在创建块...",
    successText: "已创建新块",
    successIcon: "✅",
  },
  createPage: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    displayName: "创建页面",
    loadingText: "正在创建页面...",
    successText: "已创建页面",
    successIcon: "✅",
  },
  insertTag: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    displayName: "添加标签",
    loadingText: "正在添加标签...",
    successText: "已添加标签",
    successIcon: "✅",
  },
  updateTagProperties: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    displayName: "更新标签属性",
    loadingText: "正在更新标签属性...",
    successText: "已更新标签属性",
    successIcon: "✅",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Search Tools (🔍 pulse animation)
  // ─────────────────────────────────────────────────────────────────────────────
  searchNotes: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    displayName: "全文搜索",
    loadingText: "正在搜索文本...",
    successText: "搜索完成",
    successIcon: "✅",
  },
  queryByTagProperty: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    displayName: "标签属性查询",
    loadingText: "正在查询标签属性...",
    successText: "查询完成",
    successIcon: "✅",
  },
  query_blocks: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    displayName: "高级查询",
    loadingText: "正在高级查询...",
    successText: "查询完成",
    successIcon: "✅",
  },
  searchBlocksByReference: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    displayName: "反链搜索",
    loadingText: "正在搜索引用...",
    successText: "搜索完成",
    successIcon: "✅",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Query Tools (📖 flip animation)
  // ─────────────────────────────────────────────────────────────────────────────
  getPage: {
    category: "query",
    icon: "📖",
    animation: "flip",
    displayName: "读取页面",
    loadingText: "正在获取页面...",
    successText: "已获取页面",
    successIcon: "✅",
  },
  getBlocksText: {
    category: "query",
    icon: "📖",
    animation: "flip",
    displayName: "读取块内容",
    loadingText: "正在获取块内容...",
    successText: "已获取块内容",
    successIcon: "✅",
  },
  getBlockMeta: {
    category: "query",
    icon: "📖",
    animation: "flip",
    displayName: "获取元数据",
    loadingText: "正在获取元数据...",
    successText: "已获取元数据",
    successIcon: "✅",
  },
  getTodayJournal: {
    category: "query",
    icon: "📖",
    animation: "flip",
    displayName: "今日日记",
    loadingText: "正在获取今日日记...",
    successText: "已获取日记",
    successIcon: "✅",
  },
  getJournalByDate: {
    category: "query",
    icon: "📅",
    animation: "flip",
    displayName: "指定日期日记",
    loadingText: "正在获取指定日期日记...",
    successText: "已获取日记",
    successIcon: "✅",
  },
  getJournals: {
    category: "query",
    icon: "📆",
    animation: "flip",
    displayName: "日记范围查询",
    loadingText: "正在获取日记范围...",
    successText: "已获取日记",
    successIcon: "✅",
  },
  getBlockLinks: {
    category: "query",
    icon: "🔗",
    animation: "flip",
    displayName: "链接图谱",
    loadingText: "正在获取链接关系...",
    successText: "已获取链接图谱",
    successIcon: "✅",
  },
  getSavedAiConversations: {
    category: "query",
    icon: "💬",
    animation: "flip",
    displayName: "历史对话",
    loadingText: "正在获取历史对话...",
    successText: "已获取对话记录",
    successIcon: "✅",
  },
};

/**
 * Get display configuration for a tool
 * @param toolName - The name of the tool
 * @returns ToolDisplayConfig for the specified tool, or default config if not found
 */
export function getToolDisplayConfig(toolName: string): ToolDisplayConfig {
  if (isSkillToolName(toolName)) {
    return { ...SKILL_CONFIG, displayName: getSkillDisplayName(toolName) };
  }
  return TOOL_CONFIGS[toolName] || DEFAULT_CONFIG;
}

/**
 * Generate result summary from tool result
 * @param toolName - The name of the tool
 * @param result - The raw result string (may be JSON or plain text)
 * @returns Human-readable summary
 */
export function generateResultSummary(toolName: string, result: string): string {
  const config = getToolDisplayConfig(toolName);

  // Try to parse as JSON for count-based summaries
  try {
    const parsed = JSON.parse(result);

    // Search results - count items
    if (config.category === "search") {
      if (Array.isArray(parsed)) {
        return `找到 ${parsed.length} 条结果`;
      }
      if (parsed.blocks && Array.isArray(parsed.blocks)) {
        return `找到 ${parsed.blocks.length} 条结果`;
      }
      if (parsed.results && Array.isArray(parsed.results)) {
        return `找到 ${parsed.results.length} 条结果`;
      }
    }

    // Create results - show success message
    if (config.category === "create") {
      if (parsed.success) {
        if (toolName === "createBlock" && parsed.blockId) {
          return `已创建块 #${parsed.blockId}`;
        }
        if (toolName === "createPage" && parsed.pageName) {
          return `已创建页面「${parsed.pageName}」`;
        }
        if (toolName === "insertTag" && parsed.tagName) {
          return `已添加标签 #${parsed.tagName}`;
        }
        return config.successText;
      }
      if (parsed.error) {
        return `失败: ${parsed.error.slice(0, 50)}`;
      }
    }

    // Query results - generic success
    if (config.category === "query") {
      return config.successText;
    }
  } catch {
    // Not JSON, use as-is or truncate
  }

  // Fallback: truncate long results
  if (result.length > 60) {
    return result.slice(0, 57) + "...";
  }
  return result || config.successText;
}
