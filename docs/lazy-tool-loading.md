# 延迟加载工具定义架构 (Lazy Tool Loading)

## 核心思想

**完全不在系统提示词中包含工具定义**，只用纯文本列出工具名称和简短描述。当 AI 表达使用某个工具的意图后，再动态注入该工具的完整定义。

## 与 Tool-as-Skill 的区别

### Tool-as-Skill (当前方案)
```
系统提示词包含：
- 1 个工具定义 (useSkill)
  - 包含所有工具名的 enum
  - 约 400 tokens

流程：
用户: "搜索酒馆"
→ AI 调用: useSkill({skillName: "searchBlocksByText", params: {query: "酒馆"}})
→ 系统执行实际工具
```

### Lazy Tool Loading (新方案)
```
系统提示词包含：
- 0 个工具定义
- 只有纯文本列表（约 100 tokens）
  - searchBlocksByText: 全局搜索笔记库的文本内容
  - getTodayJournal: 获取今天的日记内容
  - ...

流程：
用户: "搜索酒馆"
→ AI 回复: "我将使用 <tool>searchBlocksByText</tool> 来搜索..."
→ 系统检测到意图，注入 searchBlocksByText 的完整定义
→ 发起第二次请求（带完整工具定义）
→ AI 调用: searchBlocksByText({query: "酒馆", maxResults: 10})
→ 执行工具
```

## Token 对比

| 方案 | 第一次请求 | 第二次请求 | 总计 |
|------|-----------|-----------|------|
| **传统方式** | 2300 tokens (20个工具) | - | **2300 tokens** |
| **Tool-as-Skill** | 700 tokens (1个工具) | - | **700 tokens** |
| **Lazy Loading** | 400 tokens (0个工具) | 500 tokens (1个工具) | **900 tokens** (但缓存更高效) |

**注意**：虽然总 token 看起来比 Tool-as-Skill 多，但：
1. 第一次请求极小（400 tokens），缓存命中率更高
2. 第二次请求只在需要工具时才发生
3. 对于不需要工具的对话，节省更多

## 工作流程

### 阶段一：意图检测

```typescript
// 系统提示词（加入工具列表）
const systemPrompt = `
你是一个智能笔记助手。

## 可用工具

当你需要执行以下操作时，请使用 <tool>工具名</tool> 标记来表达意图：

- searchBlocksByText: 全局搜索笔记库的文本内容
- getTodayJournal: 获取今天的日记内容
- createBlock: 创建新的笔记块
...

**使用方式**：
当你决定使用某个工具时，在回复中包含 <tool>工具名</tool>，例如：
- 要搜索笔记，使用：<tool>searchBlocksByText</tool>
- 要获取日记，使用：<tool>getTodayJournal</tool>
`;

// 第一次请求（不包含任何工具定义）
const response = await sendChatMessage({
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: "搜索酒馆" }
  ],
  tools: [] // 空数组！
});

// AI 回复示例：
// "我将使用 <tool>searchBlocksByText</tool> 来搜索您的笔记库中关于'酒馆'的内容。"
```

### 阶段二：工具调用

```typescript
import { detectToolIntent, getToolDefinition, buildToolCallPrompt } from "./lazy-tool-loading";

// 检测工具意图
const detectedTool = detectToolIntent(response.content);
// 返回: "searchBlocksByText"

if (detectedTool) {
  // 获取该工具的完整定义
  const toolDef = getToolDefinition(detectedTool);
  
  // 构建第二次请求的引导消息
  const toolPrompt = buildToolCallPrompt(detectedTool, "搜索酒馆");
  
  // 第二次请求（只包含需要的工具定义）
  const toolCallResponse = await sendChatMessage({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "搜索酒馆" },
      { role: "assistant", content: response.content },
      { role: "user", content: toolPrompt }
    ],
    tools: [toolDef] // 只有 1 个工具！
  });
  
  // AI 调用工具
  // toolCall: { name: "searchBlocksByText", arguments: { query: "酒馆", maxResults: 10 } }
}
```

## 实现示例

### 1. 修改消息构建逻辑

```typescript
// src/services/message-builder.ts

import { 
  buildToolListPrompt, 
  getEnabledToolsLazy 
} from "./lazy-tool-loading";

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const basePrompt = `你是一个智能笔记助手...`;
  
  // 获取启用的工具列表
  const enabledTools = getEnabledToolsLazy(
    options.webSearchEnabled,
    options.imageSearchEnabled,
    options.wikipediaEnabled,
    options.currencyEnabled
  );
  
  // 构建工具列表提示词（纯文本，非工具定义）
  const toolListPrompt = buildToolListPrompt(enabledTools);
  
  return `${basePrompt}\n\n${toolListPrompt}`;
}
```

### 2. 修改对话流程

```typescript
// src/services/chat-stream-handler.ts

import { 
  detectToolIntent, 
  getToolDefinition, 
  buildToolCallPrompt 
} from "./lazy-tool-loading";

export async function handleChatMessage(userMessage: string) {
  // 第一次请求：不带工具定义
  const response = await sendChatMessage({
    messages: [...conversationHistory, { role: "user", content: userMessage }],
    tools: [], // 空数组
    stream: true
  });
  
  // 收集完整回复
  let fullResponse = "";
  for await (const chunk of response) {
    fullResponse += chunk.content;
    // 流式输出给用户
    displayChunk(chunk.content);
  }
  
  // 检测工具意图
  const detectedTool = detectToolIntent(fullResponse);
  
  if (detectedTool) {
    // 获取工具定义
    const toolDef = getToolDefinition(detectedTool);
    
    if (toolDef) {
      // 发起第二次请求
      const toolPrompt = buildToolCallPrompt(detectedTool, userMessage);
      
      const toolCallResponse = await sendChatMessage({
        messages: [
          ...conversationHistory,
          { role: "user", content: userMessage },
          { role: "assistant", content: fullResponse },
          { role: "user", content: toolPrompt }
        ],
        tools: [toolDef], // 只注入需要的工具
        stream: false
      });
      
      // 处理工具调用
      if (toolCallResponse.toolCalls && toolCallResponse.toolCalls.length > 0) {
        const toolCall = toolCallResponse.toolCalls[0];
        const result = await executeTool(toolCall.name, toolCall.arguments);
        
        // 显示工具结果
        displayToolResult(result);
      }
    }
  }
}
```

### 3. 完善工具定义获取

```typescript
// src/services/lazy-tool-loading.ts

import { 
  TOOLS, 
  WEB_SEARCH_TOOL, 
  IMAGE_SEARCH_TOOL,
  WIKIPEDIA_TOOL,
  CURRENCY_TOOL 
} from "./ai-tools";

/**
 * 根据工具名获取完整的工具定义
 */
export function getToolDefinition(toolName: string): OpenAITool | null {
  // 从现有的工具定义中查找
  const allTools = [...TOOLS, WEB_SEARCH_TOOL, IMAGE_SEARCH_TOOL, WIKIPEDIA_TOOL, CURRENCY_TOOL];
  
  const tool = allTools.find(t => t.function.name === toolName);
  return tool || null;
}
```

## 优势总结

### 1. 更小的初始上下文
- **传统方式**：2300 tokens
- **Tool-as-Skill**：700 tokens
- **Lazy Loading**：400 tokens（↓ 43%）

### 2. 更高的缓存命中率
- 系统提示词更稳定（纯文本，不含复杂的工具定义）
- 第一次请求永远相同，缓存命中 100%

### 3. 真正的按需加载
- 不使用工具的对话：0 个工具定义
- 使用工具的对话：只加载 1 个需要的工具

### 4. 更灵活的扩展性
- 添加新工具只需在 `TOOL_DESCRIPTIONS` 中注册
- 不影响第一次请求的 token 消耗

## 潜在问题和解决方案

### 问题 1：两次请求增加延迟
**解决**：
- 第一次请求可以流式输出，用户体验不受影响
- 第二次请求通常很快（只有工具调用）
- 可以在检测到 `<tool>` 标记时提前中断流式输出，立即发起第二次请求

### 问题 2：AI 可能不遵循 `<tool>` 格式
**解决**：
- 在系统提示词中强调使用方式
- 提供明确的示例
- 可以通过 few-shot 学习提高准确性

### 问题 3：某些工具需要立即调用
**解决**：
- 对于高频工具（如 searchBlocksByText），可以采用混合策略
- 第一次请求就包含这些高频工具的定义
- 其他低频工具延迟加载

## 混合策略（推荐）

结合两种方案的优点：

```typescript
export function getTools(lazyLoading: boolean = false): OpenAITool[] {
  if (lazyLoading) {
    // 延迟加载模式：返回空数组
    return [];
  } else {
    // 高频工具模式：只包含最常用的 3-5 个工具
    return [
      SEARCH_BLOCKS_BY_TEXT_TOOL, // 最常用
      GET_TODAY_JOURNAL_TOOL,      // 次常用
      CREATE_BLOCK_TOOL            // 三常用
    ];
  }
}
```

系统提示词中仍然列出所有工具，但只有高频工具直接可用。

## 实施建议

1. **先实现基础版本**
   - 创建 `lazy-tool-loading.ts` 模块
   - 实现工具意图检测
   - 实现动态工具注入

2. **测试和验证**
   - 测试 AI 是否能正确使用 `<tool>` 标记
   - 测试各种工具的调用准确性
   - 对比 token 消耗和响应延迟

3. **优化和调整**
   - 根据实际使用情况调整系统提示词
   - 考虑采用混合策略（高频 + 延迟加载）
   - 优化第二次请求的引导文本

4. **逐步迁移**
   - 保留 Tool-as-Skill 作为后备方案
   - 通过功能开关控制使用哪种方案
   - 收集用户反馈后决定是否完全切换

## 总结

延迟加载工具定义架构通过将工具定义从系统提示词中完全移除，改为纯文本描述 + 按需注入，实现了：

- ✅ **最小的初始上下文**（400 tokens）
- ✅ **100% 缓存命中率**（系统提示词永不变化）
- ✅ **真正的按需加载**（需要时才注入工具定义）
- ✅ **灵活的扩展性**（添加工具不增加初始 token）

这是比 Tool-as-Skill 更进一步的优化方案，适合对 token 消耗和成本非常敏感的场景。
