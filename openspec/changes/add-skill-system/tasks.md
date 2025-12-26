# Skill System - Implementation Tasks

## Phase 1: V1 Core (核心功能)

### 1.1 类型定义与状态管理
- [x] 1.1.1 创建 `src/store/skill-store.ts`
  - 定义 `SkillMeta` 接口（id, name, description, type）
  - 定义 `Skill` 接口（含 prompt, tools）
  - 实现 `skillStore` (Valtio proxy)
  - 实现 `setActiveSkill()`, `clearSkill()`

### 1.2 Skill 解析服务
- [x] 1.2.1 创建 `src/services/skill-service.ts`
- [x] 1.2.2 实现 `loadAllSkills()`: 加载所有 Skill
  - 调用 `searchBlocksByTag("skill")` 获取 Skill 块
  - 对每个块调用 `get-block-tree` 获取子块
  - 解析并返回 `Skill[]`
- [x] 1.2.3 实现 `parseSkillFromTree()`: 解析单个 Skill
  - 关键字匹配（大小写不敏感）：类型/Type, 描述/Description, 提示词/Prompt, 工具/Tools
  - 分隔符容错：`:` 和 `：`
  - 逗号容错：`,` 和 `，`
  - 无效 Skill → console.warn 并跳过
- [x] 1.2.4 实现 `normalizeToolName()`: 工具名规范化
  - 建立别名映射表（camelCase → snake_case）
  - 处理未知工具名警告

### 1.3 Skill 选择器 UI
- [x] 1.3.1 创建 `src/views/SkillPicker.tsx`
  - 复用 ContextPicker 浮层样式
  - 显示 Skill 列表（名称 + 描述）
  - 搜索过滤功能
  - 空状态提示
- [x] 1.3.2 实现键盘导航
  - ↑↓ 导航
  - Enter 选中
  - Esc 关闭
- [x] 1.3.3 实现 Skill 选中逻辑
  - 点击/Enter → setActiveSkill()
  - 关闭菜单
  - 焦点回到输入框

### 1.4 Skill 标签组件
- [x] 1.4.1 创建 `src/views/SkillChip.tsx`
  - 复用 ContextChips 样式
  - 显示 Skill 名称 + X 按钮
  - 点击 X → clearSkill()

### 1.5 ChatInput 集成
- [x] 1.5.1 修改 `src/views/ChatInput.tsx`
  - 添加 `/` 触发检测（复用 `@` 触发模式）
  - 阻止触发位置的 `/` 插入
  - 添加 `[skillPickerOpen, setSkillPickerOpen]` 状态
- [x] 1.5.2 渲染 SkillPicker
  - 传入 anchorRef
  - 处理 onClose
- [x] 1.5.3 渲染 SkillChip
  - 在 ContextChips 旁显示
  - 读取 `skillStore.activeSkill`

### 1.6 消息发送集成
- [x] 1.6.1 修改 `src/views/AiChatPanel.tsx` 的 `handleSend()`
  - 读取 `skillStore.activeSkill`
  - 构建 Skill prompt 追加内容
  - 计算 `activeTools` 过滤结果
- [x] 1.6.2 修改 `buildConversationMessages()` 调用
  - 传入拼接后的 systemPrompt
- [x] 1.6.3 修改所有 `streamChatWithRetry()` 调用
  - 使用 `activeTools` 替代 `TOOLS`

### 1.7 工具过滤
- [x] 1.7.1 在 `src/services/ai-tools.ts` 添加 `filterToolsBySkill()`
  - 工具名规范化
  - 白名单过滤
  - 全部无效 → 回退到全部工具

### 1.8 已发现的问题（待修复）
- [ ] 1.8.1 `get-block-tree` 返回的数据结构调试
  - `searchBlocksByTag` 返回的块不包含 `tags` 字段
  - 需要确认 `tree` 对象中 `tags` 的实际结构
  - 需要确认 `tags[].properties` 的格式
- [ ] 1.8.2 `safeText` 对不同 `content` 格式的支持
  - 已修复：支持 `content` 为字符串的情况
  - 待确认：`content` 为数组时的解析是否正确

### 1.9 实现细节记录

**文件清单**:
- `src/store/skill-store.ts` - Skill 状态管理
- `src/services/skill-service.ts` - Skill 加载和解析
- `src/views/SkillPicker.tsx` - Skill 选择器 UI
- `src/views/SkillChip.tsx` - Skill 标签组件
- `src/views/ChatInput.tsx` - 集成 `/` 触发
- `src/views/AiChatPanel.tsx` - 消息发送集成
- `src/services/ai-tools.ts` - `filterToolsBySkill()` 函数
- `src/utils/text-utils.ts` - `safeText()` 修复

**关键发现**:
- Orca 的 `#skill` 标签可以有 Properties（使用 TextChoices 类型）
- `data-type="prompt"` 在 HTML 中可见，需要从 API 返回的数据中读取
- 子块内容全部作为 prompt，无需 `提示词:` 前缀

---

## Phase 2: V1.1 Variables (变量支持)

### 2.1 变量解析
- [ ] 2.1.1 扩展 `parseSkillFromTree()` 解析变量声明
  - 解析 `变量/Variables` 字段
  - 存入 `Skill.variables: string[]`

### 2.2 变量状态管理
- [ ] 2.2.1 扩展 `skill-store.ts`
  - 添加 `variables: Record<string, string>`
  - 实现 `setVariable(name, value)`
  - 实现 `getMissingVariables(skill): string[]`

### 2.3 变量检测与弹窗
- [ ] 2.3.1 创建 `src/views/SkillVariableDialog.tsx`
  - 显示缺失变量列表
  - 输入框填写
  - 确认/取消按钮
- [ ] 2.3.2 修改 `handleSend()` 添加变量检测
  - 发送前检测缺失变量
  - 显示弹窗
  - 填写完成后继续发送

### 2.4 变量替换
- [ ] 2.4.1 实现 `replaceVariables(prompt, variables): string`
  - 替换 `{变量名}` 为实际值
  - 未声明的 `{xxx}` 保留原样

---

## Phase 3: V1.2 Polish (体验优化)

### 3.1 消息气泡标记
- [ ] 3.1.1 在 assistant 消息末尾添加 Skill 标记
  - 格式: `[技能: XX]`
  - 可选开关

### 3.2 刷新机制
- [ ] 3.2.1 添加"刷新 Skill 列表"按钮
  - 在 SkillPicker 顶部
  - 点击重新加载

### 3.3 使用频率排序
- [ ] 3.3.1 记录 Skill 使用次数
  - 存储在 localStorage
  - 按使用频率排序

---

## Testing

### Unit Tests
- [ ] T1 `tests/skill-parser.test.ts`
  - 测试 prompt-type Skill 解析
  - 测试 tools-type Skill 解析
  - 测试中英文标点容错
  - 测试无效 Skill 跳过

### Integration Tests
- [ ] T2 手动测试清单
  - 创建测试 Skill（两种类型）
  - `/` 触发菜单
  - 选择 Skill → 显示 Chip
  - 发送消息 → 验证 prompt 注入
  - 工具型 → 验证工具过滤

---

## Dependencies

```
1.1 → 1.2 → 1.3, 1.4 (可并行)
1.3, 1.4 → 1.5
1.2, 1.5 → 1.6
1.2 → 1.7

2.1 → 2.2 → 2.3, 2.4

Phase 2 depends on Phase 1 完成
Phase 3 depends on Phase 1 完成（可与 Phase 2 并行）
```

## Parallelizable Work

- 1.3 (SkillPicker) 和 1.4 (SkillChip) 可并行开发
- Phase 2 和 Phase 3 可并行开发（都基于 Phase 1）
- T1 和 T2 可并行进行
