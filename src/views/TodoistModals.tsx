/**
 * Todoist Modal 容器
 * 监听 store 状态，渲染对应的 Modal
 */

import { todoistModalStore } from "../store/todoist-store";
import TodoistTaskModal from "./TodoistTaskModal";
import TodoistAddTaskModal from "./TodoistAddTaskModal";

const { createElement } = window.React as any;
const { useSnapshot } = window.Valtio as any;

export default function TodoistModals() {
  const snap = useSnapshot(todoistModalStore);

  return createElement(
    "div",
    null,
    // 任务列表 Modal
    createElement(TodoistTaskModal, {
      visible: snap.showTaskList,
      onClose: () => {
        todoistModalStore.showTaskList = false;
      },
    }),
    // 添加任务 Modal
    createElement(TodoistAddTaskModal, {
      visible: snap.showAddTask,
      onClose: () => {
        todoistModalStore.showAddTask = false;
        todoistModalStore.addTaskContent = "";
      },
      initialContent: snap.addTaskContent,
    })
  );
}
