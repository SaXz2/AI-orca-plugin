# Design: Todoist Integration

## Context
Orca Note 用户希望在笔记环境中管理任务，Todoist 是流行的任务管理工具，有完善的 REST API。

## Goals
- 通过斜杠命令快速访问 Todoist 功能
- 支持查看、创建、完成任务
- 最小化配置（仅需 API Token）

## Non-Goals
- 不实现完整的 Todoist 客户端（项目管理、标签管理等）
- 不实现双向同步（Todoist → Orca 块）
- 不实现离线支持

## Decisions

### 1. 斜杠命令设计
| 命令 | 功能 | 参数 |
|------|------|------|
| `/todoist` | 查看今日任务 | 无 |
| `/todoist-add` | 创建任务 | 任务内容（支持自然语言日期） |
| `/todoist-done` | 标记完成 | 选择任务 |

**理由**：斜杠命令是 Orca 原生交互方式，用户无需学习新操作。

### 2. API 调用方式
使用 Todoist REST API v2：
- Base URL: `https://api.todoist.com/rest/v2`
- 认证: `Authorization: Bearer <token>`

**关键端点**：
- `GET /tasks?filter=today` - 获取今日任务
- `POST /tasks` - 创建任务
- `POST /tasks/{id}/close` - 完成任务

### 3. UI 渲染
任务列表使用类似 Todoist 的交互式 UI：
```
┌─────────────────────────────────┐
│ 📋 今日任务 (3)            🔄   │
├─────────────────────────────────┤
│ ○ 买牛奶                        │  ← 点击圆圈直接完成
│ ○ 写周报          📅 今天 17:00  │
│ ○ 回复邮件                      │
└─────────────────────────────────┘
```

**交互设计**：
- 圆形 checkbox：点击直接标记完成（带动画反馈）
- 完成后：圆圈变绿 ✓，任务划线，0.5s 后淡出移除
- 刷新按钮：手动刷新任务列表
- 空状态：显示"🎉 今日任务已完成"

使用 React 组件渲染，通过 `orca.panels` 或 Modal 展示。

### 4. Token 存储
在插件设置中添加 `todoistApiToken` 字段：
```typescript
// src/settings/ai-chat-settings.ts
todoistApiToken: {
  type: "string",
  title: "Todoist API Token",
  description: "从 Todoist 设置 > 集成 > API Token 获取",
  default: ""
}
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| API Token 泄露 | 存储在用户本地设置，不上传 |
| API 限流 | 添加请求节流，缓存任务列表 |
| 网络错误 | 显示友好错误提示，支持重试 |

## Open Questions
- [ ] 是否需要支持项目筛选？（初版不支持）
- [ ] 任务列表是否需要实时刷新？（初版手动刷新）
