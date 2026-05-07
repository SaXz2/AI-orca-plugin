const React = window.React as typeof import("react");
const { createElement } = React;

import type { Skill } from "../types/skills";

const SCOPE_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  internal: { icon: "ti ti-file-text", label: "局部", color: "var(--orca-color-warning, #f59e0b)" },
  global: { icon: "ti ti-world", label: "全局", color: "var(--orca-color-success, #10b981)" },
  local: { icon: "ti ti-puzzle", label: "内置", color: "var(--orca-color-primary)" },
};

interface SkillConfirmDialogProps {
  skill: Skill;
  onConfirm: () => void;
  onDeny: () => void;
}

export default function SkillConfirmDialog({
  skill,
  onConfirm,
  onDeny,
}: SkillConfirmDialogProps) {
  const scopeInfo = SCOPE_LABELS[skill.scope] || SCOPE_LABELS.local;

  return createElement(
    "div",
    {
      style: {
        padding: "14px 16px",
        background: "var(--orca-color-bg-2)",
        borderRadius: "var(--orca-radius-md, 8px)",
        border: "1px solid var(--orca-color-warning, #ffc107)",
        marginBottom: 8,
      },
    },
    // Header
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        },
      },
      createElement("i", {
        className: "ti ti-alert-triangle",
        style: { fontSize: 16, color: "var(--orca-color-warning, #ffc107)" },
      }),
      createElement(
        "span",
        { style: { fontWeight: 600, color: "var(--orca-color-text-1)", fontSize: 13 } },
        "AI 请求执行技能"
      ),
      // Scope badge
      createElement(
        "span",
        {
          style: {
            fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 100,
            color: scopeInfo.color,
            background: `color-mix(in srgb, ${scopeInfo.color} 12%, transparent)`,
            display: "inline-flex", alignItems: "center", gap: 3,
          },
        },
        createElement("i", { className: scopeInfo.icon, style: { fontSize: 10 } }),
        scopeInfo.label
      ),
      createElement(
        "span",
        {
          style: {
            fontWeight: 600, color: "var(--orca-color-primary)", fontSize: 13,
            marginLeft: 4,
          },
        },
        skill.name
      )
    ),
    // Description preview
    createElement(
      "pre",
      {
        style: {
          margin: "8px 0",
          padding: "10px 12px",
          background: "var(--orca-color-bg-1)",
          borderRadius: "var(--orca-radius-sm, 4px)",
          fontSize: 11,
          fontFamily: "monospace",
          color: "var(--orca-color-text-2)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: 120,
          overflow: "auto",
          lineHeight: 1.4,
        },
      },
      skill.description || skill.instruction.slice(0, 200)
    ),
    // Actions
    createElement(
      "div",
      {
        style: {
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 10,
        },
      },
      createElement(
        "button",
        {
          onClick: onDeny,
          style: {
            padding: "6px 14px",
            borderRadius: "var(--orca-radius-sm, 4px)",
            border: "1px solid var(--orca-color-border)",
            background: "var(--orca-color-bg-1)",
            color: "var(--orca-color-text-2)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            transition: "all 0.15s",
          },
        },
        "拒绝"
      ),
      createElement(
        "button",
        {
          onClick: onConfirm,
          style: {
            padding: "6px 14px",
            borderRadius: "var(--orca-radius-sm, 4px)",
            border: "1px solid var(--orca-color-primary)",
            background: "var(--orca-color-primary)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            transition: "all 0.15s",
          },
        },
        "允许"
      )
    )
  );
}

export function createSkillConfirmPromise(skill: Skill): Promise<boolean> {
  return new Promise((resolve) => {
    const description = skill.description || skill.instruction.slice(0, 200);
    const confirmed = window.confirm(
      `AI 请求执行技能: ${skill.name}\n\n描述:\n${description}\n\n是否允许？`
    );
    resolve(confirmed);
  });
}
