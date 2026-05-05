/**
 * Orca Note 工具定义（已清空内建工具，改为通过 MCP 协议获取外部工具）
 */

import type { OpenAITool } from "./openai-client";

export const ORCA_MCP_TOOLS: OpenAITool[] = [];

export function getMcpToolNames(): string[] {
  return [];
}

export function getMcpToolDefinition(_toolName: string): OpenAITool | undefined {
  return undefined;
}
