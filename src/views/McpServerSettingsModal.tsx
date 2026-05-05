/**
 * MCP Server Settings Modal - 管理 MCP 服务器连接
 */
import {
  mcpStore,
  addMcpServer,
  removeMcpServer,
  updateMcpServer,
  setServerStatus,
} from "../store/mcp-store";
import { connectToServer, disconnectFromServer } from "../services/mcp-server-manager";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useState, useEffect } = React;
const { Button } = orca.components;

interface Props { isOpen: boolean; onClose: () => void; }

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function McpServerSettingsModal({ isOpen, onClose }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [newServer, setNewServer] = useState<{ name: string; url: string; authHeader: string } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setEditingId(null);
      setNewServer(null);
    }
  }, [isOpen]);

  const handleConnect = async (serverId: string) => {
    setConnectingId(serverId);
    try {
      await connectToServer(serverId);
      orca.notify("success", "MCP 服务器连接成功");
    } catch (e: any) {
      orca.notify("error", e?.message || "连接失败");
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnect = async (serverId: string) => {
    try {
      await disconnectFromServer(serverId);
      orca.notify("success", "已断开连接");
    } catch (e: any) {
      orca.notify("error", e?.message || "断开失败");
    }
  };

  const handleAddServer = () => {
    const name = newServer?.name?.trim();
    const url = newServer?.url?.trim();
    if (!name || !url) {
      orca.notify("warn", "请填写服务器名称和 URL");
      return;
    }
    const headers: Record<string, string> = {};
    if (newServer?.authHeader?.trim()) {
      headers["Authorization"] = newServer.authHeader.trim();
    }
    addMcpServer({
      id: generateId(),
      name,
      type: "http",
      url,
      headers,
    });
    setNewServer(null);
    orca.notify("success", "服务器已添加");
  };

  const handleDelete = (serverId: string) => {
    disconnectFromServer(serverId).catch(() => {});
    removeMcpServer(serverId);
    orca.notify("success", "服务器已删除");
  };

  if (!isOpen) return null;

  const servers = mcpStore.servers;

  // ─── Styles ──────────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
    justifyContent: "center", zIndex: 1000,
  };
  const modal: React.CSSProperties = {
    background: "var(--orca-color-bg-1)", borderRadius: 12, padding: 24,
    width: 560, maxWidth: "90vw", maxHeight: "85vh", overflow: "auto",
  };
  const title: React.CSSProperties = {
    fontSize: 18, fontWeight: 600, marginBottom: 16,
    color: "var(--orca-color-text-1)", display: "flex", alignItems: "center", gap: 8,
  };
  const section: React.CSSProperties = {
    marginBottom: 8, padding: 12, background: "var(--orca-color-bg-2)", borderRadius: 8,
  };
  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
  };
  const label: React.CSSProperties = { fontSize: 14, color: "var(--orca-color-text-1)" };
  const desc: React.CSSProperties = { fontSize: 12, color: "var(--orca-color-text-3)", marginTop: 4 };
  const input: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 6,
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-1)", color: "var(--orca-color-text-1)",
    fontSize: 13, width: "100%", boxSizing: "border-box", marginBottom: 8,
  };
  const iconBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer", padding: 4,
    color: "var(--orca-color-text-2)", fontSize: 16,
  };
  const addBtn: React.CSSProperties = {
    marginTop: 12, padding: "8px 16px", borderRadius: 6,
    background: "var(--orca-color-primary)", color: "#fff",
    border: "none", cursor: "pointer", fontSize: 13, width: "100%",
  };
  const statusDot: React.CSSProperties = {
    width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 6,
  };

  return createElement("div", { style: overlay, onClick: onClose },
    createElement("div", { style: modal, onClick: (e: any) => e.stopPropagation() },
      createElement("div", { style: title },
        createElement("i", { className: "ti ti-plug-connected", style: { color: "var(--orca-color-primary)" } }),
        "MCP 服务器"
      ),

      // 服务器列表
      servers.length === 0 && !newServer && createElement("div", {
        style: { ...desc, padding: 24, textAlign: "center", background: "var(--orca-color-bg-2)", borderRadius: 8, marginBottom: 12 },
      }, "还没有添加 MCP 服务器，点击下方按钮添加"),

      servers.map((server) => {
        const status = mcpStore.serverStatuses[server.id];
        const isConnected = status?.connected ?? false;
        const isConnecting = connectingId === server.id;
        const toolCount = status?.toolCount ?? 0;
        const error = status?.error;
        const isEditing = editingId === server.id;

        return createElement("div", {
          key: server.id,
          style: { ...section, border: isEditing ? "1px solid var(--orca-color-primary)" : "1px solid transparent" },
        },
          // 头部
          createElement("div", { style: row },
            createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
              createElement("span", {
                style: { ...statusDot, background: isConnected ? "var(--orca-color-success)" : "var(--orca-color-text-3)" },
              }),
              createElement("span", { style: { ...label, fontWeight: 500 } }, server.name),
              isConnected && createElement("span", {
                style: { fontSize: 11, color: "var(--orca-color-success)", background: "rgba(0,200,100,0.1)", padding: "2px 6px", borderRadius: 4 },
              }, toolCount + " 工具"),
              error && !isConnected && createElement("span", {
                style: { fontSize: 11, color: "var(--orca-color-danger)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
              }, error),
            ),
            createElement("div", { style: { display: "flex", gap: 4 } },
              isConnected
                ? createElement("button", {
                  style: { ...iconBtn, color: "var(--orca-color-warning)" },
                  onClick: () => handleDisconnect(server.id),
                }, createElement("i", { className: "ti ti-plug-off" }))
                : createElement("button", {
                  style: { ...iconBtn, color: "var(--orca-color-primary)" },
                  onClick: () => handleConnect(server.id),
                  disabled: isConnecting,
                }, createElement("i", { className: isConnecting ? "ti ti-loader" : "ti ti-plug" })),
              createElement("button", {
                style: iconBtn,
                onClick: () => setEditingId(isEditing ? null : server.id),
              }, createElement("i", { className: isEditing ? "ti ti-chevron-up" : "ti ti-settings" })),
              createElement("button", {
                style: { ...iconBtn, color: "var(--orca-color-danger)" },
                onClick: () => handleDelete(server.id),
              }, createElement("i", { className: "ti ti-trash" })),
            ),
          ),

          createElement("div", {
            style: { ...desc, fontSize: 11, marginTop: 4, wordBreak: "break-all" },
          }, server.url),

          // 展开编辑
          isEditing && createElement("div", {
            style: { marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--orca-color-border)" },
          },
            createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "名称"),
              createElement("input", {
                style: input, value: server.name,
                onChange: (e: any) => updateMcpServer(server.id, { name: e.target.value }),
              }),
            ),
            createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "URL"),
              createElement("input", {
                style: input, value: server.url,
                onChange: (e: any) => updateMcpServer(server.id, { url: e.target.value }),
              }),
            ),
            createElement("div", { style: { marginBottom: 8 } },
              createElement("div", { style: { fontSize: 12, color: "var(--orca-color-text-2)", marginBottom: 4 } }, "Authorization Header (可选)"),
              createElement("input", {
                style: input, placeholder: "Bearer your-token",
                value: server.headers?.Authorization || "",
                onChange: (e: any) => updateMcpServer(server.id, {
                  headers: { ...server.headers, Authorization: e.target.value },
                }),
              }),
            ),
          ),
        );
      }),

      // 新建服务器表单
      newServer ? createElement("div", {
        style: { ...section, border: "1px solid var(--orca-color-primary)", marginTop: 12 },
      },
        createElement("div", { style: { ...label, fontWeight: 600, marginBottom: 8 } }, "添加服务器"),
        createElement("input", {
          style: input, placeholder: "服务器名称",
          value: newServer.name,
          onChange: (e: any) => setNewServer({ ...newServer, name: e.target.value }),
        }),
        createElement("input", {
          style: input, placeholder: "http://localhost:18672/mcp",
          value: newServer.url,
          onChange: (e: any) => setNewServer({ ...newServer, url: e.target.value }),
        }),
        createElement("input", {
          style: input, placeholder: "Bearer orca-mcp (可选)",
          value: newServer.authHeader,
          onChange: (e: any) => setNewServer({ ...newServer, authHeader: e.target.value }),
        }),
        createElement("div", { style: { display: "flex", gap: 8 } },
          createElement("button", {
            style: { ...addBtn, flex: 1, background: "var(--orca-color-success)" },
            onClick: handleAddServer,
          }, "添加"),
          createElement("button", {
            style: { ...addBtn, flex: 1, background: "var(--orca-color-text-3)" },
            onClick: () => setNewServer(null),
          }, "取消"),
        ),
      ) : createElement("button", {
        style: addBtn,
        onClick: () => setNewServer({ name: "", url: "", authHeader: "" }),
      }, "+ 添加 MCP 服务器"),

      // 底部关闭按钮
      createElement("div", {
        style: { display: "flex", justifyContent: "flex-end", marginTop: 16 },
      },
        createElement(Button, { variant: "outline", onClick: onClose }, "关闭"),
      ),
    ),
  );
}
