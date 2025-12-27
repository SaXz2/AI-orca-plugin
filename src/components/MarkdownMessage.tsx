import { parseMarkdown, type MarkdownInlineNode, type MarkdownNode, type TableAlignment, type CheckboxItem, type TaskCardData } from "../utils/markdown-renderer";
import {
  codeBlockContainerStyle,
  codeBlockHeaderStyle,
  codeBlockPreStyle,
  inlineCodeStyle,
  markdownContainerStyle,
  blockQuoteStyle,
  headingStyle,
  linkStyle,
  blockLinkContainerStyle,
  blockLinkTextStyle,
  blockLinkArrowStyle,
  boldStyle,
  paragraphStyle,
} from "../styles/ai-chat-styles";

const React = window.React as any;
const { createElement, useMemo, useState } = React;
const { Button } = orca.components;

interface Props {
  content: string;
  role: "user" | "assistant" | "tool";
}

// Helper component for Code Block with Copy
function CodeBlock({ language, content }: { language?: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return createElement(
    "div",
    {
      style: codeBlockContainerStyle,
    },
    // Header
    createElement(
      "div",
      {
        style: codeBlockHeaderStyle,
      },
      createElement(
        "span",
        { style: { fontFamily: "monospace", fontWeight: 600 } },
        language || "text",
      ),
      createElement(
        "div",
        {
          style: { cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" },
          onClick: handleCopy,
        },
        createElement("i", { className: copied ? "ti ti-check" : "ti ti-copy" }),
        copied ? "Copied!" : "Copy",
      ),
    ),
    // Code content
    createElement(
      "pre",
      {
        style: codeBlockPreStyle,
      },
      content,
    ),
  );
}

// Helper component for Table with Copy
function TableBlock({ 
  headers, 
  alignments, 
  rows,
  renderInline 
}: { 
  headers: MarkdownInlineNode[][]; 
  alignments: TableAlignment[];
  rows: MarkdownInlineNode[][][];
  renderInline: (node: MarkdownInlineNode, key: number) => any;
}) {
  const [copyFormat, setCopyFormat] = useState(null as "md" | "logseq" | null);

  const getTextFromNodes = (nodes: MarkdownInlineNode[]): string => {
    return nodes.map(n => {
      if (n.type === "text") return n.content;
      if (n.type === "code") return `\`${n.content}\``;
      if (n.type === "bold") return `**${getTextFromNodes(n.children)}**`;
      if (n.type === "italic") return `*${getTextFromNodes(n.children)}*`;
      if (n.type === "link") return getTextFromNodes(n.children);
      return "";
    }).join("");
  };

  // Markdown table format
  const getMarkdownTable = (): string => {
    const headerRow = "| " + headers.map(h => getTextFromNodes(h)).join(" | ") + " |";
    const separatorRow = "| " + alignments.map(a => {
      if (a === "center") return ":---:";
      if (a === "right") return "---:";
      return "---";
    }).join(" | ") + " |";
    const dataRows = rows.map(row => 
      "| " + row.map(cell => getTextFromNodes(cell)).join(" | ") + " |"
    ).join("\n");
    return headerRow + "\n" + separatorRow + "\n" + dataRows;
  };

  // Logseq outline format
  const getLogseqOutline = (): string => {
    const headerTexts = headers.map(h => getTextFromNodes(h));
    return rows.map(row => {
      const cells = row.map(cell => getTextFromNodes(cell));
      const pairs = headerTexts.map((header, i) => `${header}:: ${cells[i] || ""}`);
      return "- " + pairs.join("\n  ");
    }).join("\n");
  };

  const handleCopy = async (format: "md" | "logseq") => {
    try {
      const text = format === "md" ? getMarkdownTable() : getLogseqOutline();
      await navigator.clipboard.writeText(text);
      setCopyFormat(format);
      setTimeout(() => setCopyFormat(null), 2000);
    } catch (err) {
      console.error("Failed to copy table:", err);
    }
  };

  const getAlignClass = (align: TableAlignment): string => {
    if (align === "center") return "align-center";
    if (align === "right") return "align-right";
    return "align-left";
  };

  return createElement(
    "div",
    { className: "md-table-container" },
    // Copy buttons
    createElement(
      "div",
      { className: "md-table-header" },
      createElement(
        "div",
        { 
          className: `md-table-copy-btn ${copyFormat === "md" ? "copied" : ""}`,
          onClick: () => handleCopy("md"),
          title: "复制为 Markdown 表格"
        },
        createElement("i", { className: copyFormat === "md" ? "ti ti-check" : "ti ti-table" }),
        copyFormat === "md" ? "Copied!" : "MD"
      ),
      createElement(
        "div",
        { 
          className: `md-table-copy-btn ${copyFormat === "logseq" ? "copied" : ""}`,
          onClick: () => handleCopy("logseq"),
          title: "复制为 Logseq 大纲格式"
        },
        createElement("i", { className: copyFormat === "logseq" ? "ti ti-check" : "ti ti-list" }),
        copyFormat === "logseq" ? "Copied!" : "Logseq"
      )
    ),
    // Table
    createElement(
      "table",
      { className: "md-table" },
      createElement(
        "thead",
        null,
        createElement(
          "tr",
          null,
          ...headers.map((headerCells, colIndex) =>
            createElement(
              "th",
              { key: colIndex, className: getAlignClass(alignments[colIndex]) },
              ...headerCells.map((child, i) => renderInline(child, i))
            )
          )
        )
      ),
      createElement(
        "tbody",
        null,
        ...rows.map((row, rowIndex) =>
          createElement(
            "tr",
            { key: rowIndex },
            ...row.map((cellNodes, colIndex) =>
              createElement(
                "td",
                { key: colIndex, className: getAlignClass(alignments[colIndex]) },
                ...cellNodes.map((child, i) => renderInline(child, i))
              )
            )
          )
        )
      )
    )
  );
}

// Helper component for Checklist (- [ ] / - [x])
function ChecklistBlock({
  items,
  renderInline,
}: {
  items: CheckboxItem[];
  renderInline: (node: MarkdownInlineNode, key: number) => any;
}) {
  return createElement(
    "div",
    { className: "md-checklist" },
    ...items.map((item, index) =>
      createElement(
        "div",
        { key: index, className: `md-checklist-item ${item.checked ? "checked" : ""}` },
        createElement(
          "span",
          { className: `md-checkbox ${item.checked ? "checked" : ""}` },
          item.checked && createElement("i", { className: "ti ti-check" })
        ),
        createElement(
          "span",
          { className: "md-checklist-text" },
          ...item.children.map((child, i) => renderInline(child, i))
        )
      )
    )
  );
}

// Helper component for Task Card
function TaskCardBlock({ task }: { task: TaskCardData }) {
  const statusConfig: Record<string, { icon: string; label: string; className: string }> = {
    todo: { icon: "ti ti-circle", label: "待办", className: "status-todo" },
    done: { icon: "ti ti-circle-check", label: "已完成", className: "status-done" },
    "in-progress": { icon: "ti ti-loader", label: "进行中", className: "status-progress" },
    cancelled: { icon: "ti ti-circle-x", label: "已取消", className: "status-cancelled" },
  };

  const priorityConfig: Record<string, { icon: string; label: string; className: string }> = {
    high: { icon: "ti ti-arrow-up", label: "高", className: "priority-high" },
    medium: { icon: "ti ti-minus", label: "中", className: "priority-medium" },
    low: { icon: "ti ti-arrow-down", label: "低", className: "priority-low" },
  };

  const status = statusConfig[task.status] || statusConfig.todo;
  const priority = task.priority ? priorityConfig[task.priority] : null;

  const handleBlockClick = () => {
    if (task.blockId) {
      try {
        orca.nav.openInLastPanel("block", { blockId: task.blockId });
      } catch (error) {
        console.error("[TaskCard] Navigation failed:", error);
      }
    }
  };

  return createElement(
    "div",
    { className: "md-task-card" },
    // Header: status + title
    createElement(
      "div",
      { className: "md-task-header" },
      createElement(
        "span",
        { className: `md-task-status ${status.className}` },
        createElement("i", { className: status.icon }),
        status.label
      ),
      priority && createElement(
        "span",
        { className: `md-task-priority ${priority.className}` },
        createElement("i", { className: priority.icon }),
        priority.label
      )
    ),
    // Title with link indicator (using BlockPreviewPopup for hover preview)
    createElement(
      "div",
      { className: "md-task-title-row" },
      task.blockId && createElement(
        orca.components.BlockPreviewPopup,
        { blockId: task.blockId, delay: 300 },
        createElement(
          "span",
          { 
            className: "md-task-link-dot",
            onClick: handleBlockClick,
          }
        )
      ),
      createElement(
        "span",
        { className: "md-task-title" },
        task.title
      )
    ),
    // Footer: due date + tags
    (task.dueDate || task.tags.length > 0) && createElement(
      "div",
      { className: "md-task-footer" },
      task.dueDate && createElement(
        "span",
        { className: "md-task-due" },
        createElement("i", { className: "ti ti-calendar" }),
        task.dueDate
      ),
      task.tags.length > 0 && createElement(
        "div",
        { className: "md-task-tags" },
        ...task.tags.map((tag, i) =>
          createElement("span", { key: i, className: "md-task-tag" }, tag)
        )
      )
    )
  );
}

function renderInlineNode(node: MarkdownInlineNode, key: number): any {
  switch (node.type) {
    case "text":
      return createElement(React.Fragment, { key }, node.content);

    case "break":
      return createElement("br", { key });

    case "bold":
      return createElement(
        "strong",
        {
          key,
          style: boldStyle,
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );

    case "italic":
      return createElement(
        "em",
        { key, style: { fontStyle: "italic" } },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );

    case "code":
      return createElement(
        "code",
        {
          key,
          style: inlineCodeStyle,
        },
        node.content,
      );

    case "link":
      // Check if this is an orca-block link
      const isBlockLink = node.url.startsWith("orca-block:");
      if (isBlockLink) {
        const blockId = parseInt(node.url.replace("orca-block:", ""), 10);
        
        // Navigation handler with error handling and feedback
        const handleBlockNavigation = (e: any) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Validate block ID
          if (isNaN(blockId) || blockId <= 0) {
            console.error("[MarkdownMessage] Invalid block ID:", blockId);
            return;
          }
          
          try {
            // Open in last panel (non-current panel)
            orca.nav.openInLastPanel("block", { blockId });
          } catch (error) {
            console.error("[MarkdownMessage] Navigation failed:", error);
          }
        };

        // Check if link text is just a block ID reference (e.g., "块 ID: 123", "Block 123", "blockid:123", or pure number)
        const linkText = node.children.map(c => c.type === "text" ? c.content : "").join("");
        const isBlockIdOnly = /^(块\s*ID\s*[:：]?\s*\d+|block\s*#?\d+|Block\s*#?\d+|笔记\s*#?\d+|blockid[:：]?\d+|\d+)$/i.test(linkText.trim());

        // Render as small dot if it's just a block ID reference
        if (isBlockIdOnly) {
          return createElement(
            orca.components.BlockPreviewPopup,
            { key, blockId, delay: 300 },
            createElement(
              "span",
              {
                className: "md-block-dot",
                onClick: handleBlockNavigation,
              }
            )
          );
        }
        
        // Wrap with BlockPreviewPopup for hover preview (full link style)
        return createElement(
          orca.components.BlockPreviewPopup,
          { key, blockId, delay: 300 },
          createElement(
            "span",
            {
              style: blockLinkContainerStyle,
              onClick: handleBlockNavigation,
              onMouseEnter: (e: any) => {
                e.currentTarget.style.background = "rgba(0, 123, 255, 0.08)";
                e.currentTarget.style.borderColor = "rgba(0, 123, 255, 0.2)";
                e.currentTarget.style.transform = "translateX(2px)";
              },
              onMouseLeave: (e: any) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "transparent";
                e.currentTarget.style.transform = "translateX(0)";
              },
            },
            // Link text
            createElement(
              "span",
              { style: blockLinkTextStyle },
              ...node.children.map((child, i) => renderInlineNode(child, i)),
            ),
            // Jump arrow icon
            createElement(
              "span",
              {
                style: blockLinkArrowStyle,
                onMouseEnter: (e: any) => {
                  e.currentTarget.style.transform = "translateX(2px)";
                },
                onMouseLeave: (e: any) => {
                  e.currentTarget.style.transform = "translateX(0)";
                },
              },
              createElement("i", { className: "ti ti-arrow-right" }),
            ),
          )
        );
      }
      // Normal external link
      return createElement(
        "a",
        {
          key,
          href: node.url,
          target: "_blank",
          rel: "noopener noreferrer",
          title: node.url,
          style: linkStyle,
          onClick: (e: any) => {
            // Allow default behavior for external links
          },
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );


    default:
      return null;
  }
}

function renderBlockNode(node: MarkdownNode, key: number): any {
  switch (node.type) {
    case "heading": {
      const HeadingTag = `h${node.level}` as any;
      return createElement(
        HeadingTag,
        {
          key,
          style: headingStyle(node.level),
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );
    }

    case "paragraph":
      return createElement(
        "p",
        {
          key,
          style: paragraphStyle,
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );

    case "list": {
      const ListTag = (node.ordered ? "ol" : "ul") as any;
      const listClass = node.ordered ? "md-list md-list-ordered" : "md-list md-list-unordered";
      return createElement(
        ListTag,
        {
          key,
          className: listClass,
        },
        ...node.items.map((item, itemIndex) =>
          createElement(
            "li",
            {
              key: itemIndex,
              className: "md-list-item",
            },
            ...item.map((child, i) => renderInlineNode(child, i)),
          ),
        ),
      );
    }

    case "quote":
      return createElement(
        "blockquote",
        {
          key,
          style: blockQuoteStyle,
        },
        ...node.children.map((child, i) => renderBlockNode(child, i)),
      );

    case "codeblock":
      return createElement(CodeBlock, {
        key,
        language: node.language,
        content: node.content,
      });

    case "table": {
      return createElement(TableBlock, {
        key,
        headers: node.headers,
        alignments: node.alignments,
        rows: node.rows,
        renderInline: renderInlineNode,
      });
    }

    case "checklist": {
      return createElement(ChecklistBlock, {
        key,
        items: node.items,
        renderInline: renderInlineNode,
      });
    }

    case "taskcard": {
      return createElement(TaskCardBlock, {
        key,
        task: node.task,
      });
    }

    case "hr":
      return createElement("hr", { key, className: "md-hr" });

    default:
      return null;
  }
}

export default function MarkdownMessage({ content, role }: Props) {
  const nodes = useMemo(() => parseMarkdown(content), [content]);

  return createElement(
    "div",
    {
      style: markdownContainerStyle(role),
    },
    ...nodes.map((node: MarkdownNode, index: number) => renderBlockNode(node, index)),
  );
}
