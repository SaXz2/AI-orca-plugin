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
  // Orca Note 原生 MCP 工具
  // ─────────────────────────────────────────────────────────────────────────────
  get_today_journal: {
    category: "query",
    icon: "📅",
    animation: "flip",
    displayName: "今日日志",
    loadingText: "正在获取今日日志...",
    successText: "已获取今日日志",
    successIcon: "✅",
  },
  get_blocks_text: {
    category: "query",
    icon: "📖",
    animation: "flip",
    displayName: "读取块内容",
    loadingText: "正在获取块内容...",
    successText: "已获取块内容",
    successIcon: "✅",
  },
  get_page: {
    category: "query",
    icon: "📄",
    animation: "flip",
    displayName: "查找页面",
    loadingText: "正在查找页面...",
    successText: "已找到页面",
    successIcon: "✅",
  },
  get_tags_and_pages: {
    category: "search",
    icon: "🏷️",
    animation: "pulse",
    displayName: "标签页面列表",
    loadingText: "正在获取标签和页面...",
    successText: "已获取列表",
    successIcon: "✅",
  },
  insert_markdown: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    displayName: "插入内容",
    loadingText: "正在插入内容...",
    successText: "内容已插入",
    successIcon: "✅",
  },
  insert_tags: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    displayName: "添加标签",
    loadingText: "正在添加标签...",
    successText: "标签已添加",
    successIcon: "✅",
  },
  create_page: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    displayName: "创建页面",
    loadingText: "正在创建页面...",
    successText: "页面已创建",
    successIcon: "✅",
  },
  create_tags: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    displayName: "创建标签定义",
    loadingText: "正在创建标签定义...",
    successText: "标签定义已创建",
    successIcon: "✅",
  },
  move_blocks: {
    category: "create",
    icon: "📦",
    animation: "pulse",
    displayName: "移动块",
    loadingText: "正在移动块...",
    successText: "块已移动",
    successIcon: "✅",
  },
  delete_blocks: {
    category: "create",
    icon: "🗑️",
    animation: "pulse",
    displayName: "删除块",
    loadingText: "正在删除块...",
    successText: "块已删除",
    successIcon: "✅",
  },
  remove_tags: {
    category: "create",
    icon: "🏷️",
    animation: "pulse",
    displayName: "移除标签",
    loadingText: "正在移除标签...",
    successText: "标签已移除",
    successIcon: "✅",
  },
  query_blocks: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    displayName: "高级查询",
    loadingText: "正在查询...",
    successText: "查询完成",
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
        if (toolName === "insert_markdown" && parsed.blockId) {
          return `已创建块 #${parsed.blockId}`;
        }
        if (toolName === "create_page" && parsed.pageName) {
          return `已创建页面「${parsed.pageName}」`;
        }
        if (toolName === "insert_tags" && parsed.tagName) {
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
