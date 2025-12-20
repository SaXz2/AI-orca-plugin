import type { SavedSession } from "../services/session-service";
import { formatSessionTime } from "../services/session-service";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useRef: <T>(value: T) => { current: T };
};
const { createElement, useState, useEffect, useRef } = React;

const { Button } = orca.components;

type Props = {
  sessions: SavedSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClearAll: () => void;
  onNewSession: () => void;
};

export default function ChatHistoryMenu({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onClearAll,
  onNewSession,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (sessionId: string) => {
    onSelectSession(sessionId);
    setIsOpen(false);
  };

  const handleDelete = (e: MouseEvent, sessionId: string) => {
    e.stopPropagation();
    onDeleteSession(sessionId);
  };

  const handleClearAll = () => {
    if (sessions.length === 0) return;
    onClearAll();
    setIsOpen(false);
  };

  const handleNewSession = () => {
    onNewSession();
    setIsOpen(false);
  };

  return createElement(
    "div",
    {
      ref: menuRef as any,
      style: { position: "relative", display: "inline-block" },
    },
    // Trigger Button
    createElement(
      Button,
      {
        variant: "plain",
        onClick: () => setIsOpen(!isOpen),
        title: "Chat History",
      },
      createElement("i", { className: "ti ti-history" }),
    ),
    // Dropdown Menu
    isOpen &&
      createElement(
        "div",
        {
          style: {
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            width: 280,
            maxHeight: 400,
            overflow: "auto",
            background: "var(--orca-color-bg-1)",
            border: "1px solid var(--orca-color-border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            zIndex: 1000,
          },
        },
        // Header
        createElement(
          "div",
          {
            style: {
              padding: "12px 16px",
              borderBottom: "1px solid var(--orca-color-border)",
              fontWeight: 600,
              color: "var(--orca-color-text-1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            },
          },
          "Chat History",
          createElement(
            "button",
            {
              onClick: handleNewSession,
              title: "New Chat",
              style: {
                background: "var(--orca-color-primary, #007bff)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
              },
            },
            createElement("i", { className: "ti ti-plus", style: { fontSize: 12 } }),
            "New",
          ),
        ),
        // Session List
        sessions.length === 0
          ? createElement(
              "div",
              {
                style: {
                  padding: "24px 16px",
                  textAlign: "center",
                  color: "var(--orca-color-text-3)",
                  fontSize: 13,
                },
              },
              "No saved sessions",
            )
          : createElement(
              "div",
              { style: { padding: "8px 0" } },
              ...sessions.map((session) =>
                createElement(
                  "div",
                  {
                    key: session.id,
                    onClick: () => handleSelect(session.id),
                    style: {
                      padding: "10px 16px",
                      cursor: "pointer",
                      background:
                        session.id === activeSessionId
                          ? "var(--orca-color-bg-3)"
                          : "transparent",
                      borderLeft:
                        session.id === activeSessionId
                          ? "3px solid var(--orca-color-primary, #007bff)"
                          : "3px solid transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "background 0.15s",
                    },
                    onMouseOver: (e: any) => {
                      if (session.id !== activeSessionId) {
                        e.currentTarget.style.background = "var(--orca-color-bg-2)";
                      }
                    },
                    onMouseOut: (e: any) => {
                      if (session.id !== activeSessionId) {
                        e.currentTarget.style.background = "transparent";
                      }
                    },
                  },
                  // Session info
                  createElement(
                    "div",
                    { style: { flex: 1, minWidth: 0 } },
                    createElement(
                      "div",
                      {
                        style: {
                          fontWeight: 500,
                          color: "var(--orca-color-text-1)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: 13,
                        },
                      },
                      session.title || "Untitled",
                    ),
                    createElement(
                      "div",
                      {
                        style: {
                          fontSize: 11,
                          color: "var(--orca-color-text-3)",
                          marginTop: 2,
                        },
                      },
                      `${formatSessionTime(session.updatedAt)} · ${session.messages.length} messages`,
                    ),
                  ),
                  // Delete button
                  createElement(
                    "button",
                    {
                      onClick: (e: any) => handleDelete(e, session.id),
                      title: "Delete session",
                      style: {
                        background: "transparent",
                        border: "none",
                        color: "var(--orca-color-text-3)",
                        cursor: "pointer",
                        padding: 4,
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.6,
                        transition: "opacity 0.15s, color 0.15s",
                      },
                      onMouseOver: (e: any) => {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.color = "var(--orca-color-danger, #dc3545)";
                      },
                      onMouseOut: (e: any) => {
                        e.currentTarget.style.opacity = "0.6";
                        e.currentTarget.style.color = "var(--orca-color-text-3)";
                      },
                    },
                    createElement("i", { className: "ti ti-x", style: { fontSize: 14 } }),
                  ),
                ),
              ),
            ),
        // Footer - Clear All
        sessions.length > 0 &&
          createElement(
            "div",
            {
              style: {
                padding: "8px 16px",
                borderTop: "1px solid var(--orca-color-border)",
              },
            },
            createElement(
              "button",
              {
                onClick: handleClearAll,
                style: {
                  width: "100%",
                  padding: "8px",
                  background: "transparent",
                  border: "1px solid var(--orca-color-border)",
                  borderRadius: 4,
                  color: "var(--orca-color-text-2)",
                  cursor: "pointer",
                  fontSize: 12,
                  transition: "background 0.15s, color 0.15s",
                },
                onMouseOver: (e: any) => {
                  e.currentTarget.style.background = "var(--orca-color-danger, #dc3545)";
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.borderColor = "var(--orca-color-danger, #dc3545)";
                },
                onMouseOut: (e: any) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--orca-color-text-2)";
                  e.currentTarget.style.borderColor = "var(--orca-color-border)";
                },
              },
              "Clear All History",
            ),
          ),
      ),
  );
}
