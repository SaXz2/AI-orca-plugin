import MarkdownMessage from "../components/MarkdownMessage";
import {
  messageRowStyle,
  messageBubbleStyle,
  cursorStyle,
  actionBarStyle,
  actionButtonStyle,
  toolCardStyle,
  toolHeaderStyle,
  toolBodyStyle,
} from "../styles/ai-chat-styles";
import type { Message } from "../services/session-service";
import type { ToolCallInfo } from "../services/chat-stream-handler";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, Fragment } = React;

interface MessageItemProps {
  message: Message;
  isLastAiMessage?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

// Helper to render Tool Calls
function ToolCallItem({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);

  return createElement(
    "div",
    { style: toolCardStyle },
    createElement(
      "div",
      {
        style: toolHeaderStyle,
        onClick: () => setExpanded(!expanded),
        title: "Click to toggle details",
      },
      createElement("i", { className: expanded ? "ti ti-chevron-down" : "ti ti-chevron-right" }),
      createElement("span", {}, `🔧 ${toolCall.function.name}`),
      !expanded &&
        createElement(
          "span",
          { style: { opacity: 0.6, marginLeft: "auto", fontSize: "0.9em" } },
          "Click to see args"
        )
    ),
    expanded &&
      createElement(
        "div",
        { style: toolBodyStyle },
        createElement("div", { style: { fontWeight: "bold", marginBottom: "4px" } }, "Arguments:"),
        createElement("div", {}, toolCall.function.arguments)
      )
  );
}

// Helper to render Tool Result (role='tool')
function ToolResultItem({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = message.name || "Unknown Tool";

  return createElement(
    "div",
    { style: { ...messageRowStyle("tool"), justifyContent: "center" } }, // Center tool results usually or left? existing was filtered out or part of flow.
    // Actually, design says "Use card style... default collapsed". 
    // And usually tool results are system-like.
    // Let's keep it left-aligned but styled as a card.
    createElement(
      "div",
      { style: { maxWidth: "90%", width: "100%" } },
      createElement(
        "div",
        { style: toolCardStyle },
        createElement(
          "div",
          {
            style: toolHeaderStyle,
            onClick: () => setExpanded(!expanded),
          },
          createElement("i", { className: expanded ? "ti ti-chevron-down" : "ti ti-chevron-right" }),
          createElement("span", {}, `✅ Result: ${toolName}`),
           !expanded &&
            createElement(
              "span",
              { style: { opacity: 0.6, marginLeft: "auto", fontSize: "0.9em" } },
              message.content?.slice(0, 50) + (message.content && message.content.length > 50 ? "..." : "")
            )
        ),
        expanded &&
          createElement(
            "div",
            { style: toolBodyStyle },
            createElement("div", { style: { fontWeight: "bold", marginBottom: "4px" } }, "Output:"),
            createElement("div", {}, message.content)
          )
      )
    )
  );
}

export default function MessageItem({
  message,
  isLastAiMessage,
  isStreaming,
  onRegenerate,
}: MessageItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  const handleCopy = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content).then(() => {
        // Optional: toast notification
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("success", "Copied to clipboard");
        }
      });
    }
  }, [message.content]);

  // Special handling for tool result messages
  if (isTool) {
    return createElement(ToolResultItem, { message });
  }

  return createElement(
    "div",
    {
      style: messageRowStyle(message.role),
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    },
    createElement(
      "div",
      {
        style: messageBubbleStyle(message.role),
      },
      // Content
      createElement(MarkdownMessage, { content: message.content || "", role: message.role }),
      
      // Cursor for streaming
      isStreaming &&
        createElement("span", {
          style: cursorStyle,
        }),

      // Tool Calls (if any)
      message.tool_calls &&
        message.tool_calls.length > 0 &&
        createElement(
          "div",
          { style: { marginTop: "12px" } },
          ...message.tool_calls.map((tc) =>
            createElement(ToolCallItem, { key: tc.id, toolCall: tc })
          )
        ),

      // Action Bar
      createElement(
        "div",
        {
          style: {
            ...actionBarStyle,
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? "auto" : "none",
          },
        },
        // Copy Button
        createElement(
          "button",
          {
            style: actionButtonStyle,
            onClick: handleCopy,
            title: "Copy message",
          },
          createElement("i", { className: "ti ti-copy" })
        ),
        // Regenerate Button (Only for last AI message)
        !isUser &&
          isLastAiMessage &&
          onRegenerate &&
          createElement(
            "button",
            {
              style: actionButtonStyle,
              onClick: onRegenerate,
              title: "Regenerate response",
            },
            createElement("i", { className: "ti ti-refresh" })
          )
      )
    )
  );
}
