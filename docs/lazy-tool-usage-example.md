# 延迟加载工具 - 使用示例

## 快速开始

### 1. 添加配置选项

在设置中添加延迟加载开关（建议添加到 `src/settings/ai-chat-settings.ts`）：

```typescript
export const aiChatSettings = {
  // ... 现有设置
  
  lazyToolLoading: {
    type: "boolean",
    label: "启用延迟加载工具定义",
    description: "减少初始上下文 token 消耗，按需加载工具定义",
    default: false,
  },
  
  useHybridStrategy: {
    type: "boolean",
    label: "使用混合策略",
    description: "高频工具直接可用，低频工具延迟加载",
    default: false,
  },
};
```

### 2. 在对话流程中使用

修改对话处理逻辑（比如在 `AiChatPanel.tsx` 或 `chat-stream-handler.ts` 中）：

```typescript
import { 
  streamChatWithLazyLoading,
  streamChatWithHybridStrategy,
  enhanceSystemPromptWithToolList,
  type LazyLoadingOptions
} from "../services/lazy-tool-integration";

// 获取配置
const lazyOptions: LazyLoadingOptions = {
  enabled: settings.lazyToolLoading ?? false,
  webSearchEnabled: settings.webSearch ?? false,
  imageSearchEnabled: settings.imageSearch ?? false,
  wikipediaEnabled: settings.wikipedia ?? false,
  currencyEnabled: settings.currency ?? false,
};

// 增强系统提示词（添加工具列表）
const enhancedSystemPrompt = enhanceSystemPromptWithToolList(
  baseSystemPrompt,
  lazyOptions
);

const messages: OpenAIChatMessage[] = [
  { role: "system", content: enhancedSystemPrompt },
  ...conversationHistory,
  { role: "user", content: userMessage }
];

// 方案 1: 纯延迟加载
if (lazyOptions.enabled && !settings.useHybridStrategy) {
  for await (const chunk of streamChatWithLazyLoading(
    messages,
    {
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature,
      signal: abortController.signal,
    },
    lazyOptions,
    (toolName) => {
      // 检测到工具意图的回调
      console.log(`检测到工具意图: ${toolName}`);
      // 可以在这里显示加载提示给用户
    }
  )) {
    // 处理流式输出
    if (chunk.type === "content") {
      displayContent(chunk.content);
    } else if (chunk.type === "tool_calls") {
      handleToolCalls(chunk.toolCalls);
    }
    
    // 可以访问延迟加载状态
    if (chunk.lazyState) {
      console.log(`当前阶段: ${chunk.lazyState.stage}`);
    }
  }
}

// 方案 2: 混合策略（推荐）
if (lazyOptions.enabled && settings.useHybridStrategy) {
  for await (const chunk of streamChatWithHybridStrategy(
    messages,
    {
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature,
      signal: abortController.signal,
    },
    lazyOptions,
    (toolName) => {
      console.log(`检测到低频工具意图: ${toolName}`);
    }
  )) {
    // 处理流式输出
    if (chunk.type === "content") {
      displayContent(chunk.content);
    } else if (chunk.type === "tool_calls") {
      handleToolCalls(chunk.toolCalls);
    }
  }
}
```

## 完整集成示例

### 在现有对话服务中集成

假设你有一个 `handleChatMessage` 函数：

```typescript
async function handleChatMessage(userMessage: string, settings: any) {
  const lazyOptions: LazyLoadingOptions = {
    enabled: settings.lazyToolLoading ?? false,
    webSearchEnabled: settings.webSearch ?? false,
    imageSearchEnabled: settings.imageSearch ?? false,
    wikipediaEnabled: settings.wikipedia ?? false,
    currencyEnabled: settings.currency ?? false,
  };
  
  // 1. 构建基础系统提示词
  let systemPrompt = "你是一个智能笔记助手...";
  
  // 2. 如果启用延迟加载，添加工具列表
  systemPrompt = enhanceSystemPromptWithToolList(systemPrompt, lazyOptions);
  
  // 3. 构建消息
  const messages: OpenAIChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage }
  ];
  
  // 4. 选择策略
  const streamOptions = {
    apiUrl: settings.apiUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    temperature: settings.temperature ?? 0.7,
    signal: abortController.signal,
  };
  
  let stream;
  
  if (lazyOptions.enabled) {
    if (settings.useHybridStrategy) {
      // 混合策略
      stream = streamChatWithHybridStrategy(
        messages,
        streamOptions,
        lazyOptions,
        (toolName) => {
          console.log(`[延迟加载] 检测到工具: ${toolName}`);
        }
      );
    } else {
      // 纯延迟加载
      stream = streamChatWithLazyLoading(
        messages,
        streamOptions,
        lazyOptions,
        (toolName) => {
          console.log(`[延迟加载] 检测到工具: ${toolName}`);
        }
      );
    }
  } else {
    // 传统方式（Tool-as-Skill）
    const { getTools } = require("../services/ai-tools");
    const tools = getTools(lazyOptions.webSearchEnabled);
    
    stream = streamChatCompletion({
      ...streamOptions,
      messages,
      tools
    });
  }
  
  // 5. 处理流式输出
  for await (const chunk of stream) {
    if (chunk.type === "content") {
      displayStreamingContent(chunk.content);
    } else if (chunk.type === "tool_calls") {
      await executeToolCalls(chunk.toolCalls);
    } else if (chunk.type === "done") {
      console.log("对话完成");
    }
  }
}
```

## 高级用法

### 自定义高频工具列表

编辑 `lazy-tool-integration.ts` 中的 `getHighFrequencyTools` 函数：

```typescript
export function getHighFrequencyTools(lazyOptions: LazyLoadingOptions): OpenAITool[] {
  if (!lazyOptions.enabled) {
    return [];
  }
  
  // 自定义高频工具列表
  const highFrequencyToolNames = [
    "searchBlocksByText",    // 你最常用的工具
    "getTodayJournal",
    "createBlock",
    "searchBlocksByTag",     // 添加更多高频工具
    "getPage",
  ];
  
  const highFreqTools: OpenAITool[] = [];
  
  for (const toolName of highFrequencyToolNames) {
    const toolDef = getToolDefinition(toolName);
    if (toolDef) {
      highFreqTools.push(toolDef);
    }
  }
  
  return highFreqTools;
}
```

### 监控和调试

```typescript
// 在对话流程中添加监控
for await (const chunk of streamChatWithHybridStrategy(
  messages,
  streamOptions,
  lazyOptions,
  (toolName) => {
    // 记录工具使用统计
    trackToolUsage(toolName, "lazy-loaded");
    
    // 显示加载提示
    showNotification(`正在加载工具: ${toolName}`);
  }
)) {
  if (chunk.lazyState) {
    // 监控延迟加载状态
    console.log(`[延迟加载] 阶段: ${chunk.lazyState.stage}`);
    
    if (chunk.lazyState.stage === "tool_detected") {
      console.log(`[延迟加载] 检测到工具: ${chunk.lazyState.detectedTool}`);
    }
    
    if (chunk.lazyState.stage === "tool_loaded") {
      console.log(`[延迟加载] 工具定义已注入`);
    }
  }
  
  // 处理其他类型的输出
  // ...
}
```

### Token 统计

```typescript
import { estimateTotalTokens } from "../services/context-manager";

// 统计系统提示词的 token
const basePromptTokens = estimateTotalTokens([
  { role: "system", content: baseSystemPrompt }
]);

const enhancedPromptTokens = estimateTotalTokens([
  { role: "system", content: enhanceSystemPromptWithToolList(baseSystemPrompt, lazyOptions) }
]);

console.log(`基础提示词: ${basePromptTokens} tokens`);
console.log(`增强提示词: ${enhancedPromptTokens} tokens`);
console.log(`增加: ${enhancedPromptTokens - basePromptTokens} tokens`);

// 对比传统方式
const { getTools } = require("../services/ai-tools");
const traditionalTools = getTools(true);
const traditionalToolsSize = JSON.stringify(traditionalTools).length / 4; // 粗略估算

console.log(`传统工具定义约: ${traditionalToolsSize} tokens`);
console.log(`延迟加载节省约: ${traditionalToolsSize - (enhancedPromptTokens - basePromptTokens)} tokens`);
```

## 最佳实践

### 1. 逐步启用

```typescript
// 先在测试环境启用
if (process.env.NODE_ENV === "development") {
  lazyOptions.enabled = true;
} else {
  lazyOptions.enabled = false; // 生产环境保持原有方式
}
```

### 2. A/B 测试

```typescript
// 随机分配用户到不同的策略
const userId = getCurrentUserId();
const useStrategy = hashUserId(userId) % 3;

const lazyOptions: LazyLoadingOptions = {
  enabled: useStrategy > 0, // 66% 用户使用延迟加载
  // ...
};

const useHybrid = useStrategy === 2; // 33% 用户使用混合策略

// 记录用户使用的策略
trackStrategy(userId, useStrategy === 0 ? "traditional" : useHybrid ? "hybrid" : "lazy");
```

### 3. 错误处理

```typescript
try {
  for await (const chunk of streamChatWithLazyLoading(
    messages,
    streamOptions,
    lazyOptions,
    (toolName) => {
      console.log(`检测到工具: ${toolName}`);
    }
  )) {
    // 处理流式输出
  }
} catch (error) {
  console.error("[延迟加载] 错误:", error);
  
  // 回退到传统方式
  console.log("[延迟加载] 回退到传统方式");
  const { getTools } = require("../services/ai-tools");
  const tools = getTools(lazyOptions.webSearchEnabled);
  
  for await (const chunk of streamChatCompletion({
    ...streamOptions,
    messages,
    tools
  })) {
    // 处理流式输出
  }
}
```

## 性能监控指标

```typescript
// 记录每次对话的性能指标
const metrics = {
  strategy: lazyOptions.enabled ? "lazy" : "traditional",
  toolDetected: false,
  toolName: null as string | null,
  firstRequestTokens: 0,
  secondRequestTokens: 0,
  totalLatency: 0,
  firstRequestLatency: 0,
  secondRequestLatency: 0,
};

const startTime = Date.now();

for await (const chunk of streamChatWithLazyLoading(
  messages,
  streamOptions,
  lazyOptions,
  (toolName) => {
    metrics.toolDetected = true;
    metrics.toolName = toolName;
    metrics.firstRequestLatency = Date.now() - startTime;
  }
)) {
  if (chunk.lazyState?.stage === "completed") {
    metrics.totalLatency = Date.now() - startTime;
    
    if (metrics.toolDetected) {
      metrics.secondRequestLatency = metrics.totalLatency - metrics.firstRequestLatency;
    }
  }
}

// 上报指标
reportMetrics(metrics);
```

## 总结

延迟加载工具定义的完整实施步骤：

1. ✅ 创建核心模块（`lazy-tool-loading.ts`）
2. ✅ 创建集成服务（`lazy-tool-integration.ts`）
3. ⬜ 在设置中添加配置选项
4. ⬜ 修改对话流程使用新的 API
5. ⬜ 测试和验证功能
6. ⬜ 监控性能指标
7. ⬜ 根据数据优化策略

**推荐策略**：
- **开发阶段**：使用纯延迟加载测试
- **小规模测试**：使用混合策略（平衡性能和节省）
- **生产环境**：根据数据决定是否全面推广
