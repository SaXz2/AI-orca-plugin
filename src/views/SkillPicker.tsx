/**
 * SkillPicker - / 触发的 Skill 选择菜单
 * 复用 ContextPicker 的浮层样式
 */

import type { Skill } from "../store/skill-store";
import { skillStore, setActiveSkill } from "../store/skill-store";
import { ensureSkillsLoaded } from "../services/skill-service";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(
    initial: T | (() => T),
  ) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useEffect, useMemo, useRef, useState, useCallback } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};

const { CompositionInput } = orca.components;

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (skill: Skill) => void;
  anchorRef?: { current: HTMLElement | null };
};

/**
 * SkillPicker 组件
 */
export default function SkillPicker({
  open,
  onClose,
  onSelect,
  anchorRef,
}: Props) {
  const [searchText, setSearchText] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const skillSnap = useSnapshot(skillStore);

  // 计算是否正在加载：使用 skillStore 的状态而非 local state
  // 避免 useEffect cleanup 导致的状态不同步问题
  const isLoading = !skillSnap.skillsLoaded && (skillSnap.skillsLoading || skillSnap.skills.length === 0);

  // 加载 Skills
  useEffect(() => {
    if (!open) return;

    setSearchText("");
    setHighlightIndex(0);

    // 触发加载（如果尚未加载且不在加载中）
    if (!skillSnap.skillsLoaded && !skillSnap.skillsLoading) {
      ensureSkillsLoaded();
    }

    // 自动聚焦搜索框
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [open, skillSnap.skillsLoaded, skillSnap.skillsLoading]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const menu = menuRef.current;
      if (menu && !menu.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      const list = filteredSkills;
      if (list.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % list.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev - 1 + list.length) % list.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const skill = list[highlightIndex];
        if (skill) {
          handleSelect(skill);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, highlightIndex]);

  // 过滤 Skills
  const filteredSkills = useMemo(() => {
    const skills = skillSnap.skills as Skill[];
    if (!searchText.trim()) return skills;
    const q = searchText.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [skillSnap.skills, searchText]);

  // 重置高亮索引
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredSkills.length]);

  // 选择处理
  const handleSelect = useCallback((skill: Skill) => {
    setActiveSkill(skill);
    onSelect(skill);
    onClose();
  }, [onSelect, onClose]);

  if (!open) return null;

  // 菜单样式（复用 ContextPicker）
  const menuStyle: any = {
    position: "fixed",
    zIndex: 99999,
    background: "var(--orca-color-bg-1)",
    border: "1px solid var(--orca-color-border)",
    borderRadius: 12,
    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
    minWidth: 280,
    maxWidth: 360,
    maxHeight: 400,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  // 定位菜单
  if (anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const menuMaxWidth = 360;
    const menuMaxHeight = 400;
    const gap = 8;

    let left = rect.left;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - menuMaxWidth - viewportPadding)
    );
    menuStyle.left = left;

    // 优先向上展开
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    let showAbove = true;
    if (spaceAbove < menuMaxHeight && spaceBelow > spaceAbove) {
      showAbove = false;
    }

    if (showAbove) {
      menuStyle.bottom = window.innerHeight - rect.top + gap;
      menuStyle.maxHeight = Math.min(menuMaxHeight, spaceAbove - viewportPadding);
      menuStyle.top = "auto";
    } else {
      menuStyle.top = rect.bottom + gap;
      menuStyle.maxHeight = Math.min(menuMaxHeight, spaceBelow - viewportPadding);
      menuStyle.bottom = "auto";
    }
  } else {
    menuStyle.top = 8;
    menuStyle.left = 8;
  }

  const itemStyle: any = {
    padding: "10px 12px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    borderBottom: "1px solid var(--orca-color-border)",
    transition: "background 0.1s",
  };

  const highlightStyle = {
    background: "var(--orca-color-bg-hover)",
  };

  const getTypeIcon = (type: string) => {
    return type === "tools" ? "ti ti-tool" : "ti ti-message-circle";
  };

  const getTypeBadgeStyle = (type: string): React.CSSProperties => ({
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 4,
    background: type === "tools"
      ? "var(--orca-color-primary-1, #e3f2fd)"
      : "var(--orca-color-success-1, #e8f5e9)",
    color: type === "tools"
      ? "var(--orca-color-primary, #1976d2)"
      : "var(--orca-color-success, #388e3c)",
  });

  return createElement(
    "div",
    {
      ref: menuRef as any,
      style: menuStyle,
    },

    // 标题
    createElement(
      "div",
      {
        style: {
          padding: "12px 12px 8px",
          fontWeight: 600,
          fontSize: 14,
          color: "var(--orca-color-text-2)",
          borderBottom: "1px solid var(--orca-color-border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        },
      },
      createElement("i", { className: "ti ti-sparkles" }),
      "Select Skill"
    ),

    // Skill 列表
    createElement(
      "div",
      {
        style: {
          flex: 1,
          overflow: "auto",
          minHeight: 0,
        },
      },
      isLoading
        ? createElement(
            "div",
            { style: { padding: 16, textAlign: "center", opacity: 0.6 } },
            "加载技能中..."
          )
        : filteredSkills.length === 0
          ? createElement(
              "div",
              {
                style: {
                  padding: 20,
                  textAlign: "center",
                  color: "var(--orca-color-text-3)",
                },
              },
              createElement("div", { style: { marginBottom: 8 } }, "暂无可用技能"),
              createElement(
                "div",
                { style: { fontSize: 12, opacity: 0.7 } },
                "在笔记中创建带 #skill 标签的块即可定义技能"
              )
            )
          : filteredSkills.map((skill, index) =>
              createElement(
                "div",
                {
                  key: skill.id,
                  style: {
                    ...itemStyle,
                    ...(index === highlightIndex ? highlightStyle : {}),
                  },
                  onClick: () => handleSelect(skill),
                  onMouseEnter: () => setHighlightIndex(index),
                },
                // 第一行：名称 + 类型标签
                createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    },
                  },
                  createElement("i", {
                    className: getTypeIcon(skill.type),
                    style: { opacity: 0.7 },
                  }),
                  createElement(
                    "span",
                    { style: { fontWeight: 500, flex: 1 } },
                    skill.name
                  ),
                  createElement(
                    "span",
                    { style: getTypeBadgeStyle(skill.type) },
                    skill.type === "tools" ? "工具" : "提示词"
                  )
                ),
                // 第二行：描述
                skill.description &&
                  createElement(
                    "div",
                    {
                      style: {
                        fontSize: 12,
                        color: "var(--orca-color-text-3)",
                        marginLeft: 22,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                    },
                    skill.description
                  )
              )
            )
    ),

    // 搜索框
    createElement(
      "div",
      { style: { padding: 8, borderTop: "1px solid var(--orca-color-border)" } },
      createElement(CompositionInput as any, {
        ref: inputRef as any,
        value: searchText,
        onChange: (e: any) => setSearchText(e.target.value),
        placeholder: "Search skills...",
        style: { width: "100%", fontSize: 13 },
      })
    )
  );
}
