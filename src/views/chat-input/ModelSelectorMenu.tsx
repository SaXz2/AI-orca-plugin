/**
 * ModelSelectorMenu - 模型选择器菜单组件
 * 包含模型过滤、分组显示、添加自定义模型功能
 */

import type { AiModelOption, ModelCapability } from "../../settings/ai-chat-settings";
import { MODEL_CAPABILITY_LABELS } from "../../settings/ai-chat-settings";
import {
  menuContainerStyle,
  menuFlexStyle,
  modelListPanelStyle,
  modelListScrollStyle,
  addModelPanelStyle,
  addModelTitleStyle,
  addModelHintStyle,
} from "./chat-input-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useMemo, useCallback } = React;

const { Button, Input } = orca.components;

type ModelGroup = {
  group: string;
  options: AiModelOption[];
};

type Props = {
  modelOptions: AiModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onAddModel?: (model: string) => void | Promise<void>;
  close: () => void;
};

/**
 * 对模型列表进行分组和过滤
 */
function useModelGroups(modelOptions: AiModelOption[], filterQuery: string): ModelGroup[] {
  return useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    
    // 过滤模型
    const filtered = q
      ? modelOptions.filter((o) => {
          const label = (o.label || "").toLowerCase();
          const value = (o.value || "").toLowerCase();
          return label.includes(q) || value.includes(q);
        })
      : modelOptions;

    // 分组模型
    const order = ["Built-in", "Custom", "Other"];
    const grouped = new Map<string, AiModelOption[]>();
    
    for (const opt of filtered) {
      const g = opt.group || "Other";
      const arr = grouped.get(g);
      if (arr) arr.push(opt);
      else grouped.set(g, [opt]);
    }

    // 按预定义顺序排列分组
    const keys = [
      ...order.filter((k) => grouped.has(k)),
      ...[...grouped.keys()].filter((k) => !order.includes(k)).sort(),
    ];

    return keys.map((k) => ({ group: k, options: grouped.get(k) || [] }));
  }, [modelOptions, filterQuery]);
}

/**
 * 能力标签组件
 */
function CapabilityBadge({ capability }: { capability: ModelCapability }) {
  const config = MODEL_CAPABILITY_LABELS[capability];
  if (!config) return null;
  
  return createElement(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        padding: "1px 4px",
        borderRadius: "4px",
        fontSize: "10px",
        background: `${config.color}20`,
        color: config.color,
        whiteSpace: "nowrap",
      },
      title: config.label,
    },
    createElement("i", { className: config.icon, style: { fontSize: "9px" } }),
    config.label
  );
}

/**
 * 模型列表项组件
 */
function ModelListItem({
  opt,
  isSelected,
  onClick,
}: {
  opt: AiModelOption;
  isSelected: boolean;
  onClick: () => void;
}) {
  const hasPrice = opt.inputPrice !== undefined || opt.outputPrice !== undefined;
  const hasCapabilities = opt.capabilities && opt.capabilities.length > 0;
  
  return createElement(
    "div",
    {
      onClick,
      style: {
        padding: "8px 12px",
        cursor: "pointer",
        background: isSelected ? "var(--orca-color-bg-3)" : "transparent",
        borderRadius: "4px",
        margin: "2px 4px",
      },
      onMouseEnter: (e: any) => {
        if (!isSelected) e.currentTarget.style.background = "var(--orca-color-bg-2)";
      },
      onMouseLeave: (e: any) => {
        if (!isSelected) e.currentTarget.style.background = "transparent";
      },
    },
    // 第一行：模型名称 + 选中标记
    createElement(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" } },
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 } },
        createElement(
          "span",
          { 
            style: { 
              fontWeight: 500, 
              color: "var(--orca-color-text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            } 
          },
          opt.label
        ),
        // 能力标签
        hasCapabilities && createElement(
          "div",
          { style: { display: "flex", gap: "3px", flexShrink: 0 } },
          ...opt.capabilities!.slice(0, 3).map((cap) =>
            createElement(CapabilityBadge, { key: cap, capability: cap })
          ),
          opt.capabilities!.length > 3 && createElement(
            "span",
            { style: { fontSize: "10px", color: "var(--orca-color-text-3)" } },
            `+${opt.capabilities!.length - 3}`
          )
        )
      ),
      isSelected && createElement("i", { 
        className: "ti ti-check", 
        style: { color: "var(--orca-color-primary)", fontSize: "14px" } 
      })
    ),
    // 第二行：模型ID + 价格
    (opt.label !== opt.value || hasPrice) && createElement(
      "div",
      { 
        style: { 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          marginTop: "4px",
          fontSize: "11px",
          color: "var(--orca-color-text-3)",
        } 
      },
      opt.label !== opt.value 
        ? createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, opt.value)
        : createElement("span", null),
      hasPrice && createElement(
        "span",
        { style: { whiteSpace: "nowrap", marginLeft: "8px" } },
        `$${opt.inputPrice ?? 0}/${opt.outputPrice ?? 0}`
      )
    )
  );
}

/**
 * 模型列表面板
 */
function ModelListPanel({
  modelGroups,
  selectedModel,
  onModelChange,
  modelFilter,
  onFilterChange,
  close,
}: {
  modelGroups: ModelGroup[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  modelFilter: string;
  onFilterChange: (value: string) => void;
  close: () => void;
}) {
  const listItems: any[] = [];

  if (modelGroups.length === 0) {
    listItems.push(
      createElement(
        "div",
        { key: "empty", style: { padding: "12px", color: "var(--orca-color-text-3)", textAlign: "center" } },
        "No models found"
      )
    );
  } else {
    for (let i = 0; i < modelGroups.length; i++) {
      const { group, options } = modelGroups[i];
      
      // 分组标题
      listItems.push(
        createElement(
          "div",
          { 
            key: `t:${group}`, 
            style: { 
              padding: "8px 12px 4px", 
              fontSize: "11px", 
              fontWeight: 600,
              color: "var(--orca-color-text-2)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            } 
          },
          group
        )
      );
      
      // 模型列表项
      listItems.push(
        ...options.map((opt) => {
          const isSelected = opt.value === selectedModel;
          return createElement(ModelListItem, {
            key: opt.value,
            opt,
            isSelected,
            onClick: () => {
              if (opt.value !== selectedModel) onModelChange(opt.value);
              close();
            },
          });
        })
      );

      // 分隔线
      if (i !== modelGroups.length - 1) {
        listItems.push(
          createElement("div", { 
            key: `s:${group}`, 
            style: { 
              height: "1px", 
              background: "var(--orca-color-border)", 
              margin: "8px 12px" 
            } 
          })
        );
      }
    }
  }

  return createElement(
    "div",
    { style: modelListPanelStyle },
    createElement(Input as any, {
      placeholder: "Filter models…",
      value: modelFilter,
      onChange: (e: any) => onFilterChange(e.target.value),
      pre: createElement("i", { className: "ti ti-search" }),
      style: { width: "100%", maxWidth: "100%", boxSizing: "border-box" },
    }),
    createElement(
      "div",
      { style: modelListScrollStyle },
      ...listItems
    )
  );
}

/**
 * 添加模型面板
 */
function AddModelPanel({
  modelDraft,
  onDraftChange,
  onAdd,
  isAdding,
}: {
  modelDraft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  isAdding: boolean;
}) {
  return createElement(
    "div",
    { style: addModelPanelStyle },
    createElement("div", { style: addModelTitleStyle }, "Add model"),
    createElement(Input as any, {
      placeholder: "e.g. gpt-4.1-mini",
      value: modelDraft,
      onChange: (e: any) => onDraftChange(e.target.value),
      onKeyDown: (e: any) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAdd();
        }
      },
      pre: createElement("i", { className: "ti ti-plus" }),
      style: { width: "100%", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden", minWidth: 0 },
    }),
    createElement(
      Button,
      {
        variant: "solid",
        disabled: isAdding || !modelDraft.trim(),
        onClick: onAdd,
        style: { marginTop: 8, width: "100%", boxSizing: "border-box" },
      },
      isAdding ? "Adding..." : "Add"
    ),
    createElement("div", { style: addModelHintStyle }, "Models share the same API URL/Key (for now).")
  );
}

/**
 * ModelSelectorMenu - 主组件
 */
export default function ModelSelectorMenu({
  modelOptions,
  selectedModel,
  onModelChange,
  onAddModel,
  close,
}: Props) {
  const [modelFilter, setModelFilter] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [addingModel, setAddingModel] = useState(false);

  const modelGroups = useModelGroups(modelOptions, modelFilter);

  const handleAddModel = useCallback(async () => {
    const next = modelDraft.trim();
    if (!next) return;

    // If already exists, just select it.
    if (modelOptions.some((o) => o.value === next)) {
      onModelChange(next);
      setModelDraft("");
      close();
      return;
    }

    if (!onAddModel) {
      onModelChange(next);
      setModelDraft("");
      close();
      return;
    }

    try {
      setAddingModel(true);
      await onAddModel(next);
      onModelChange(next);
      setModelDraft("");
      close();
    } finally {
      setAddingModel(false);
    }
  }, [modelDraft, modelOptions, onAddModel, onModelChange, close]);

  return createElement(
    "div",
    { style: menuContainerStyle },
    createElement(
      "div",
      { style: menuFlexStyle },
      createElement(ModelListPanel, {
        modelGroups,
        selectedModel,
        onModelChange,
        modelFilter,
        onFilterChange: setModelFilter,
        close,
      }),
      createElement(AddModelPanel, {
        modelDraft,
        onDraftChange: setModelDraft,
        onAdd: handleAddModel,
        isAdding: addingModel,
      })
    )
  );
}
