/**
 * Orca Note 工具执行器（已清空内建工具，改为通过 MCP 协议执行外部工具）
 */

export async function executeMcpTool(_toolName: string, _args: any): Promise<string> {
  return JSON.stringify({ success: false, error: "内建工具已移除，请使用 MCP 外部工具" });
}

export function isMcpTool(_toolName: string): boolean {
  return false;
}
