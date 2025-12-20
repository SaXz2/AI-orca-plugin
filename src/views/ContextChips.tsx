import {
  ContextRef,
  contextKey,
  getDisplayLabel,
  removeContext,
} from "../store/context-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
};
const { createElement } = React;

type Props = {
  items: ContextRef[];
  onRemove?: (ref: ContextRef) => void;
};

/**
 * Context Chips - 显示已选中的 context 列表（chips 形式）
 */
export default function ContextChips({ items, onRemove }: Props) {
  if (items.length === 0) return null;

  const handleRemove = (ref: ContextRef) => {
    removeContext(contextKey(ref));
    onRemove?.(ref);
  };

  return createElement(
    "div",
    {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: "8px 0",
      },
    },
    ...items.map((ref) => {
      const key = contextKey(ref);
      const label = getDisplayLabel(ref);
      const icon = ref.kind === "page" ? "ti ti-file-text" : "ti ti-tag";

      return createElement(
        "div",
        {
          key,
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 12,
            background: "var(--orca-color-bg-2)",
            border: "1px solid var(--orca-color-border)",
            fontSize: 12,
            maxWidth: 180,
          },
        },
        createElement("i", {
          className: icon,
          style: { fontSize: 12, opacity: 0.7 },
        }),
        createElement(
          "span",
          {
            style: {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            },
          },
          label
        ),
        createElement(
          "span",
          {
            onClick: () => handleRemove(ref),
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
    })
  );
}
