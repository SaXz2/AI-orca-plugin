/**
 * MCP Store
 *
 * 管理 MCP 服务器配置、连接状态和工具启用/禁用。
 * 持久化方式：orca.plugins.setData/getData + localStorage
 */

import { proxy } from "valtio";
import type { MCPServerConfig } from "../services/mcp-client";

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface MCPServerStatus {
  config: MCPServerConfig;
  connected: boolean;
  toolCount: number;
  error?: string;
  lastConnectedAt?: number;
  lastErrorAt?: number;
}

interface MCPStore {
  servers: MCPServerConfig[];
  serverStatuses: Record<string, MCPServerStatus>;
  /** 被禁用的 MCP 工具名（openaiName 格式: mcp__<serverId>__<toolName>） */
  disabledTools: string[];
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const mcpStore = proxy<MCPStore>({
  servers: [],
  serverStatuses: {},
  disabledTools: [],
});

// ─── 默认配置 ────────────────────────────────────────────────────────────────

const DEFAULT_MCP_SERVER: MCPServerConfig = {
  id: "orca-note",
  name: "Orca Note MCP",
  type: "http",
  url: "http://localhost:18672/mcp",
  headers: { Authorization: "Bearer orca-mcp" },
};

// ─── 持久化 ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ai-chat-mcp-servers";
const DISABLED_KEY = "ai-chat-mcp-disabled-tools";

async function saveMcpSettings(): Promise<void> {
  try {
    const data = JSON.stringify(mcpStore.servers);
    localStorage.setItem(STORAGE_KEY, data);
    await orca.plugins.setData("ai-chat", STORAGE_KEY, data);
  } catch (e) {
    console.warn("[MCP Store] 保存配置失败:", e);
  }
}

async function saveDisabledTools(): Promise<void> {
  try {
    const data = JSON.stringify(mcpStore.disabledTools);
    localStorage.setItem(DISABLED_KEY, data);
    await orca.plugins.setData("ai-chat", DISABLED_KEY, data);
  } catch (e) {
    console.warn("[MCP Store] 保存禁用工具失败:", e);
  }
}

export async function loadMcpSettings(): Promise<void> {
  // 加载服务器配置
  try {
    let raw: string | null = null;
    try {
      raw = (await orca.plugins.getData("ai-chat", STORAGE_KEY)) as string | null;
    } catch {
      // 回退到 localStorage
    }
    if (!raw) raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) mcpStore.servers = parsed;
    }
  } catch (e) {
    console.warn("[MCP Store] 加载配置失败:", e);
  }

  // 加载禁用工具列表
  try {
    let raw: string | null = null;
    try {
      raw = (await orca.plugins.getData("ai-chat", DISABLED_KEY)) as string | null;
    } catch { /* fallback */ }
    if (!raw) raw = localStorage.getItem(DISABLED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) mcpStore.disabledTools = parsed;
    }
  } catch (e) {
    console.warn("[MCP Store] 加载禁用工具失败:", e);
  }
}

// ─── 服务器 CRUD ─────────────────────────────────────────────────────────────

export function ensureDefaultMcpServer(): void {
  if (mcpStore.servers.length === 0) {
    addMcpServer(DEFAULT_MCP_SERVER);
  }
}

export function addMcpServer(config: MCPServerConfig): void {
  if (mcpStore.servers.some((s) => s.id === config.id)) return;
  mcpStore.servers.push(config);
  saveMcpSettings();
}

export function removeMcpServer(id: string): void {
  mcpStore.servers = mcpStore.servers.filter((s) => s.id !== id);
  delete mcpStore.serverStatuses[id];
  saveMcpSettings();
}

export function updateMcpServer(id: string, patch: Partial<MCPServerConfig>): void {
  const idx = mcpStore.servers.findIndex((s) => s.id === id);
  if (idx === -1) return;
  mcpStore.servers[idx] = { ...mcpStore.servers[idx], ...patch };
  saveMcpSettings();
}

export function setServerStatus(id: string, status: Partial<MCPServerStatus>): void {
  const existing = mcpStore.serverStatuses[id] || {
    config: mcpStore.servers.find((s) => s.id === id) || ({} as MCPServerConfig),
    connected: false,
    toolCount: 0,
  };
  mcpStore.serverStatuses[id] = { ...existing, ...status };
}

export function getMcpServers(): MCPServerConfig[] {
  return mcpStore.servers;
}

// ─── 工具启用/禁用 ───────────────────────────────────────────────────────────

export function isMcpToolDisabled(toolName: string): boolean {
  return mcpStore.disabledTools.includes(toolName);
}

export function setMcpToolDisabled(toolName: string, disabled: boolean): void {
  if (disabled) {
    if (!mcpStore.disabledTools.includes(toolName)) {
      mcpStore.disabledTools.push(toolName);
    }
  } else {
    mcpStore.disabledTools = mcpStore.disabledTools.filter((t) => t !== toolName);
  }
  saveDisabledTools();
}

/** 切换工具的启用/禁用状态 */
export function toggleMcpTool(toolName: string): void {
  setMcpToolDisabled(toolName, !isMcpToolDisabled(toolName));
}
