/**
 * Tool-Prompt 加载器服务
 * 
 * 功能：
 * 1. 按需加载工具的详细说明文件
 * 2. 如果用户文件被删除，自动从代码中的默认模板恢复
 * 3. 用户修改的内容不会被覆盖
 * 
 * 存储位置（与 Skills 相同的模式）：
 * 全局存储 (pluginAsRoot: true):
 *   {plugin-dir}/Tool-Prompt/{tool-name}.md
 *   - 所有仓库共享
 * 
 * 局部存储 (pluginAsRoot: false): [暂不使用]
 *   {repo}/plugin-data/ai-chat/Tool-Prompt/{tool-name}.md
 *   - 仅当前仓库可见
 */

import { getDefaultToolPrompt, getDefaultToolNames } from "./tool-prompt-defaults";
import { getAiChatPluginName } from "../ui/ai-chat-ui";

// Tool-Prompt 目录名
const TOOL_PROMPT_DIR = "Tool-Prompt";

/**
 * 工具说明的缓存（避免重复读取文件）
 */
const promptCache = new Map<string, { content: string; loadedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// ─────────────────────────────────────────────────────────────────────────────
// Scope Helpers - 与 skills-manager 相同的存储模式
// ─────────────────────────────────────────────────────────────────────────────

/** 获取插件名称（动态，与 skills-manager 保持一致） */
function getPluginName(): string {
  const name = getAiChatPluginName();
  return name || "ai-chat";
}

/** 构建 Tool-Prompt 文件路径 */
function buildToolPromptPath(toolName: string): string {
  return `${TOOL_PROMPT_DIR}/${toolName}.md`;
}

/** 读取文件（全局存储） */
async function readFileForScope(path: string): Promise<string | null> {
  const pluginName = getPluginName();
  const isGlobal = true; // Tool-Prompt 使用全局存储
  try {
    const content = await orca.plugins.readFile(pluginName, path, "string", isGlobal);
    if (!content) return null;
    return typeof content === 'string'
      ? content
      : new TextDecoder().decode(new Uint8Array(content as ArrayBuffer));
  } catch {
    return null;
  }
}

/** 写入文件（全局存储） */
async function writeFileForScope(path: string, content: string): Promise<void> {
  const pluginName = getPluginName();
  const isGlobal = true;
  await orca.plugins.writeFile(pluginName, path, content, isGlobal);
}

/** 列出所有文件（全局存储） */
async function listFilesForScope(): Promise<string[]> {
  const pluginName = getPluginName();
  const isGlobal = true;
  return orca.plugins.listFiles(pluginName, isGlobal);
}

/** 检查文件是否存在 */
async function fileExistsForScope(path: string): Promise<boolean> {
  const content = await readFileForScope(path);
  return content !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 读取工具说明文件
 * @param toolName 工具名称
 * @returns 工具的详细说明内容，如果不存在返回 null
 */
export async function loadToolPrompt(toolName: string): Promise<string | null> {
  // 检查缓存
  const cached = promptCache.get(toolName);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.content;
  }

  const filePath = buildToolPromptPath(toolName);

  try {
    // 先尝试读取用户文件
    let content = await readFileForScope(filePath);
    
    if (content === null) {
      // 用户文件不存在，从代码中的默认模板恢复
      const defaultContent = getDefaultToolPrompt(toolName);
      
      if (defaultContent !== null) {
        // 恢复文件到 Tool-Prompt 目录
        await writeFileForScope(filePath, defaultContent);
        content = defaultContent;
        console.log(`[ToolPromptLoader] Restored ${toolName}.md from code defaults`);
      }
    }

    if (content !== null) {
      // 更新缓存
      promptCache.set(toolName, { content, loadedAt: Date.now() });
    }

    return content;
  } catch (e) {
    console.error(`[ToolPromptLoader] Failed to load prompt for ${toolName}:`, e);
    return null;
  }
}

/**
 * 批量加载多个工具的说明
 * @param toolNames 工具名称数组
 * @returns 工具名称到说明内容的映射
 */
export async function loadToolPrompts(toolNames: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  await Promise.all(
    toolNames.map(async (name) => {
      const content = await loadToolPrompt(name);
      if (content) {
        results.set(name, content);
      }
    })
  );

  return results;
}

/**
 * 清除指定工具的缓存
 */
export function clearToolPromptCache(toolName?: string): void {
  if (toolName) {
    promptCache.delete(toolName);
  } else {
    promptCache.clear();
  }
}

/**
 * 获取所有可用的工具说明文件列表
 */
export async function listAvailableToolPrompts(): Promise<string[]> {
  try {
    const files = await listFilesForScope();
    const toolPromptPrefix = `${TOOL_PROMPT_DIR}/`;
    
    return files
      .filter(f => {
        const normalized = f.replace(/\\/g, "/");
        return normalized.startsWith(toolPromptPrefix) && 
               normalized.endsWith(".md") && 
               !normalized.includes("/_");
      })
      .map(f => {
        const normalized = f.replace(/\\/g, "/");
        const fileName = normalized.slice(toolPromptPrefix.length);
        return fileName.replace(".md", "");
      });
  } catch (e) {
    console.error("[ToolPromptLoader] Failed to list tool prompts:", e);
    return [];
  }
}

/**
 * 初始化工具说明目录
 * 确保所有默认文件都已复制到用户目录
 */
export async function initToolPrompts(): Promise<void> {
  try {
    // 从代码中的默认模板初始化
    const defaultToolNames = getDefaultToolNames();
    
    for (const toolName of defaultToolNames) {
      const filePath = buildToolPromptPath(toolName);
      const exists = await fileExistsForScope(filePath);
      
      if (!exists) {
        const defaultContent = getDefaultToolPrompt(toolName);
        if (defaultContent) {
          await writeFileForScope(filePath, defaultContent);
          console.log(`[ToolPromptLoader] Initialized ${toolName}.md`);
        }
      }
    }
  } catch (e) {
    console.error("[ToolPromptLoader] Failed to init tool prompts:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具说明注入
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 为工具调用注入详细说明
 * 在 AI 决定调用某个工具后，加载并返回详细说明
 * 
 * @param toolName 工具名称
 * @param toolArgs 工具参数
 * @returns 包含详细说明的上下文字符串
 */
export async function getToolInstructionContext(toolName: string, toolArgs?: Record<string, any>): Promise<string | null> {
  const prompt = await loadToolPrompt(toolName);
  if (!prompt) return null;

  return `
## 工具详细说明：${toolName}

${prompt}

---
以上是工具 \`${toolName}\` 的详细使用说明，请根据说明正确使用工具。
`;
}

/**
 * 格式化工具调用前的提示信息
 */
export function formatToolCallContext(toolName: string, instruction: string | null): string {
  if (!instruction) {
    return `正在调用工具: ${toolName}`;
  }
  return instruction;
}
