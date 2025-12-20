import type { DbId } from "../orca.d.ts";
import { contextStore } from "../store/context-store";
import ContextChips from "./ContextChips";
import ContextPicker from "./ContextPicker";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(
    initial: T | (() => T),
  ) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useRef, useState, useCallback } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Button, CompositionTextArea } = orca.components;

type Props = {
  onSend: (message: string) => void;
  disabled?: boolean;
  currentPageId: DbId | null;
  currentPageTitle: string;
};

/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮
 */
export default function ChatInput({
  onSend,
  disabled = false,
  currentPageId,
  currentPageTitle,
}: Props) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const addContextBtnRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextSnap = useSnapshot(contextStore);

  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
  }, [canSend, text, onSend]);

  const handleKeyDown = useCallback(
    (e: any) => {
      // Enter 发送，Shift+Enter 换行
      if (e.key === "Enter" && !e.shiftKey) {
        if (e.nativeEvent?.isComposing) return;
        e.preventDefault();
        handleSend();
        return;
      }
      // @ 触发 context picker（仅当在行首或空格后输入 @）
      if (e.key === "@") {
        const value = e.target.value || "";
        const pos = e.target.selectionStart || 0;
        const charBefore = pos > 0 ? value[pos - 1] : "";
        if (pos === 0 || charBefore === " " || charBefore === "\n") {
          e.preventDefault();
          setPickerOpen(true);
        }
      }
    },
    [handleSend]
  );

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
    // Restore focus to textarea after picker closes
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  return createElement(
    "div",
    {
      style: {
        padding: 12,
        borderTop: "1px solid var(--orca-color-border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
      },
    },

    // Context Chips 区域
    createElement(ContextChips, { items: contextSnap.selected }),

    // @ Add context 按钮
    createElement(
      "div",
      {
        ref: addContextBtnRef as any,
        style: { display: "flex", alignItems: "center", gap: 8 },
      },
      createElement(
        Button,
        {
          variant: "plain",
          onClick: () => setPickerOpen(!pickerOpen),
          style: {
            padding: "4px 8px",
            fontSize: 12,
            color: "var(--orca-color-text-2)",
          },
        },
        createElement("i", { className: "ti ti-at", style: { marginRight: 4 } }),
        "Add context"
      )
    ),

    // Context Picker 悬浮菜单
    createElement(ContextPicker, {
      open: pickerOpen,
      onClose: handlePickerClose,
      currentPageId,
      currentPageTitle,
      anchorRef: addContextBtnRef,
    }),

    // 输入框 + 发送按钮
    createElement(
      "div",
      {
        style: {
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        },
      },
      createElement(CompositionTextArea as any, {
        ref: textareaRef as any,
        placeholder: "Your AI assistant for Orca-note • @ to add context • / for custom prompts",
        value: text,
        onChange: (e: any) => setText(e.target.value),
        onKeyDown: handleKeyDown,
        disabled,
        style: {
          flex: 1,
          resize: "none",
          minHeight: 64,
          maxHeight: 200,
        },
      }),
      createElement(
        Button,
        {
          variant: "solid",
          disabled: !canSend,
          onClick: handleSend,
        },
        disabled ? "Sending..." : "Send"
      )
    )
  );
}
