const React = window.React as typeof import("react");
const { createElement } = React;

import type { Skill } from "../types/skills";

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
  return createElement(
    "div",
    {
      style: {
        padding: "12px 16px",
        background: "var(--orca-color-bg-2)",
        borderRadius: 8,
        border: "1px solid var(--orca-color-warning, #ffc107)",
        marginBottom: 8,
      },
    },
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          color: "var(--orca-color-warning, #ffc107)",
          fontWeight: 500,
          fontSize: 13,
        },
      },
      createElement("i", { className: "ti ti-alert-triangle", style: { fontSize: 16 } }),
      `AI 请求执行技能: ${skill.metadata.name}`
    ),
    createElement(
      "pre",
      {
        style: {
          margin: "8px 0",
          padding: 8,
          background: "var(--orca-color-bg-1)",
          borderRadius: 4,
          fontSize: 11,
          fontFamily: "monospace",
          color: "var(--orca-color-text-2)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: 120,
          overflow: "auto",
        },
      },
      skill.metadata.description || skill.instruction.slice(0, 200)
    ),
    createElement(
      "div",
      {
        style: {
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 8,
        },
      },
      createElement(
        "button",
        {
          onClick: onDeny,
          style: {
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid var(--orca-color-border)",
            background: "var(--orca-color-bg-1)",
            color: "var(--orca-color-text-2)",
            cursor: "pointer",
            fontSize: 12,
          },
        },
        "拒绝"
      ),
      createElement(
        "button",
        {
          onClick: onConfirm,
          style: {
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid var(--orca-color-border)",
            background: "var(--orca-color-bg-3)",
            color: "var(--orca-color-text-1)",
            cursor: "pointer",
            fontSize: 12,
          },
        },
        "允许"
      )
    )
  );
}

export function createSkillConfirmPromise(skill: Skill): Promise<boolean> {
  return new Promise((resolve) => {
    const description = skill.metadata.description || skill.instruction.slice(0, 200);

    const confirmed = window.confirm(
      `AI 请求执行技能: ${skill.metadata.name}\n\n描述:\n${description}\n\n是否允许？`
    );
    resolve(confirmed);
  });
}
