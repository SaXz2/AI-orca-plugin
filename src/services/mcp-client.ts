/**
 * MCP JSON-RPC 2.0 HTTP 客户端
 *
 * 纯 HTTP 传输层，实现标准 MCP 协议：
 * - initialize → 握手协商协议版本和能力
 * - tools/list → 发现远程工具
 * - tools/call → 调用远程工具
 *
 * 不依赖 Valtio / React，可独立测试。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface MCPServerConfig {
  id: string;
  name: string;
  type: "http";
  url: string;
  headers: Record<string, string>;
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: "object";
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface MCPRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any;
  id: number;
}

interface MCPResponse {
  jsonrpc: "2.0";
  result?: any;
  error?: { code: number; message: string };
  id: number;
}

// ─── 客户端工厂 ──────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 10000;

export function createMCPClient(config: MCPServerConfig) {
  let nextId = 1;

  async function sendRequest(method: string, params?: any): Promise<any> {
    const id = nextId++;
    const body: MCPRequest = { jsonrpc: "2.0", method, params, id };

    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`MCP HTTP ${response.status}: ${response.statusText}`);
    }

    let data: MCPResponse;
    try {
      data = await response.json();
    } catch {
      throw new Error("MCP 响应 JSON 解析失败");
    }

    if (data.error) {
      throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
    }

    return data.result;
  }

  return {
    config,

    async initialize(): Promise<void> {
      await sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "orca-ai-chat", version: "1.0.0" },
      });
      // 发送 initialized 通知（无需等待响应）
      await sendRequest("notifications/initialized", {});
    },

    async listTools(): Promise<MCPToolDefinition[]> {
      const result = await sendRequest("tools/list", {});
      return result?.tools ?? [];
    },

    async callTool(name: string, args?: any): Promise<any> {
      return sendRequest("tools/call", { name, arguments: args ?? {} });
    },

    close(): void {
      // HTTP 客户端无需显式断开连接
    },
  };
}

// ─── 结果格式化 ──────────────────────────────────────────────────────────────

const MAX_OUTPUT_LENGTH = 30000;

/**
 * 将 MCP tools/call 返回结果格式化为展示用的字符串
 * MCP 结果包含 content 数组 (text / resource / image 等)
 */
export function formatMCPToolResult(result: any): string {
  if (!result || !Array.isArray(result.content)) {
    const s = typeof result === "string" ? result : JSON.stringify(result ?? {});
    return s.length > MAX_OUTPUT_LENGTH ? s.slice(0, MAX_OUTPUT_LENGTH) + "\n... (截断)" : s;
  }

  const parts: string[] = [];
  for (const item of result.content) {
    if (item.type === "text" && item.text) {
      parts.push(item.text);
    } else if (item.type === "resource") {
      const uri = item.resource?.uri ?? "unknown";
      const text = item.resource?.text;
      if (text) {
        parts.push(`[Resource: ${uri}]\n${text}`);
      } else {
        parts.push(`[Resource: ${uri}]`);
      }
    } else if (item.type === "image") {
      parts.push(`[Image: ${item.data?.slice(0, 50) ?? "binary"}...]`);
    } else {
      parts.push(JSON.stringify(item));
    }
  }

  const output = parts.filter(Boolean).join("\n");
  return output.length > MAX_OUTPUT_LENGTH
    ? output.slice(0, MAX_OUTPUT_LENGTH) + "\n... (截断)"
    : output;
}
