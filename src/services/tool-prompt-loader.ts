/**
 * Tool-Prompt 加载器服务
 * 
 * 功能：
 * 1. 按需加载工具的详细说明文件
 * 2. 如果用户文件被删除，自动从代码中的默认模板恢复
 * 3. 用户修改的内容不会被覆盖
 */

import { getDefaultToolPrompt, getDefaultToolNames } from "./tool-prompt-defaults";

// 插件根目录下的 Tool-Prompt 目录路径
const TOOL_PROMPT_DIR = "Tool-Prompt";

/**
 * 工具说明的缓存（避免重复读取文件）
 */
const promptCache = new Map<string, { content: string; loadedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取插件的基础路径
 */
function getPluginBasePath(): string {
  // 获取当前插件的路径
  // 在 Orca 插件环境中，可以通过 orca.state.plugins 获取
  try {
    const plugins = (orca.state as any).plugins;
    if (plugins) {
      for (const [id, plugin] of Object.entries(plugins)) {
        if (id.includes("ai-chat") || id.includes("AI-orca")) {
          return (plugin as any).path || "";
        }
      }
    }
  } catch (e) {
    console.warn("[ToolPromptLoader] Failed to get plugin path:", e);
  }
  return "";
}

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

  const basePath = getPluginBasePath();
  if (!basePath) {
    console.warn("[ToolPromptLoader] Plugin base path not found");
    return null;
  }

  const userFilePath = `${basePath}/${TOOL_PROMPT_DIR}/${toolName}.md`;

  try {
    // 先尝试读取用户文件
    let content = await tryReadFile(userFilePath);
    
    if (content === null) {
      // 用户文件不存在，从代码中的默认模板恢复
      const defaultContent = getDefaultToolPrompt(toolName);
      
      if (defaultContent !== null) {
        // 恢复文件到 Tool-Prompt 目录
        await ensureDir(`${basePath}/${TOOL_PROMPT_DIR}`);
        await writeFile(userFilePath, defaultContent);
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
  const basePath = getPluginBasePath();
  if (!basePath) return [];

  const dirPath = `${basePath}/${TOOL_PROMPT_DIR}`;
  
  try {
    const files = await listDir(dirPath);
    return files
      .filter(f => f.endsWith(".md") && !f.startsWith("_"))
      .map(f => f.replace(".md", ""));
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
  const basePath = getPluginBasePath();
  if (!basePath) return;

  const userPath = `${basePath}/${TOOL_PROMPT_DIR}`;

  try {
    // 确保目录存在
    await ensureDir(userPath);
    
    // 从代码中的默认模板初始化
    const defaultToolNames = getDefaultToolNames();
    
    for (const toolName of defaultToolNames) {
      const userFilePath = `${userPath}/${toolName}.md`;
      const exists = await fileExists(userFilePath);
      
      if (!exists) {
        const defaultContent = getDefaultToolPrompt(toolName);
        if (defaultContent) {
          await writeFile(userFilePath, defaultContent);
          console.log(`[ToolPromptLoader] Initialized ${toolName}.md`);
        }
      }
    }
  } catch (e) {
    console.error("[ToolPromptLoader] Failed to init tool prompts:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 文件操作辅助函数（适配 Orca 环境）
// ─────────────────────────────────────────────────────────────────────────────

async function tryReadFile(path: string): Promise<string | null> {
  try {
    // 使用 Orca 的文件 API 或 fetch
    const orcaAny = typeof orca !== "undefined" ? (orca as any) : null;
    if (orcaAny?.fs?.readTextFile) {
      return await orcaAny.fs.readTextFile(path);
    }
    
    // 备用：使用 fetch（如果是相对路径）
    const response = await fetch(path);
    if (response.ok) {
      return await response.text();
    }
    return null;
  } catch {
    return null;
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  try {
    const orcaAny = typeof orca !== "undefined" ? (orca as any) : null;
    if (orcaAny?.fs?.writeTextFile) {
      await orcaAny.fs.writeTextFile(path, content);
    }
  } catch (e) {
    console.error(`[ToolPromptLoader] Failed to write file ${path}:`, e);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const orcaAny = typeof orca !== "undefined" ? (orca as any) : null;
    if (orcaAny?.fs?.exists) {
      return await orcaAny.fs.exists(path);
    }
    const content = await tryReadFile(path);
    return content !== null;
  } catch {
    return false;
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    const orcaAny = typeof orca !== "undefined" ? (orca as any) : null;
    if (orcaAny?.fs?.readDir) {
      const entries = await orcaAny.fs.readDir(path);
      return entries.map((e: any) => e.name || e);
    }
    return [];
  } catch {
    return [];
  }
}

async function ensureDir(path: string): Promise<void> {
  try {
    const orcaAny = typeof orca !== "undefined" ? (orca as any) : null;
    if (orcaAny?.fs?.createDir) {
      await orcaAny.fs.createDir(path, { recursive: true });
    }
  } catch {
    // 目录可能已存在，忽略错误
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
