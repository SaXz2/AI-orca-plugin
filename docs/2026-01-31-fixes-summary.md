# 2026-01-31 修复总结

## 修复的问题

### ✅ 1. 工具调用解析 Bug（严重）
**文件**: `src/services/chat-stream-handler.ts`

**问题**:
- `<tool_call name="xxx">` 格式无法识别
- 解析逻辑错误，导致工具调用完全失败

**修复**:
- `hasXmlToolCalls`: 使用 `/<tool_call\b/i` 支持属性形式
- `stripXmlToolCalls`: 使用 `[^>]*` 匹配所有属性
- `parseXmlToolCalls`: 只有成功提取工具名才标记为已解析

**测试**: 新增 7 个单元测试，全部通过

---

### ✅ 2. Skills 自动执行问题（严重）
**文件**: `src/views/AiChatPanel.tsx` (2286-2325)

**问题**: 
Skills 工具被 AI 调用时直接执行，没有询问用户

**修复**:
添加用户确认流程：
```typescript
// 使用确认对话框询问用户
const { createToolConfirmPromise } = await import("../components/ToolConfirmDialog");
const userApproved = await createToolConfirmPromise(
  `skill: ${skill.metadata.name}`,
  { skillId: resolvedSkillId.id, input: args.input || "" }
);

if (!userApproved) {
  result = `用户拒绝执行 Skill。请尝试其他方式或直接回答用户的问题。`;
}
```

---

## 工具配置总结

**当前工具数量**: 23 个基础工具 + 动态工具（Skills、Todoist等）

**工具分类**:
- 搜索类: 4个 (searchNotes, queryByTagProperty, query_blocks, searchBlocksByReference)
- 读取类: 4个 (getPage, getBlocksText, getBlockMeta, getBlockLinks)
- 日记类: 3个 (getTodayJournal, getJournalByDate, getJournals)
- 写入类: 4个 (createBlock, createPage, insertTag, updateTagProperties)
- 其他: 8个 (联网搜索、图像搜索、Wikipedia等)

**工具状态**:
- `auto` - 自动批准（默认）
- `ask` - 询问用户
- `disabled` - 禁用，不加载到工具列表

**Skills 特殊处理**: 强制要求用户确认（代码级别控制）

---

## 系统提示词

**位置**: `src/settings/ai-chat-settings.ts`

**当前特点**:
- ✅ 强调真实性（不编造内容）
- ✅ 规范引用格式
- ✅ 避免重复调用工具
- ⚠️ **缺失**: 没有明确区分"查询笔记"和"一般性提问"

---

## 发现的待修复问题

### 🟡 AI 过度调用工具

**现象**: 
用户问"什么是 XXX"时，AI 可能错误地调用 searchNotes

**建议修复**:
在系统提示词添加：
```
## 工具调用判断
- 仅在用户明确要求查询笔记时才调用工具
- 用户询问概念、原理、解释等一般性问题时，直接回答，不要调用工具
- 判断标准：
  ✅ 需要工具："我的笔记里有XXX吗"、"搜索XXX"
  ❌ 不需要工具："XXX是什么"、"解释XXX"
```

---

## 测试结果

```bash
npm test
```

✅ **所有 55 个测试通过**

新增测试:
- `hasXmlToolCalls` 检测（2个测试）
- `stripXmlToolCalls` 移除（1个测试）
- `parseXmlToolCalls` 解析（4个测试）

---

## 相关文档

- 详细修复说明: `docs/tool-call-parsing-fixes.md`
- 工具配置总结: `docs/tool-config-summary.md`

---

## 构建和部署

修复完成后需要重新构建：
```bash
npm run build
```

部署到 Orca Note 后即可生效。
