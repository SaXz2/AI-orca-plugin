/**
 * ToolStatusIndicator Component
 *
 * A semantic, user-friendly status indicator for tool execution.
 * Replaces the technical card-based display with inline status flow.
 *
 * States:
 * - loading: Shows animated icon + friendly loading text + elapsed time
 * - success: Shows success icon + result summary + execution time + optional expand button
 * - failed: Shows error icon + error message + retry button
 * - cancelled: Shows cancelled icon + reason
 * 
 * Enhanced features (Requirements 10.1, 10.2):
 * - Displays execution time for loading and completed states
 * - Shows retry button when tool fails
 */

import {
  getToolDisplayConfig,
  generateResultSummary,
} from "../utils/tool-display-config";
import {
  toolStatusPillStyle,
  toolStatusIconStyle,
  toolStatusTextStyle,
  toolStatusExpandButtonStyle,
  toolStatusDetailsStyle,
  toolStatusErrorStyle,
  toolStatusRetryButtonStyle,
} from "../styles/ai-chat-styles";
import { withTooltip } from "../utils/orca-tooltip";
import MarkdownMessage from "./MarkdownMessage";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  useRef: <T>(initial: T) => { current: T };
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useEffect, useRef } = React;

export type ToolExecutionStatus = "loading" | "success" | "failed" | "cancelled";

export interface ToolStatusIndicatorProps {
  toolName: string;
  status: ToolExecutionStatus;
  result?: string;     // Tool result (for success state)
  error?: string;      // Error message (for failed state)
  args?: string;       // Tool arguments JSON string
  retryable?: boolean; // Whether retry is allowed
  onRetry?: () => void; // Retry callback
  startTime?: number;  // Execution start time (timestamp)
  endTime?: number;    // Execution end time (timestamp)
}

export default function ToolStatusIndicator({
  toolName,
  status,
  result,
  error,
  args,
  retryable = true, // Default to true for failed state
  onRetry,
  startTime,
  endTime,
}: ToolStatusIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const config = getToolDisplayConfig(toolName);
  const internalStartTime = useRef(startTime || Date.now());

  // Track elapsed time for loading state
  useEffect(() => {
    if (status === "loading") {
      // Update elapsed time every second
      const timer = setInterval(() => {
        setElapsedTime(Math.round((Date.now() - internalStartTime.current) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    } else if (status === "success" || status === "failed" || status === "cancelled") {
      // Calculate final elapsed time
      if (endTime && startTime) {
        setElapsedTime(Math.round((endTime - startTime) / 1000));
      } else if (internalStartTime.current) {
        setElapsedTime(Math.round((Date.now() - internalStartTime.current) / 1000));
      }
    }
  }, [status, startTime, endTime]);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Format elapsed time for display
  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  };

  // 显示名称格式：中文名称 (函数名)
  const displayLabel = `${config.displayName} (${toolName})`;

  // Determine icon and text based on status
  let icon: string;
  let text: string;
  let animationClass: string | undefined;
  let timeDisplay: string = "";

  switch (status) {
    case "loading":
      icon = config.icon;
      timeDisplay = elapsedTime > 0 ? ` (${formatElapsedTime(elapsedTime)})` : "";
      text = `${displayLabel}: ${config.loadingText}${timeDisplay}`;
      animationClass = `tool-animation-${config.animation}`;
      break;
    case "success":
      icon = config.successIcon;
      timeDisplay = elapsedTime > 0 ? ` [${formatElapsedTime(elapsedTime)}]` : "";
      text = `${displayLabel}: ${result ? generateResultSummary(toolName, result) : config.successText}${timeDisplay}`;
      break;
    case "failed":
      icon = "❌";
      timeDisplay = elapsedTime > 0 ? ` [${formatElapsedTime(elapsedTime)}]` : "";
      text = `${displayLabel}: ${error ? `失败 - ${error.slice(0, 50)}` : "执行失败"}${timeDisplay}`;
      break;
    case "cancelled":
      icon = "⏸️";
      text = `${displayLabel}: 已取消`;
      break;
    default:
      icon = "🔧";
      text = "未知状态";
  }

  // Determine if we should show expand button
  const showExpandButton = status === "success" && (result || args);
  
  // Show retry button for failed state (Requirements 10.2)
  const showRetryButton = status === "failed" && retryable;

  return createElement(
    "div",
    { style: { marginTop: "8px" } },
    // Main status pill
    createElement(
      "div",
      {
        style: toolStatusPillStyle(status),
      },
      // Animated icon
      createElement(
        "span",
        {
          style: toolStatusIconStyle,
          className: animationClass,
        },
        icon
      ),
      // Status text
      createElement(
        "span",
        { style: toolStatusTextStyle },
        text
      ),
      // Expand button (for success state)
      showExpandButton &&
        withTooltip(
          isExpanded ? "收起详情" : "查看详情",
          createElement(
            "button",
            {
              style: toolStatusExpandButtonStyle,
              onClick: handleToggleExpand,
            },
            createElement("i", {
              className: isExpanded ? "ti ti-chevron-up" : "ti ti-code",
              style: { fontSize: "12px" },
            })
          )
        ),
      // Retry button (for failed state - Requirements 10.2)
      showRetryButton &&
        withTooltip(
          "重试",
          createElement(
            "button",
            {
              style: toolStatusRetryButtonStyle,
              onClick: onRetry,
              disabled: !onRetry,
            },
            createElement("i", {
              className: "ti ti-refresh",
              style: { fontSize: "12px", marginRight: "4px" },
            }),
            "重试"
          )
        )
    ),
    // Expanded details
    isExpanded &&
      createElement(
        "div",
        { style: toolStatusDetailsStyle },
        // Arguments section
        args &&
          createElement(
            "div",
            { style: { marginBottom: "8px" } },
            createElement(
              "div",
              { style: { fontWeight: "bold", marginBottom: "4px", fontSize: "12px" } },
              "参数:"
            ),
            createElement(
              "pre",
              {
                style: {
                  margin: 0,
                  fontSize: "11px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  background: "var(--orca-color-bg-3)",
                  padding: "8px",
                  borderRadius: "4px",
                },
              },
              formatJson(args)
            )
          ),
        // Result section
        result &&
          createElement(
            "div",
            {},
            createElement(
              "div",
              { style: { fontWeight: "bold", marginBottom: "4px", fontSize: "12px" } },
              "结果:"
            ),
            // 检测是否是 JSON 或纯数据，使用 pre 显示；否则使用 Markdown 渲染
            isJsonLike(result)
              ? createElement(
                  "pre",
                  {
                    style: {
                      margin: 0,
                      fontSize: "11px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      background: "var(--orca-color-bg-3)",
                      padding: "8px",
                      borderRadius: "4px",
                      maxHeight: "200px",
                      overflowY: "auto",
                    },
                  },
                  formatJson(result)
                )
              : createElement(
                  "div",
                  {
                    style: {
                      background: "var(--orca-color-bg-3)",
                      padding: "8px",
                      borderRadius: "4px",
                      maxHeight: "200px",
                      overflowY: "auto",
                      fontSize: "12px",
                    },
                  },
                  createElement(MarkdownMessage, {
                    content: result,
                    role: "tool",
                  })
                )
          )
      ),
    // Error details (always visible for failed state)
    status === "failed" &&
      error &&
      error.length > 50 &&
      createElement(
        "div",
        { style: toolStatusErrorStyle },
        error
      )
  );
}

/**
 * Format JSON string for display
 * Attempts to pretty-print JSON, falls back to original string
 */
function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

/**
 * Check if a string looks like JSON or structured data
 * Returns true for JSON objects/arrays, false for natural language text
 */
function isJsonLike(str: string): boolean {
  const trimmed = str.trim();
  // Check if starts with { or [ (JSON)
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // Not valid JSON, could be Markdown
      return false;
    }
  }
  // Check if it's mostly code-like (no spaces, special chars)
  if (trimmed.length < 100 && !trimmed.includes(" ") && !trimmed.includes("\n")) {
    return true;
  }
  return false;
}
