# Change: Add Todoist integration via slash commands

## Why
用户希望在 Orca Note 中直接管理 Todoist 任务，无需切换应用。通过斜杠命令触发，保持非侵入式体验。

## What Changes
- 新增 Todoist API 服务层，支持任务的 CRUD 操作
- 新增斜杠命令：
  - `/todoist` - 查看今日任务
  - `/todoist-add` - 创建新任务（支持自然语言日期）
  - `/todoist-done` - 标记任务完成
- 新增设置项：Todoist API Token 配置
- 新增任务列表 UI 组件（内嵌在编辑器中）

## Impact
- Affected specs: todoist-integration (new)
- Affected code: 
  - `src/services/todoist-service.ts` (new)
  - `src/ui/todoist-slash-commands.ts` (new)
  - `src/views/TodoistTaskList.tsx` (new)
  - `src/settings/ai-chat-settings.ts` (add token field)
