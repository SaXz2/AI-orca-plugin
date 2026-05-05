/**
 * MCP Store
 *
 * 管理 MCP 服务器配置和连接状态。
 * 持久化方式：orca.plugins.setData/getData + localStorage（与 tool-store.ts 一致）
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
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const mcpStore = proxy<MCPStore>({
  servers: [],
  serverStatuses: {},
});

// ─── 默认配置 ────────────────────────────────────────────────────────────────

const DEFAULT_MCP_SERVER: MCPServerConfig = {
  id: "orca-note",
  name: "Orca Note MCP",
  type: "http",
  url: "http://localhost:18672/mcp",
  headers: { Authorization: "Bearer orca-mcp" },
};

// ─── 持久化 Key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "ai-chat-mcp-servers";

async function saveMcpSettings(): Promise<void> {
  try {
    const data = JSON.stringify(mcpStore.servers);
    localStorage.setItem(STORAGE_KEY, data);
    await orca.plugins.setData("ai-chat", STORAGE_KEY, data);
  } catch (e) {
    console.warn("[MCP Store] 保存配置失败:", e);
  }
}

export async function loadMcpSettings(): Promise<void> {
  try {
    let raw: string | null = null;
    try {
      raw = (await orca.plugins.getData("ai-chat", STORAGE_KEY)) as string | null;
    } catch {
      // 回退到 localStorage
    }
    if (!raw) {
      raw = localStorage.getItem(STORAGE_KEY);
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        mcpStore.servers = parsed;
      }
    }
  } catch (e) {
    console.warn("[MCP Store] 加载配置失败:", e);
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function ensureDefaultMcpServer(): void {
  if (mcpStore.servers.length === 0) {
    addMcpServer(DEFAULT_MCP_SERVER);
  }
}

export function addMcpServer(config: MCPServerConfig): void {
  // 如果已存在同 ID 配置则跳过
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
