/**
 * SkillChip - 输入框中的 Skill 标签组件
 * 复用 ContextChips 样式
 */

import type { Skill } from "../store/skill-store";
import { clearSkill } from "../store/skill-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
};
const { createElement } = React;

type Props = {
  skill: Skill;
  onRemove?: () => void;
};

/**
 * SkillChip 组件
 */
export default function SkillChip({ skill, onRemove }: Props) {
  const handleRemove = () => {
    clearSkill();
    onRemove?.();
  };

  const icon = skill.type === "tools" ? "ti ti-tool" : "ti ti-sparkles";

  // 使用不同的背景色区分 Skill 和 Context
  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 12,
    background: skill.type === "tools"
      ? "var(--orca-color-primary-1, #e3f2fd)"
      : "var(--orca-color-success-1, #e8f5e9)",
    border: `1px solid ${skill.type === "tools"
      ? "var(--orca-color-primary-2, #bbdefb)"
      : "var(--orca-color-success-2, #c8e6c9)"}`,
    fontSize: 12,
    maxWidth: 200,
    color: skill.type === "tools"
      ? "var(--orca-color-primary, #1976d2)"
      : "var(--orca-color-success, #388e3c)",
  };

  return createElement(
    "div",
    { style: chipStyle },
    createElement("i", {
      className: icon,
      style: { fontSize: 12, opacity: 0.8 },
    }),
    createElement(
      "span",
      {
        style: {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          fontWeight: 500,
        },
      },
      `/${skill.name}`
    ),
    createElement(
      "span",
      {
        onClick: handleRemove,
        style: {
          cursor: "pointer",
          opacity: 0.6,
          marginLeft: 2,
          display: "inline-flex",
          alignItems: "center",
        },
        onMouseEnter: (e: any) => (e.currentTarget.style.opacity = "1"),
        onMouseLeave: (e: any) => (e.currentTarget.style.opacity = "0.6"),
      },
      createElement("i", { className: "ti ti-x", style: { fontSize: 12 } })
    )
  );
}
