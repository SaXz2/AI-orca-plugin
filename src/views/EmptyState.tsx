import {
  emptyStateContainerStyle,
  emptyStateTitleStyle,
  emptyStateSubtitleStyle,
  suggestionGridStyle,
  suggestionCardStyle,
  suggestionIconStyle,
  suggestionTitleStyle,
  suggestionDescStyle,
} from "../styles/ai-chat-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
};
const { createElement } = React;

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

const SUGGESTIONS = [
  {
    icon: "📝",
    title: "总结当前笔记",
    desc: "快速获取当前页面的核心内容摘要",
    prompt: "请总结当前笔记的主要内容。",
  },
  {
    icon: "🔍",
    title: "搜索我的笔记",
    desc: "查找包含特定关键词的笔记块",
    prompt: "请帮我搜索关于[关键词]的笔记。",
  },
  {
    icon: "✨",
    title: "润色这段文字",
    desc: "优化选中文字的表达和流畅度",
    prompt: "请帮我润色这段文字：[粘贴文字]",
  },
  {
    icon: "💡",
    title: "AI 能做什么？",
    desc: "了解 AI 助手的功能和使用技巧",
    prompt: "请介绍一下你可以帮我做哪些事情？有哪些可用的工具？",
  },
];

export default function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return createElement(
    "div",
    { style: emptyStateContainerStyle },
    createElement(
      "div",
      { style: emptyStateTitleStyle },
      "👋 Welcome to AI Chat"
    ),
    createElement(
      "div",
      { style: emptyStateSubtitleStyle },
      "Choose a suggestion below or type your question to get started."
    ),
    createElement(
      "div",
      { style: suggestionGridStyle },
      ...SUGGESTIONS.map((item, index) =>
        createElement(
          "div",
          {
            key: index,
            style: suggestionCardStyle,
            onClick: () => onSuggestionClick(item.prompt),
            onMouseEnter: (e: any) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
              e.currentTarget.style.borderColor = "var(--orca-color-primary)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "var(--orca-color-border)";
            },
          },
          createElement("div", { style: suggestionIconStyle }, item.icon),
          createElement("div", { style: suggestionTitleStyle }, item.title),
          createElement("div", { style: suggestionDescStyle }, item.desc)
        )
      )
    )
  );
}
