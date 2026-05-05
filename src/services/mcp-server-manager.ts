/**
 * MCP Server Manager
 *
 * 管理多个 MCP 服务器的连接生命周期：
 * - 连接/断开服务器
 * - 发现远程工具并转换为 OpenAI function-calling 格式
 * - 路由工具调用到对应的远程服务器
 */

import type { OpenAITool } from "./openai-client";
import {
  createMCPClient,
  formatMCPToolResult,
  type MCPToolDefinition,
} from "./mcp-client";
import {
  mcpStore,
  loadMcpSettings,
  setServerStatus,
} from "../store/mcp-store";

// ─── 工具名命名空间 ──────────────────────────────────────────────────────────

const MCP_TOOL_PREFIX = "mcp__";

function sanitizeMcpIdentifier(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildMcpOpenAIName(serverId: string, originalName: string): string {
  return `${MCP_TOOL_PREFIX}${sanitizeMcpIdentifier(serverId)}__${sanitizeMcpIdentifier(originalName)}`;
}

function parseMcpOpenAIName(openaiName: string): { serverId: string; originalName: string } | null {
  if (!openaiName.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = openaiName.slice(MCP_TOOL_PREFIX.length);
  const sepIndex = rest.indexOf("__");
  if (sepIndex === -1) return null;
  return { serverId: rest.slice(0, sepIndex), originalName: rest.slice(sepIndex + 2) };
}

// ─── 运行时状态（模块级，不持久化）──────────────────────────────────────────

// openaiToolName → { serverId, originalName }
const toolRegistry = new Map<string, { serverId: string; originalName: string }>();

// serverId → MCPClient
const activeConnections = new Map<string, ReturnType<typeof createMCPClient>>();

// 缓存的 OpenAITool[]，供 getTools() 同步读取
let cachedMcpOpenAITools: OpenAITool[] = [];

// ─── Schema 转换 ─────────────────────────────────────────────────────────────

function convertMCPToolToOpenAI(
  serverId: string,
  mcpTool: MCPToolDefinition
): OpenAITool | null {
  if (!mcpTool.name) return null;

  const openaiName = buildMcpOpenAIName(serverId, mcpTool.name);
  const inputSchema = mcpTool.inputSchema ?? { type: "object" } as any;

  const openaiTool: OpenAITool = {
    type: "function",
    function: {
      name: openaiName,
      description: mcpTool.description
        ? `[${serverId}] ${mcpTool.description}`
        : `MCP 工具来自服务器 "${serverId}"`,
      parameters: {
        type: "object",
        properties: inputSchema.properties ?? {},
        required: inputSchema.required ?? [],
      },
    },
  };

  toolRegistry.set(openaiName, { serverId, originalName: mcpTool.name });
  return openaiTool;
}

// ─── 缓存重建 ────────────────────────────────────────────────────────────────

function rebuildCachedTools(): void {
  const tools: OpenAITool[] = [];
  for (const [name, { serverId }] of toolRegistry) {
    // 从 toolRegistry 无法重建完整 schema，但 getAllDiscoveredTools()
    // 只在 init 阶段被 getTools() 调用，此时缓存已在 connectToServer 中填充
  }
  // 实际缓存在 connectToServer 中填充
}

// ─── 公共 API ────────────────────────────────────────────────────────────────

/** 获取所有已发现的外部 MCP 工具（同步） */
export function getAllDiscoveredTools(): OpenAITool[] {
  return cachedMcpOpenAITools;
}

/** 检查工具名是否为外部 MCP 工具 */
export function isExternalMcpTool(toolName: string): boolean {
  return toolName.startsWith(MCP_TOOL_PREFIX);
}

/** 调用远程 MCP 工具 */
export async function callRemoteTool(toolName: string, args: any): Promise<string> {
  const entry = toolRegistry.get(toolName);
  if (!entry) {
    return `Error: 未知的 MCP 工具 "${toolName}"`;
  }

  const client = activeConnections.get(entry.serverId);
  if (!client) {
    return `Error: MCP 服务器 "${entry.serverId}" 未连接`;
  }

  try {
    const result = await client.callTool(entry.originalName, args);
    return formatMCPToolResult(result);
  } catch (err: any) {
    return `Error executing MCP tool "${entry.originalName}" on server "${entry.serverId}": ${err?.message ?? "Unknown error"}`;
  }
}

// ─── 连接管理 ────────────────────────────────────────────────────────────────

/** 连接到单个 MCP 服务器并发现工具 */
export async function connectToServer(serverId: string): Promise<void> {
  const server = mcpStore.servers.find((s) => s.id === serverId);
  if (!server) throw new Error(`服务器 "${serverId}" 未找到`);

  // 断开旧连接
  await disconnectFromServer(serverId);

  const client = createMCPClient(server);

  try {
    await client.initialize();
    const tools = await client.listTools();

    activeConnections.set(serverId, client);

    // 转换并注册所有工具
    const converted: OpenAITool[] = [];
    for (const mcpTool of tools) {
      const openAITool = convertMCPToolToOpenAI(serverId, mcpTool);
      if (openAITool) converted.push(openAITool);
    }

    // 重建全局缓存：移除该 server 旧条目 + 添加新条目
    cachedMcpOpenAITools = [
      ...cachedMcpOpenAITools.filter((t) => {
        const parsed = parseMcpOpenAIName(t.function.name);
        return parsed?.serverId !== serverId;
      }),
      ...converted,
    ];

    setServerStatus(serverId, {
      config: server,
      connected: true,
      toolCount: converted.length,
      error: undefined,
      lastConnectedAt: Date.now(),
    });

    console.log(`[MCP] 已连接 "${server.name}": ${converted.length} 个工具`);
  } catch (err: any) {
    activeConnections.delete(serverId);
    setServerStatus(serverId, {
      config: server,
      connected: false,
      toolCount: 0,
      error: err?.message ?? "Unknown error",
      lastErrorAt: Date.now(),
    });
    console.warn(`[MCP] 服务器 "${server.name}" 连接失败:`, err?.message);
    // 不抛出，由 Promise.allSettled 处理
  }
}

/** 断开与服务器的连接 */
export async function disconnectFromServer(serverId: string): Promise<void> {
  const client = activeConnections.get(serverId);
  if (client) {
    client.close();
    activeConnections.delete(serverId);
  }

  // 从注册表和缓存中移除该服务器的工具
  for (const [name, entry] of toolRegistry) {
    if (entry.serverId === serverId) {
      toolRegistry.delete(name);
    }
  }
  cachedMcpOpenAITools = cachedMcpOpenAITools.filter((t) => {
    const parsed = parseMcpOpenAIName(t.function.name);
    return parsed?.serverId !== serverId;
  });

  setServerStatus(serverId, {
    connected: false,
    toolCount: 0,
  });
}

/** 初始化所有已配置的 MCP 服务器（不阻塞） */
export async function initMcpServers(): Promise<void> {
  await loadMcpSettings();

  if (mcpStore.servers.length === 0) {
    console.log("[MCP] 无已配置的 MCP 服务器，跳过初始化");
    return;
  }

  console.log(`[MCP] 正在连接 ${mcpStore.servers.length} 个服务器...`);

  const results = await Promise.allSettled(
    mcpStore.servers.map((server) => connectToServer(server.id))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  console.log(`[MCP] 初始化完成: ${succeeded} 成功, ${failed} 失败`);
}
