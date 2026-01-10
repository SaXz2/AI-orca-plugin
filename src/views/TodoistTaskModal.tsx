/**
 * Todoist 任务列表 Modal
 * 简洁版：支持任务完成、快速添加、优先级切换
 */

import {
  type TaskWithProject,
  type CreateTaskParams,
  getTodayTasks,
  getAllTasks,
  closeTask,
  updateTask,
  createTask,
  formatTaskDue,
  getPriorityColor,
  getTodoistToken,
  setTodoistToken,
  validateToken,
  getProjects,
} from "../services/todoist-service";
import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { todoistModalStore, type TodoistViewMode } from "../store/todoist-store";

const React = window.React as any;
const { createElement, useState, useEffect, useCallback, useRef } = React;
const { Button, Input } = orca.components;

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

interface TodoistTaskModalProps {
  visible: boolean;
  onClose: () => void;
}

interface TaskItemProps {
  task: TaskWithProject;
  onComplete: (taskId: string) => Promise<void>;
  onPriorityChange: (taskId: string, priority: number) => Promise<void>;
}

interface QuickAddProps {
  onAdd: (content: string, dueString?: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 样式
// ═══════════════════════════════════════════════════════════════════════════

const modalStyles = {
  overlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "var(--orca-color-bg-1)",
    borderRadius: "12px",
    padding: "20px",
    width: "480px",
    maxWidth: "90vw",
    maxHeight: "80vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
    color: "var(--orca-color-text-1)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    color: "var(--orca-color-text-2)",
    fontSize: "18px",
  },
};

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
    minHeight: "200px",
    maxHeight: "450px",
    overflow: "hidden",
  },
  taskListHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: "8px",
    borderBottom: "1px solid var(--orca-color-border)",
  },
  taskTitle: {
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--orca-color-text-1)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  taskCount: {
    fontSize: "13px",
    color: "var(--orca-color-text-2)",
    fontWeight: 400,
  },
  taskList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "2px",
    overflowY: "auto" as const,
    flex: 1,
  },
  taskItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "10px 8px",
    borderRadius: "8px",
    transition: "background-color 0.15s",
    position: "relative" as const,
  },
  taskItemHover: {
    backgroundColor: "var(--orca-color-bg-2)",
  },
  checkbox: {
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: "pointer",
    transition: "all 0.2s",
    marginTop: "2px",
  },
  checkboxCompleting: {
    backgroundColor: "#4caf50",
    borderColor: "#4caf50",
    transform: "scale(1.1)",
  },
  checkIcon: {
    color: "white",
    fontSize: "12px",
  },
  taskContent: {
    flex: 1,
    minWidth: 0,
  },
  taskTitleText: {
    fontSize: "14px",
    color: "var(--orca-color-text-1)",
    lineHeight: 1.4,
    wordBreak: "break-word" as const,
  },
  taskTitleCompleting: {
    textDecoration: "line-through",
    color: "var(--orca-color-text-2)",
  },
  taskDescription: {
    fontSize: "12px",
    color: "var(--orca-color-text-3)",
    marginTop: "2px",
    lineHeight: 1.3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  taskMeta: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "4px",
    flexWrap: "wrap" as const,
  },
  taskDue: {
    fontSize: "12px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  taskDueNormal: {
    color: "var(--orca-color-text-2)",
  },
  taskDueOverdue: {
    color: "#d1453b",
    fontWeight: 500,
  },
  projectTag: {
    fontSize: "11px",
    padding: "2px 6px",
    borderRadius: "4px",
    background: "var(--orca-color-bg-3)",
    color: "var(--orca-color-text-2)",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  labelTag: {
    fontSize: "10px",
    padding: "1px 5px",
    borderRadius: "3px",
    background: "var(--orca-color-primary-light, rgba(59, 130, 246, 0.1))",
    color: "var(--orca-color-primary)",
  },
  priorityIndicator: {
    position: "absolute" as const,
    right: "8px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    gap: "2px",
    opacity: 0,
    transition: "opacity 0.15s",
  },
  priorityDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    cursor: "pointer",
    transition: "transform 0.1s",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 20px",
    color: "var(--orca-color-text-2)",
    textAlign: "center" as const,
  },
  emptyIcon: {
    fontSize: "48px",
    marginBottom: "12px",
  },
  emptyText: {
    fontSize: "14px",
  },
  errorState: {
    padding: "20px",
    textAlign: "center" as const,
    color: "var(--orca-color-error)",
  },
  tokenSetup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "16px",
    padding: "20px 0",
  },
  tokenInput: {
    width: "100%",
  },
  tokenHelp: {
    fontSize: "12px",
    color: "var(--orca-color-text-2)",
    lineHeight: 1.5,
  },
  tokenLink: {
    color: "var(--orca-color-primary)",
    textDecoration: "underline",
    cursor: "pointer",
  },
  refreshBtn: {
    padding: "4px 8px",
    fontSize: "12px",
  },
  spinner: {
    width: "24px",
    height: "24px",
    border: "3px solid var(--orca-color-border)",
    borderTopColor: "var(--orca-color-primary)",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  overdueSection: {
    marginBottom: "8px",
  },
  sectionTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#d1453b",
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  todaySection: {
    marginTop: "8px",
  },
  todaySectionTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--orca-color-primary)",
    padding: "4px 8px",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  projectSection: {
    marginTop: "12px",
  },
  projectSectionTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--orca-color-text-1)",
    padding: "6px 8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "var(--orca-color-bg-2)",
    borderRadius: "6px",
    marginBottom: "4px",
  },
  projectIcon: {
    fontSize: "12px",
    color: "var(--orca-color-text-2)",
  },
  projectTaskCount: {
    fontSize: "11px",
    color: "var(--orca-color-text-3)",
    marginLeft: "auto",
  },
  quickAdd: {
    display: "flex",
    gap: "8px",
    padding: "12px 8px",
    borderTop: "1px solid var(--orca-color-border)",
    marginTop: "auto",
  },
  quickAddInput: {
    flex: 1,
    fontSize: "13px",
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// Markdown 渲染辅助函数
// ═══════════════════════════════════════════════════════════════════════════

function renderMarkdown(text: string): any[] {
  const elements: any[] = [];
  let remaining = text;
  let key = 0;

  const patterns = [
    { regex: /\[([^\]]+)\]\(([^)]+)\)/, render: (match: RegExpMatchArray) => 
      createElement("a", {
        key: key++,
        href: match[2],
        target: "_blank",
        rel: "noopener noreferrer",
        style: { color: "var(--orca-color-primary)", textDecoration: "none" },
        onClick: (e: any) => { e.stopPropagation(); },
      }, match[1])
    },
    { regex: /\*\*([^*]+)\*\*|__([^_]+)__/, render: (match: RegExpMatchArray) => 
      createElement("strong", { key: key++ }, match[1] || match[2])
    },
    { regex: /(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/, render: (match: RegExpMatchArray) => 
      createElement("em", { key: key++ }, match[1] || match[2])
    },
    { regex: /~~([^~]+)~~/, render: (match: RegExpMatchArray) => 
      createElement("del", { key: key++, style: { opacity: 0.6 } }, match[1])
    },
    { regex: /`([^`]+)`/, render: (match: RegExpMatchArray) => 
      createElement("code", { 
        key: key++, 
        style: { background: "var(--orca-color-bg-3)", padding: "1px 4px", borderRadius: "3px", fontSize: "0.9em" } 
      }, match[1])
    },
  ];

  while (remaining.length > 0) {
    let earliestMatch: { index: number; match: RegExpMatchArray; pattern: typeof patterns[0] } | null = null;
    for (const pattern of patterns) {
      const match = remaining.match(pattern.regex);
      if (match && match.index !== undefined) {
        if (!earliestMatch || match.index < earliestMatch.index) {
          earliestMatch = { index: match.index, match, pattern };
        }
      }
    }
    if (earliestMatch) {
      if (earliestMatch.index > 0) elements.push(remaining.substring(0, earliestMatch.index));
      elements.push(earliestMatch.pattern.render(earliestMatch.match));
      remaining = remaining.substring(earliestMatch.index + earliestMatch.match[0].length);
    } else {
      elements.push(remaining);
      break;
    }
  }
  return elements.length > 0 ? elements : [text];
}

// ═══════════════════════════════════════════════════════════════════════════
// 快速添加组件
// ═══════════════════════════════════════════════════════════════════════════

function QuickAdd({ onAdd }: QuickAddProps) {
  const [content, setContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef(null) as any;

  const handleAdd = useCallback(async () => {
    if (!content.trim() || isAdding) return;
    setIsAdding(true);
    try {
      await onAdd(content.trim(), "今天");
      setContent("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("[todoist] Quick add failed:", err);
    } finally {
      setIsAdding(false);
    }
  }, [content, onAdd, isAdding]);

  const handleKeyDown = useCallback((e: any) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  }, [handleAdd]);

  return createElement(
    "div",
    { style: styles.quickAdd },
    createElement(Input, {
      ref: inputRef,
      style: styles.quickAddInput,
      placeholder: "快速添加任务，按 Enter 确认...",
      value: content,
      onChange: (e: any) => setContent(e.target.value),
      onKeyDown: handleKeyDown,
      disabled: isAdding,
    }),
    createElement(
      Button,
      {
        variant: "soft",
        onClick: handleAdd,
        disabled: !content.trim() || isAdding,
        style: { padding: "6px 12px" },
      },
      isAdding 
        ? createElement("i", { className: "ti ti-loader-2", style: { animation: "spin 1s linear infinite" } }) 
        : createElement("i", { className: "ti ti-plus" })
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 任务项组件
// ═══════════════════════════════════════════════════════════════════════════

function TaskItem({ task, onComplete, onPriorityChange }: TaskItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleComplete = useCallback(async (e: any) => {
    e.stopPropagation();
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      await onComplete(task.id);
    } catch (err) {
      setIsCompleting(false);
      console.error("[todoist] Failed to complete task:", err);
    }
  }, [task.id, onComplete, isCompleting]);

  const handlePriorityClick = useCallback(async (e: any, p: number) => {
    e.stopPropagation();
    if (task.priority !== p) {
      await onPriorityChange(task.id, p);
    }
  }, [task.id, task.priority, onPriorityChange]);

  const priorityColor = getPriorityColor(task.priority);
  const dueText = formatTaskDue(task);
  const isOverdue = task.isOverdue;
  const isSubtask = !!task.parent_id;
  const priorityColors = ["var(--orca-color-text-3)", "#246fe0", "#eb8909", "#d1453b"];

  return createElement(
    "div",
    {
      style: {
        ...styles.taskItem,
        ...(isHovered ? styles.taskItemHover : {}),
        opacity: isCompleting ? 0.5 : 1,
        transform: isCompleting ? "translateX(20px)" : "none",
        transition: "all 0.3s ease",
        paddingLeft: isSubtask ? "24px" : "8px",
      },
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    },
    // Checkbox
    createElement(
      "div",
      {
        style: {
          ...styles.checkbox,
          borderColor: priorityColor,
          ...(isCompleting ? styles.checkboxCompleting : {}),
        },
        onClick: handleComplete,
        title: "点击完成",
      },
      isCompleting && createElement("i", { className: "ti ti-check", style: styles.checkIcon })
    ),
    // Content
    createElement(
      "div",
      { style: styles.taskContent },
      createElement(
        "div",
        { style: { ...styles.taskTitleText, ...(isCompleting ? styles.taskTitleCompleting : {}) } },
        isSubtask && createElement("i", {
          className: "ti ti-corner-down-right",
          style: { fontSize: "12px", marginRight: "4px", color: "var(--orca-color-text-3)" },
        }),
        ...renderMarkdown(task.content)
      ),
      // Description preview
      task.description && createElement(
        "div",
        { style: styles.taskDescription },
        task.description.substring(0, 50) + (task.description.length > 50 ? "..." : "")
      ),
      // Meta info
      createElement(
        "div",
        { style: styles.taskMeta },
        dueText && createElement(
          "span",
          { style: { ...styles.taskDue, ...(isOverdue ? styles.taskDueOverdue : styles.taskDueNormal) } },
          createElement("i", { className: isOverdue ? "ti ti-alert-circle" : "ti ti-calendar", style: { fontSize: "12px" } }),
          isOverdue ? `逾期: ${dueText}` : dueText
        ),
        task.project && !task.project.is_inbox_project && createElement(
          "span",
          { style: styles.projectTag },
          createElement("i", { className: "ti ti-folder", style: { fontSize: "10px" } }),
          task.project.name
        ),
        // Labels
        task.labels && task.labels.slice(0, 2).map((label: string) => createElement(
          "span",
          { key: label, style: styles.labelTag },
          label
        )),
        task.labels && task.labels.length > 2 && createElement(
          "span",
          { style: { ...styles.labelTag, opacity: 0.7 } },
          `+${task.labels.length - 2}`
        )
      )
    ),
    // Priority quick switch (on hover)
    isHovered && !isCompleting && createElement(
      "div",
      { style: { ...styles.priorityIndicator, opacity: 1 } },
      [1, 2, 3, 4].map((p: number) => createElement(
        "div",
        {
          key: p,
          style: {
            ...styles.priorityDot,
            background: priorityColors[p - 1],
            opacity: task.priority === p ? 1 : 0.3,
            transform: task.priority === p ? "scale(1.2)" : "scale(1)",
          },
          onClick: (e: any) => handlePriorityClick(e, p),
          title: ["无优先级", "低优先级", "中优先级", "高优先级"][p - 1],
        }
      ))
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Token 设置组件
// ═══════════════════════════════════════════════════════════════════════════

function TokenSetup({ onTokenSaved }: { onTokenSaved: () => void }) {
  const [token, setToken] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState("");

  const handleSave = useCallback(async () => {
    if (!token.trim()) { setError("请输入 API Token"); return; }
    setIsValidating(true);
    setError("");
    try {
      const isValid = await validateToken(token.trim());
      if (!isValid) { setError("Token 无效，请检查后重试"); setIsValidating(false); return; }
      const pluginName = getAiChatPluginName();
      await setTodoistToken(pluginName, token.trim());
      onTokenSaved();
    } catch (err) {
      setError("验证失败，请检查网络连接");
    } finally {
      setIsValidating(false);
    }
  }, [token, onTokenSaved]);

  return createElement(
    "div",
    { style: styles.tokenSetup },
    createElement(
      "div",
      { style: styles.tokenHelp },
      "请输入你的 Todoist API Token。",
      createElement("br"),
      "获取方式：",
      createElement("span", { 
        style: styles.tokenLink, 
        onClick: () => window.open("https://todoist.com/app/settings/integrations/developer", "_blank") 
      }, "Todoist 设置 → 集成 → 开发者")
    ),
    createElement(Input, {
      style: styles.tokenInput,
      placeholder: "粘贴你的 API Token",
      value: token,
      onChange: (e: any) => setToken(e.target.value),
      type: "password",
    }),
    error && createElement("div", { style: { color: "var(--orca-color-error)", fontSize: "12px" } }, error),
    createElement(Button, {
      variant: "solid",
      onClick: handleSave,
      disabled: !token.trim() || isValidating,
    }, isValidating ? "验证中..." : "保存并验证")
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════════════

export default function TodoistTaskModal({ visible, onClose }: TodoistTaskModalProps) {
  const [tasks, setTasks] = useState([]) as [TaskWithProject[], (v: any) => void];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null) as [string | null, (v: any) => void];
  const [needsToken, setNeedsToken] = useState(false);
  const [viewMode, setViewMode] = useState(todoistModalStore.viewMode) as [TodoistViewMode, (v: any) => void];

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pluginName = getAiChatPluginName();
      const token = await getTodoistToken(pluginName);
      if (!token) { setNeedsToken(true); setLoading(false); return; }

      const [loadedTasks] = await Promise.all([
        viewMode === "today" ? getTodayTasks(token) : getAllTasks(token),
        getProjects(token), // 预加载项目缓存
      ]);
      setTasks(loadedTasks);
      setNeedsToken(false);
    } catch (err: any) {
      console.error("[todoist] Failed to load tasks:", err);
      if (err.message?.includes("401") || err.message?.includes("403")) {
        setNeedsToken(true);
      } else {
        setError(err.message || "加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    if (visible) {
      setViewMode(todoistModalStore.viewMode);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) loadTasks();
  }, [visible, loadTasks, viewMode]);

  // ESC 关闭
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  const handleComplete = useCallback(async (taskId: string) => {
    const pluginName = getAiChatPluginName();
    const token = await getTodoistToken(pluginName);
    if (!token) return;
    await closeTask(token, taskId);
    setTimeout(() => {
      setTasks((prev: TaskWithProject[]) => prev.filter((t: TaskWithProject) => t.id !== taskId));
    }, 400);
  }, []);

  const handlePriorityChange = useCallback(async (taskId: string, priority: number) => {
    const pluginName = getAiChatPluginName();
    const token = await getTodoistToken(pluginName);
    if (!token) return;
    await updateTask(token, taskId, { priority });
    setTasks((prev: TaskWithProject[]) => prev.map((t: TaskWithProject) => t.id === taskId ? { ...t, priority } : t));
  }, []);

  const handleQuickAdd = useCallback(async (content: string, dueString?: string) => {
    const pluginName = getAiChatPluginName();
    const token = await getTodoistToken(pluginName);
    if (!token) return;
    const params: CreateTaskParams = { content };
    if (dueString) params.due_string = dueString;
    await createTask(token, params);
    loadTasks();
  }, [loadTasks]);

  const handleTokenSaved = useCallback(() => {
    setNeedsToken(false);
    loadTasks();
  }, [loadTasks]);

  if (!visible) return null;

  const overdueTasks = tasks.filter((t: TaskWithProject) => t.isOverdue);
  const todayTasks = tasks.filter((t: TaskWithProject) => !t.isOverdue);

  const groupTasksByProject = (taskList: TaskWithProject[]) => {
    const groups = new Map<string, { project: TaskWithProject["project"]; tasks: TaskWithProject[] }>();
    const inboxTasks: TaskWithProject[] = [];
    for (const task of taskList) {
      if (!task.project || task.project.is_inbox_project) {
        inboxTasks.push(task);
      } else {
        if (!groups.has(task.project_id)) {
          groups.set(task.project_id, { project: task.project, tasks: [] });
        }
        groups.get(task.project_id)!.tasks.push(task);
      }
    }
    return { inboxTasks, projectGroups: Array.from(groups.values()).sort((a, b) => (a.project?.name || "").localeCompare(b.project?.name || "")) };
  };

  const { inboxTasks, projectGroups } = groupTasksByProject(todayTasks);

  let content;
  if (needsToken) {
    content = createElement(TokenSetup, { onTokenSaved: handleTokenSaved });
  } else if (loading) {
    content = createElement("div", { style: { ...styles.emptyState, padding: "40px" } }, createElement("div", { style: styles.spinner }));
  } else if (error) {
    content = createElement("div", { style: styles.errorState },
      createElement("i", { className: "ti ti-alert-circle", style: { fontSize: "24px", marginBottom: "8px" } }),
      createElement("div", null, error),
      createElement(Button, { variant: "outline", onClick: loadTasks, style: { marginTop: "12px" } }, "重试")
    );
  } else if (tasks.length === 0) {
    content = createElement("div", { style: styles.emptyState },
      createElement("div", { style: styles.emptyIcon }, "🎉"),
      createElement("div", { style: styles.emptyText }, viewMode === "today" ? "今日任务已完成！" : "没有未完成的任务！"),
      createElement(QuickAdd, { onAdd: handleQuickAdd })
    );
  } else {
    const overdueCount = overdueTasks.length;
    const todayCount = todayTasks.length;
    
    content = createElement("div", { style: styles.container },
      // Header
      createElement("div", { style: styles.taskListHeader },
        createElement("div", { style: styles.taskTitle },
          createElement("i", { className: "ti ti-checkbox" }),
          viewMode === "today" ? "今日" : "全部任务",
          createElement("span", { style: styles.taskCount }, `(${tasks.length})`)
        ),
        createElement("div", { style: { display: "flex", gap: "4px" } },
          createElement(Button, { variant: viewMode === "today" ? "soft" : "plain", style: { padding: "4px 8px", fontSize: "12px" }, onClick: () => setViewMode("today") }, "今日"),
          createElement(Button, { variant: viewMode === "all" ? "soft" : "plain", style: { padding: "4px 8px", fontSize: "12px" }, onClick: () => setViewMode("all") }, "全部"),
          createElement(Button, { variant: "plain", style: styles.refreshBtn, onClick: loadTasks, title: "刷新" }, createElement("i", { className: "ti ti-refresh" }))
        )
      ),
      // Task list
      createElement("div", { style: styles.taskList },
        // Overdue section
        overdueCount > 0 && createElement("div", { style: styles.overdueSection },
          createElement("div", { style: styles.sectionTitle },
            createElement("i", { className: "ti ti-alert-circle", style: { fontSize: "12px" } }),
            `逾期 (${overdueCount})`
          ),
          overdueTasks.map((task: TaskWithProject) => createElement(TaskItem, { key: task.id, task, onComplete: handleComplete, onPriorityChange: handlePriorityChange }))
        ),
        // Today mode
        viewMode === "today" && createElement(React.Fragment, null,
          overdueCount > 0 && todayCount > 0 && createElement("div", { style: styles.todaySection },
            createElement("div", { style: styles.todaySectionTitle },
              createElement("i", { className: "ti ti-calendar-event", style: { fontSize: "12px" } }),
              `今天 (${todayCount})`
            )
          ),
          todayTasks.map((task: TaskWithProject) => createElement(TaskItem, { key: task.id, task, onComplete: handleComplete, onPriorityChange: handlePriorityChange }))
        ),
        // All mode - grouped by project
        viewMode === "all" && createElement(React.Fragment, null,
          inboxTasks.length > 0 && createElement("div", { style: styles.projectSection },
            createElement("div", { style: styles.projectSectionTitle },
              createElement("i", { className: "ti ti-inbox", style: styles.projectIcon }),
              "收件箱",
              createElement("span", { style: styles.projectTaskCount }, inboxTasks.length)
            ),
            inboxTasks.map((task: TaskWithProject) => createElement(TaskItem, { key: task.id, task, onComplete: handleComplete, onPriorityChange: handlePriorityChange }))
          ),
          projectGroups.map((group: { project: TaskWithProject["project"]; tasks: TaskWithProject[] }) => createElement("div", { key: group.project?.id || "unknown", style: styles.projectSection },
            createElement("div", { style: styles.projectSectionTitle },
              createElement("i", { className: "ti ti-folder", style: styles.projectIcon }),
              group.project?.name || "未知项目",
              createElement("span", { style: styles.projectTaskCount }, group.tasks.length)
            ),
            group.tasks.map((task: TaskWithProject) => createElement(TaskItem, { key: task.id, task, onComplete: handleComplete, onPriorityChange: handlePriorityChange }))
          ))
        )
      ),
      // Quick add
      createElement(QuickAdd, { onAdd: handleQuickAdd })
    );
  }

  return createElement("div", { style: modalStyles.overlay, onClick: onClose },
    createElement("div", { style: modalStyles.modal, onClick: (e: any) => e.stopPropagation() },
      createElement("div", { style: modalStyles.header },
        createElement("div", { style: modalStyles.title },
          createElement("i", { className: "ti ti-checkbox", style: { color: "var(--orca-color-primary)" } }),
          "Todoist"
        ),
        createElement("button", { style: modalStyles.closeBtn, onClick: onClose },
          createElement("i", { className: "ti ti-x" })
        )
      ),
      content
    )
  );
}
