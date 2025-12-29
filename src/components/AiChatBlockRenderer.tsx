/**
 * AiChatBlockRenderer - AI 对话块自定义渲染器
 * 用于在 Orca 笔记中渲染保存的 AI 对话
 * 
 * 复用 MessageList 组件，与 AiChatPanel 保持完全一致的渲染效果
 */

import type { Block, DbId } from "../orca.d.ts";
import MessageList from "./MessageList";
import ChatNavigation from "./ChatNavigation";
import type { Message } from "../services/session-service";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useRef: <T>(value: T) => { current: T };
};
const { createElement, useState, useMemo, useRef } = React;
const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { BlockShell, BlockChildren } = orca.components;

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
  title?: string;
  messages?: Message[];
  model?: string;
  createdAt?: number;
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
  title: propTitle,
  messages: propMessages,
  model: propModel,
  createdAt: propCreatedAt,
}: Props) {
  const { blocks } = useSnapshot(orca.state);
  const block = blocks[mirrorId ?? blockId] as any;
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 样式由 ai-chat-renderer.ts 的 MutationObserver 自动维护

  // 从 block._repr 或 props 获取数据
  const repr = block?._repr || {};
  const title = propTitle || repr.title || "AI 对话";
  const messages: Message[] = propMessages || repr.messages || [];
  const model = propModel || repr.model || "";
  const createdAt = propCreatedAt || repr.createdAt;

  // 显示的消息（折叠时只显示前3条）
  const displayMessages = useMemo(() => {
    if (!messages || !Array.isArray(messages)) return [];
    if (expanded) return messages;
    return messages.slice(0, 3);
  }, [messages, expanded]);

  const hasMore = messages && messages.length > 3;

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

  // 内容 JSX
  const contentJsx = createElement(
    "div",
    {
      style: {
        background: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        border: "1px solid var(--orca-color-border)",
        overflow: "hidden",
        position: "relative",
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
          padding: "12px 16px",
          borderBottom: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-2)",
        },
      },
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        createElement("i", {
          className: "ti ti-message-chatbot",
          style: { fontSize: "18px", color: "var(--orca-color-primary)" },
        }),
        createElement(
          "span",
          { style: { fontWeight: 600, fontSize: "15px", color: "var(--orca-color-text-1)" } },
          title
        ),
        messages && createElement(
          "span",
          {
            style: {
              fontSize: "11px",
              color: "var(--orca-color-text-3)",
              background: "var(--orca-color-bg-3)",
              padding: "2px 8px",
              borderRadius: "10px",
            },
          },
          `${messages.length} 条消息`
        )
      ),
      createElement(
        "div",
        { style: { fontSize: "11px", color: "var(--orca-color-text-3)", display: "flex", alignItems: "center", gap: "8px" } },
        model && createElement(
          "span",
          {
            style: {
              background: "var(--orca-color-bg-3)",
              padding: "2px 8px",
              borderRadius: "4px",
            },
          },
          model
        ),
        createdAt && new Date(createdAt).toLocaleDateString("zh-CN")
      )
    ),
    // 消息列表外层容器（用于目录导航定位）
    createElement(
      "div",
      {
        style: {
          position: "relative",
          overflow: "hidden", // 隐藏目录面板溢出
        },
      },
      // 消息列表滚动容器
      createElement(
        "div",
        {
          ref: listRef as any,
          style: {
            maxHeight: expanded ? "800px" : "400px",
            overflow: "auto",
          },
        },
        // 消息列表 - 使用共享的 MessageList 组件，只读模式
        createElement(MessageList, {
          messages: displayMessages,
          readonly: true,
          style: {
            padding: "16px",
          },
        })
      ),
      // 目录导航（固定在容器内）
      messages.length > 2 && createElement(ChatNavigation, {
        messages: displayMessages,
        listRef: listRef as any,
        visible: true,
      })
    ),
    // 展开/收起按钮
    hasMore &&
      createElement(
        "div",
        {
          style: {
            textAlign: "center",
            padding: "12px",
            borderTop: "1px dashed var(--orca-color-border)",
            background: "var(--orca-color-bg-2)",
          },
        },
        createElement(
          "button",
          {
            onClick: () => setExpanded(!expanded),
            style: {
              background: "var(--orca-color-bg-3)",
              border: "1px solid var(--orca-color-border)",
              color: "var(--orca-color-primary)",
              cursor: "pointer",
              fontSize: "12px",
              padding: "6px 16px",
              borderRadius: "16px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.2s",
            },
          },
          createElement("i", { className: expanded ? "ti ti-chevron-up" : "ti ti-chevron-down" }),
          expanded ? "收起" : `展开剩余 ${messages.length - 3} 条`
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
    droppable: true, // 允许拖拽块到此块下
  });
}
