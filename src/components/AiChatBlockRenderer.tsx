/**
 * AiChatBlockRenderer - AI 对话块自定义渲染器
 * 用于在 Orca 笔记中渲染保存的 AI 对话
 */

import type { Block, DbId } from "../orca.d.ts";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useMemo: <T>(fn: () => T, deps: any[]) => T;
};
const { createElement, useState, useMemo } = React;
const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { BlockShell, BlockChildren } = orca.components;

/** 对话消息类型 */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
}

/** 渲染器 Props */
type Props = {
  panelId: string;
  blockId: DbId;
  rndId: string;
  blockLevel: number;
  indentLevel: number;
  mirrorId?: DbId;
  withBreadcrumb?: boolean;
  initiallyCollapsed?: boolean;
  renderingMode?: "normal" | "simple" | "simple-children" | "readonly";
  // 从 _repr 接收的数据
  title: string;
  messages: ChatMessage[];
  model?: string;
  createdAt?: number;
};

/** 消息气泡样式 */
const messageBubbleStyle = (isUser: boolean): React.CSSProperties => ({
  padding: "8px 12px",
  borderRadius: "12px",
  marginBottom: "8px",
  maxWidth: "85%",
  alignSelf: isUser ? "flex-end" : "flex-start",
  background: isUser ? "var(--orca-color-primary)" : "var(--orca-color-bg-2)",
  color: isUser ? "#fff" : "var(--orca-color-text-1)",
  fontSize: "13px",
  lineHeight: "1.5",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

/** 角色标签样式 */
const roleLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--orca-color-text-3)",
  marginBottom: "2px",
};

export default function AiChatBlockRenderer({
  panelId,
  blockId,
  rndId,
  blockLevel,
  indentLevel,
  mirrorId,
  withBreadcrumb,
  initiallyCollapsed,
  renderingMode,
  title,
  messages,
  model,
  createdAt,
}: Props) {
  const { blocks } = useSnapshot(orca.state);
  const block = blocks[mirrorId ?? blockId];
  const [expanded, setExpanded] = useState(false);

  // 显示的消息（折叠时只显示前2条）
  const displayMessages = useMemo(() => {
    if (!messages || !Array.isArray(messages)) return [];
    if (expanded) return messages;
    return messages.slice(0, 2);
  }, [messages, expanded]);

  const hasMore = messages && messages.length > 2;

  const childrenBlocks = useMemo(
    () =>
      createElement(BlockChildren as any, {
        block: block as Block,
        panelId,
        blockLevel,
        indentLevel,
        renderingMode,
      }),
    [block?.children]
  );

  // 渲染单条消息
  const renderMessage = (msg: ChatMessage, index: number) => {
    const isUser = msg.role === "user";
    return createElement(
      "div",
      {
        key: index,
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: isUser ? "flex-end" : "flex-start",
        },
      },
      createElement("div", { style: roleLabelStyle }, isUser ? "👤 用户" : "🤖 AI"),
      createElement("div", { style: messageBubbleStyle(isUser) }, msg.content)
    );
  };

  // 内容 JSX
  const contentJsx = createElement(
    "div",
    {
      style: {
        padding: "12px",
        background: "var(--orca-color-bg-1)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border)",
      },
    },
    // 标题栏
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--orca-color-border)",
        },
      },
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        createElement("i", {
          className: "ti ti-message-chatbot",
          style: { fontSize: "16px", color: "var(--orca-color-primary)" },
        }),
        createElement(
          "span",
          { style: { fontWeight: 600, color: "var(--orca-color-text-1)" } },
          title || "AI 对话"
        )
      ),
      createElement(
        "div",
        { style: { fontSize: "11px", color: "var(--orca-color-text-3)" } },
        model && createElement("span", { style: { marginRight: "8px" } }, model),
        createdAt && new Date(createdAt).toLocaleDateString("zh-CN")
      )
    ),
    // 消息列表
    createElement(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "4px" } },
      ...displayMessages.map(renderMessage)
    ),
    // 展开/收起按钮
    hasMore &&
      createElement(
        "div",
        {
          style: {
            textAlign: "center",
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px dashed var(--orca-color-border)",
          },
        },
        createElement(
          "button",
          {
            onClick: () => setExpanded(!expanded),
            style: {
              background: "none",
              border: "none",
              color: "var(--orca-color-primary)",
              cursor: "pointer",
              fontSize: "12px",
              padding: "4px 12px",
            },
          },
          expanded ? "收起" : `展开全部 (${messages.length} 条消息)`
        )
      )
  );

  return createElement(BlockShell as any, {
    panelId,
    blockId,
    rndId,
    mirrorId,
    blockLevel,
    indentLevel,
    withBreadcrumb,
    initiallyCollapsed,
    renderingMode,
    reprClassName: "aichat-repr-conversation",
    contentClassName: "aichat-repr-conversation-content",
    contentAttrs: { contentEditable: false },
    contentJsx,
    childrenJsx: childrenBlocks,
  });
}
