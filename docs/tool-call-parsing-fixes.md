# Tool Call Parsing Bug Fixes

## 修复日期
2026-01-31

## 问题描述

工具调用解析存在以下 bug：

1. **XML `<tool_call>` 标签检测不完整**：原始代码只检测 `<tool_call>` 开头，无法识别带属性的形式如 `<tool_call name="...">`
2. **XML 标签移除不完整**：stripXmlToolCalls 无法移除带属性的 `<tool_call>` 标签
3. **解析逻辑错误**：parseXmlToolCalls 在格式1（JSON with name）解析成功但没有提取到工具名时，仍然标记为 `parsed = true`，导致不会继续尝试格式3（name 属性）

## 修复详情

### 1. 修复 hasXmlToolCalls 检测逻辑

**文件**: `src/services/chat-stream-handler.ts`

**修改前**:
```typescript
export function hasXmlToolCalls(content: string): boolean {
  return /<tool_call>/.test(content);
}
```

**修改后**:
```typescript
export function hasXmlToolCalls(content: string): boolean {
  return /<tool_call\b/i.test(content);
}
```

**改进**:
- 使用 `\b` 词边界，确保匹配 `<tool_call` 开头的所有形式
- 添加 `i` 标志（不区分大小写）增强兼容性

### 2. 修复 stripXmlToolCalls 移除逻辑

**修改前**:
```typescript
export function stripXmlToolCalls(content: string): string {
  return content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
}
```

**修改后**:
```typescript
export function stripXmlToolCalls(content: string): string {
  return content.replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, "").trim();
}
```

**改进**:
- 使用 `[^>]*` 匹配标签属性（如 `name="xxx"`）
- 添加 `i` 标志增强鲁棒性

### 3. 修复 parseXmlToolCalls 解析逻辑

**问题根源**:
当内容为 `<tool_call name="getPage">{"pageName":"Home"}</tool_call>` 时：
- 格式1 尝试解析 `{"pageName":"Home"}` 为 JSON（成功）
- 但 JSON 中没有 `name` 字段，`toolName` 为空
- 代码仍然设置 `parsed = true`，导致不会尝试格式3

**修改前**:
```typescript
// 尝试格式1: JSON 格式
if (!parsed && innerContent.startsWith("{")) {
  try {
    const jsonObj = JSON.parse(innerContent);
    toolName = jsonObj.name || jsonObj.function?.name || "";
    let jsonArgs = jsonObj.arguments ?? jsonObj.parameters ?? {};
    // ... 处理 args
    parsed = true; // ❌ 即使没有工具名也标记为已解析
  } catch {
    // 不是有效 JSON，继续尝试其他格式
  }
}
```

**修改后**:
```typescript
// 尝试格式1: JSON 格式（必须包含 name 或 function.name 字段）
if (!parsed && innerContent.startsWith("{")) {
  try {
    const jsonObj = JSON.parse(innerContent);
    toolName = jsonObj.name || jsonObj.function?.name || "";
    
    // ✅ 只有当 JSON 中包含工具名时，才认为格式1成功
    if (toolName) {
      let jsonArgs = jsonObj.arguments ?? jsonObj.parameters ?? {};
      // ... 处理 args
      parsed = true;
    }
    // 如果 JSON 中没有 name 字段，不设置 parsed，继续尝试其他格式
  } catch {
    // 不是有效 JSON，继续尝试其他格式
  }
}
```

**关键改进**:
- 只有成功提取到工具名时才标记 `parsed = true`
- 允许在格式1失败后继续尝试格式3（name 属性）

## 测试覆盖

新增单元测试文件: `tests/tool-call-parsing.test.ts`

测试用例:
1. ✅ 检测普通 `<tool_call>` 标签
2. ✅ 检测带属性的 `<tool_call name="...">` 标签
3. ✅ 移除普通和带属性的工具调用块
4. ✅ 解析 name 属性形式（JSON 参数）
5. ✅ 解析格式1（JSON 包含 name 字段）
6. ✅ 解析格式2（arg_key/arg_value）
7. ✅ 处理多个工具调用

**测试结果**: 所有 55 个测试通过 ✅

## 支持的工具调用格式

修复后，代码支持以下所有格式：

### 格式1: JSON with name field
```xml
<tool_call>{"name": "searchNotes", "arguments": {"query": "test"}}</tool_call>
```

### 格式2: arg_key/arg_value
```xml
<tool_call>searchNotes<arg_key>query</arg_key><arg_value>test</arg_value></tool_call>
```

### 格式3: name attribute + JSON args
```xml
<tool_call name="getPage">{"pageName": "Home"}</tool_call>
```

### 格式3: name attribute + plain text
```xml
<tool_call name="searchNotes">test query</tool_call>
```

## 影响范围

- ✅ 支持更多模型的工具调用格式（Qwen, Llama, GLM 等）
- ✅ 提高工具调用解析成功率
- ✅ 向后兼容，不影响现有功能

## 验证方法

运行测试套件:
```bash
npm test
```

预期输出: `Tests: 55 passed, 0 failed`
