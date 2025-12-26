# Change: Add Skill System - User-Defined AI Skills in Notes

## Why

当前 AI Chat 插件的工具集是硬编码的，系统提示词很长且固定。用户无法根据自己的需求定制 AI 的能力，也无法创建可复用的 AI 技能模板。

本次变更引入 **Skill 系统**，将 AI 能力"外置"到用户的笔记中，让用户可以像管理笔记一样管理 AI 的技能。这将：
- **降低 Token 消耗**：只在需要时加载特定 Skill 的内容
- **提高对话聚焦度**：AI 只关注当前任务
- **增强可扩展性**：用户可以创建、编辑、分享自定义技能
- **简化系统提示词**：基础 prompt 更轻量

## What Changes

### Core Features

1. **Skill 存储格式**
   - 用户在笔记中创建带 `#skill` 标签的块来定义技能
   - **推荐格式**：使用标签 Properties 定义类型
     ```
     父块: "翻译助手" + #skill 标签
       └─ #skill 标签 Properties: type = ["prompt"]
       └─ 子块: "你是一个专业翻译..."
     ```
   - 支持两种 Skill 类型：
     - **提示词型 Skill（prompt）**：定义角色和指令模板
     - **工具型 Skill（tools）**：指定可用工具集和使用场景
   - Skill 可包含变量占位符（如 `{目标语言}`）- V1.1 阶段实现

2. **斜杠命令触发**
   - 用户在输入框输入 `/` 时弹出 Skill 选择菜单
   - 菜单显示所有可用的 Skill 列表
   - 支持搜索过滤和键盘导航

3. **Skill 标签可视化**
   - 选中 Skill 后，输入框上方显示 SkillChip
   - 点击 X 可移除当前 Skill

4. **变量支持**（V1.1 阶段）
   - Skill 可定义变量（如翻译助手的"目标语言"）
   - 变量在发送时填充

5. **动态 System Prompt 注入**
   - 保留基础 System Prompt 的核心规则
   - 在末尾追加 Skill 的详细指令
   - 工具型 Skill 动态过滤可用工具集

### UI Components

- **SkillPicker**：Skill 选择下拉菜单组件
- **SkillChip**：输入框中的 Skill 标签组件
- **SkillVariableDialog**：变量输入弹窗（V1.1）

### New Files

- `src/services/skill-service.ts` - Skill 解析和加载服务
- `src/store/skill-store.ts` - Skill 状态管理
- `src/views/SkillPicker.tsx` - Skill 选择器组件
- `src/views/SkillChip.tsx` - Skill 标签组件

### Modified Files

- `src/views/ChatInput.tsx` - 集成 `/` 触发和 Skill 标签显示
- `src/views/AiChatPanel.tsx` - 集成 Skill 状态到消息发送流程
- `src/services/ai-tools.ts` - 支持按 Skill 过滤工具 (`filterToolsBySkill`)
- `src/utils/text-utils.ts` - 修复 `safeText` 支持字符串类型的 content

## Implementation Status (Phase 1 完成)

- [x] `skill-store.ts` - 类型定义与状态管理
- [x] `skill-service.ts` - Skill 加载和解析服务
- [x] `SkillPicker.tsx` - Skill 选择器 UI
- [x] `SkillChip.tsx` - Skill 标签组件
- [x] `ChatInput.tsx` - `/` 触发集成
- [x] `AiChatPanel.tsx` - 消息发送集成
- [x] `ai-tools.ts` - `filterToolsBySkill()` 工具过滤

**待解决问题**:
- `get-block-tree` 返回的数据结构需进一步调试（tags/properties 读取）

## Impact

- **Affected specs**: skill-system (NEW)
- **Affected code**:
  - `src/views/ChatInput.tsx`
  - `src/views/AiChatPanel.tsx`
  - `src/services/ai-tools.ts`
  - `src/utils/text-utils.ts`
  - New files: `skill-service.ts`, `skill-store.ts`, `SkillPicker.tsx`, `SkillChip.tsx`

## Migration

- **向后兼容**：不选择 Skill 时，行为与当前版本一致
- **无数据迁移**：Skill 数据存储在用户笔记中，不涉及插件数据迁移
