# Tasks: Todoist Integration

## 1. 基础设施
- [x] 1.1 在 `ai-chat-settings.ts` 添加 `todoistApiToken` 设置项（改用 plugin data 存储）
- [x] 1.2 创建 `src/services/todoist-service.ts` 服务层

## 2. API 服务实现
- [x] 2.1 实现 `getTodayTasks()` - 获取今日任务
- [x] 2.2 实现 `createTask(content, dueString?)` - 创建任务
- [x] 2.3 实现 `closeTask(taskId)` - 完成任务
- [x] 2.4 添加错误处理和 Token 验证

## 3. 斜杠命令注册
- [x] 3.1 创建 `src/ui/todoist-slash-commands.ts`
- [x] 3.2 注册 `/todoist` 命令 - 查看今日任务
- [x] 3.3 注册 `/todoist-add` 命令 - 创建任务
- [x] 3.4 注册 `/todoist-done` 命令 - 标记完成

## 4. UI 组件
- [x] 4.1 创建 `src/views/TodoistTaskModal.tsx` 任务列表组件
- [x] 4.2 实现任务项渲染（checkbox、内容、日期）
- [x] 4.3 实现点击完成交互

## 5. 集成与测试
- [x] 5.1 在 `main.ts` 中注册斜杠命令
- [ ] 5.2 在 Orca Note 中测试完整流程
- [ ] 5.3 添加 L10N 翻译（中/英）
