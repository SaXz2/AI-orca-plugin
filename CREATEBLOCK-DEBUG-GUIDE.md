# CreateBlock 问题定位与解决方案

## 问题分析

根据您提供的日志：

```
[AI] [Round 2] Calling tool: createBlock
[Tool] createBlock: {refBlockId: 7, pageName: '(not specified)', position: 'after', contentLength: 14}
[AI] [Round 2] Tool result: Created new block.
```

### 关键发现

1. **`createBlock` 工具已经成功执行** - 日志显示 "Created new block"
2. **参数看起来正确**：
   - `refBlockId: 7` - 这是搜索到的包含"我也爱你"的块 ID
   - `position: 'after'` - 在该块后面插入
   - `contentLength: 14` - 有 14 个字符的内容

### 可能的问题

#### 问题 1: 返回信息不够详细

当前代码在 block ID 不是 number 时，只返回 "Created new block."，这可能导致：

- AI 无法获知新创建的 block ID
- 无法验证创建是否真的成功
- 难以调试问题

#### 问题 2: 没有打印实际内容

原始日志只显示 `contentLength: 14`，但没有显示实际的 content，无法确认 AI 是否正确传递了翻译结果。

## 已实施的改进

### 改进 1: 增强日志输出

**修改前：**

```typescript
console.log("[Tool] createBlock:", {
  refBlockId,
  pageName: pageName || "(not specified)",
  position,
  contentLength: content.length,
});
```

**修改后：**

```typescript
console.log("[Tool] createBlock:", {
  refBlockId,
  pageName: pageName || "(not specified)",
  position,
  contentLength: content.length,
  content: content.length > 100 ? content.substring(0, 100) + "..." : content,
});
```

**优势：**

- ✅ 现在可以看到实际插入的内容（前 100 字符）
- ✅ 可以验证 AI 是否正确传递了翻译结果
- ✅ 便于调试内容相关的问题

### 改进 2: 改进返回值处理

**修改前：**

```typescript
if (typeof newBlockId === "number") {
  console.log(`[Tool] Successfully created block ${newBlockId}...`);
  return `Created new block: [${newBlockId}](orca-block:${newBlockId})...`;
}
return "Created new block."; // ❌ 返回信息不足
```

**修改后：**

```typescript
if (typeof newBlockId === "number") {
  console.log(`[Tool] Successfully created block ${newBlockId}...`);
  return `Created new block: [${newBlockId}](orca-block:${newBlockId})...`;
}
console.warn(`[Tool] Block created but ID is not a number:`, newBlockId);
return `Created new block (ID type: ${typeof newBlockId}, value: ${newBlockId}).`;
```

**优势：**

- ✅ 当返回值类型异常时，会有警告日志
- ✅ 返回消息包含实际的返回值类型和内容
- ✅ 帮助识别 API 调用的异常情况

## 调试步骤

### 第一步：验证改进后的日志

1. **重新构建插件**：

```bash
npm run build
```

2. **在 Orca 中重新加载插件**

3. **再次测试翻译功能**，观察新的日志输出：

```
[Tool] createBlock: {
  refBlockId: 7,
  pageName: '(not specified)',
  position: 'after',
  contentLength: 14,
  content: 'I love you too'  // ← 现在可以看到实际内容
}
```

### 第二步：检查实际问题

根据新日志判断：

**场景 A: 如果看到正确的翻译内容**

```
content: 'I love you too'
[Tool] Successfully created block 123
```

→ 说明工具运行正常，block 已成功创建

**场景 B: 如果看到错误的内容或空内容**

```
content: ''  // 或者其他非预期内容
```

→ 说明 AI 模型没有正确传递翻译结果，需要优化 prompt 或工具描述

**场景 C: 如果看到警告**

```
[Tool] Block created but ID is not a number: undefined
```

→ 说明 Orca API 调用成功但返回值异常，需要检查 Orca API 文档

## 关于 `insert_markdown` 工具的说明

### 重要区别

您提到的 `insert_markdown` 是 **MCP (Model Context Protocol)** 提供的工具，不是 Orca 插件的 API：

| 特性     | MCP `insert_markdown`          | 您的 `createBlock`                  |
| -------- | ------------------------------ | ----------------------------------- |
| 运行环境 | 独立的 MCP 服务器              | Orca 插件内部                       |
| 通信方式 | HTTP/JSON-RPC                  | 直接调用 Orca API                   |
| API      | MCP 协议                       | Orca 插件 API                       |
| 参数     | `repoId`, `refBlockId`, `text` | `refBlockId`, `position`, `content` |

### 您的 `createBlock` 已经实现了类似功能

从 `CREATEBLOCK-OPTIMIZATION.md` 可以看出，您的 `createBlock` 工具已经：

✅ 参考了 MCP 的设计思路  
✅ 实现了上下文无关的块创建  
✅ 支持通过 `refBlockId` 直接在块下创建  
✅ 支持从后端 API 获取块信息

**关键实现：**

```typescript
// 类似 MCP 的双层获取策略
let refBlock = orca.state.blocks[refBlockId];

if (!refBlock) {
  // 从后端 API 获取（MCP-like approach）
  refBlock = await orca.invokeBackend("get-block", refBlockId);
}

// 插入新块
const newBlockId = await orca.commands.invokeEditorCommand(
  "core.editor.insertBlock",
  null,
  refBlock,
  position,
  contentFragments
);
```

## 建议的测试流程

### 1. 重新测试并收集日志

```bash
# 重新构建
npm run build
```

然后在 Orca 中测试，观察这些日志：

1. `[Tool] createBlock:` - 查看实际传入的 content
2. `[Tool] Successfully created block XXX` - 确认新 block ID
3. `[Tool] Block created but ID is not a number` - 如果出现，说明有异常

### 2. 根据日志判断问题

**如果新日志显示 content 为空或错误**：

- 问题在于 AI 模型的调用
- 需要检查 system prompt 或工具描述
- 可能需要调整 AI 的指令，确保它在 content 参数中传递翻译结果

**如果新日志显示 content 正确但 block 创建失败**：

- 问题在于 Orca API 调用
- 需要检查 `orca.commands.invokeEditorCommand` 的参数
- 可能需要查看 Orca 的错误日志

**如果一切正常但 AI 没有后续引用新 block**：

- 问题可能在于返回消息的格式
- AI 可能没有正确解析返回的 block ID
- 需要优化返回消息的格式

## 下一步行动

### 立即执行

1. ✅ 已完成日志改进
2. ⏳ 重新构建插件
3. ⏳ 测试并收集新日志
4. ⏳ 根据新日志分析具体问题

### 如果需要进一步优化

**选项 A: 优化工具描述**
如果 AI 没有正确使用工具，可以改进 `createBlock` 的 description：

```typescript
{
  name: "createBlock",
  description: "创建新的笔记块。当用户要求翻译、总结或添加内容到现有笔记时使用。\n\n" +
               "**重要**: content 参数应包含完整的翻译/总结结果，而不是指令。\n" +
               "**示例**: 如果用户说'翻译XXX'，应在 content 中传入翻译后的文本。",
  // ...
}
```

**选项 B: 添加翻译专用工具**
如果翻译是高频操作，可以创建专门的 `translateAndInsert` 工具，封装"搜索 → 翻译 → 插入"的完整流程。

**选项 C: 简化位置参数**
如果总是在搜索结果后插入，可以让 `position` 默认为 `"after"`，减少 AI 的参数负担。

## 总结

✅ **已完成改进**：

- 增强了日志输出，现在可以看到实际的 content
- 改进了异常返回值的处理和日志

🔍 **需要验证**：

- 重新构建并测试，查看新的日志输出
- 确认 AI 是否正确传递了翻译内容
- 确认 block 是否真的创建成功并返回了 ID

📝 **关键 insight**：

- 您的 `createBlock` 已经实现了 MCP-like 架构，无需改用外部工具
- 当前问题更可能在于**日志不足**导致难以定位，而不是工具本身的问题
- 通过改进日志，现在可以准确判断问题出在哪个环节
