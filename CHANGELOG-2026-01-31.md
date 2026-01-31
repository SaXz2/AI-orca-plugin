# 2026-01-31 修复和优化

## 🎯 主要修复

### 1. 工具调用解析 Bug（严重）✅
**问题**: 部分模型（Qwen、Llama等）的工具调用格式 `<tool_call name="xxx">` 无法解析

**影响**: 工具调用完全失败

**修复**:
- 优化 `hasXmlToolCalls` 正则表达式支持属性形式
- 修复 `parseXmlToolCalls` 解析逻辑
- 优化 `stripXmlToolCalls` 移除逻辑

**测试**: 新增 7 个单元测试，全部通过

**文件**: `src/services/chat-stream-handler.ts`

---

### 2. Skills 自动执行问题（严重）✅
**问题**: AI 调用 Skills 工具时直接执行，没有询问用户

**风险**: 隐私和安全问题

**修复**: 添加强制用户确认对话框
```typescript
const { createToolConfirmPromise } = await import("../components/ToolConfirmDialog");
const userApproved = await createToolConfirmPromise(
  `skill: ${skill.metadata.name}`,
  { skillId: resolvedSkillId.id, input: args.input || "" }
);
```

**文件**: `src/views/AiChatPanel.tsx` (2286-2325)

---

## 📚 文档完善

### 新增文档

1. **`docs/tool-call-parsing-fixes.md`**
   - 详细的工具调用解析修复说明
   - 支持的格式说明
   - 修复前后对比

2. **`docs/tool-config-summary.md`**
   - 当前工具配置总览（23个基础工具）
   - 系统提示词分析
   - 发现的待优化问题

3. **`docs/tool-status-usage.md`**
   - 三种工具状态的使用场景
   - 与开关的区别
   - 最佳实践建议

4. **`docs/2026-01-31-fixes-summary.md`**
   - 本次修复的简要总结

---

## 🔧 工具状态管理

### 三种状态说明

| 状态 | 说明 | 适用场景 |
|------|------|---------|
| **auto** | 自动执行 | 搜索、读取等安全的只读操作 |
| **ask** | 询问用户 | 写入操作、联网搜索等敏感操作 |
| **disabled** | 临时禁用 | 调试、精细控制单个工具 |

### 与开关的配合

- **全局开关**: 控制整个功能模块（如 `webSearchEnabled`）
- **工具状态**: 精细控制单个工具

**示例**:
```typescript
// 开启联网搜索模块
setWebSearchEnabled(true);

// 但禁用图片搜索，保留网页搜索
setToolStatus("imageSearch", "disabled");
setToolStatus("webSearch", "auto");
```

---

## 📊 工具统计

**基础工具数量**: 23 个

**分类**:
- 搜索类: 4个
- 读取类: 4个
- 日记类: 3个
- 写入类: 4个
- 其他: 8个

**动态工具**:
- Skills（用户自定义）
- Todoist（6个工具）
- 脚本分析

---

## ⚠️ 发现的待优化问题

### AI 过度调用工具

**现象**: 用户问"什么是 XXX"时，AI 可能错误地调用 searchNotes

**原因**: 系统提示词没有明确区分"查询笔记"和"一般性提问"

**建议**: 在系统提示词中添加工具调用判断规则

---

## ✅ 测试结果

```bash
npm test
```

**结果**: 所有 55 个测试通过 ✅

**新增测试**:
- `hasXmlToolCalls` 检测（2个）
- `stripXmlToolCalls` 移除（1个）
- `parseXmlToolCalls` 解析（4个）

---

## 🚀 部署说明

修复完成后需要重新构建：

```bash
npm run build
```

然后部署到 Orca Note 即可生效。

---

## 📝 相关文件

### 核心代码
- `src/services/chat-stream-handler.ts` - 工具调用解析
- `src/services/ai-tools.ts` - 工具定义（23个）
- `src/store/tool-store.ts` - 工具状态管理
- `src/settings/ai-chat-settings.ts` - 系统提示词
- `src/views/AiChatPanel.tsx` - 工具执行逻辑

### 测试文件
- `tests/tool-call-parsing.test.ts` - 新增的解析测试

### 文档
- `docs/tool-call-parsing-fixes.md`
- `docs/tool-config-summary.md`
- `docs/tool-status-usage.md`
- `docs/2026-01-31-fixes-summary.md`

---

## 🎉 总结

本次修复解决了两个严重 bug，完善了工具状态管理，新增了详细的使用文档。

系统现在更加：
- ✅ **稳定**: 工具调用解析支持所有格式
- ✅ **安全**: Skills 必须经过用户确认
- ✅ **灵活**: 三种状态 + 全局开关，精细控制
- ✅ **可测**: 完整的单元测试覆盖

所有测试通过，可以放心使用！🎊
