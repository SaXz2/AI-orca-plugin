/**
 * Lazy Tool Loading Integration Service
 * 
 * 集成延迟加载工具到现有的对话流程中
 */

import type { OpenAIChatMessage, OpenAITool } from "./openai-client";
import { 
  detectToolIntent, 
  getToolDefinition, 
  buildToolCallPrompt,
  buildToolListPrompt,
  getEnabledToolsLazy
} from "./lazy-tool-loading";
import { streamChatCompletion, type StreamOptions, type StreamChunk } from "./chat-stream-handler";

/**
 * 延迟加载对话状态
 */
export type LazyLoadingState = {
  stage: "initial" | "tool_detected" | "tool_loaded" | "completed";
  detectedTool?: string;
  firstResponse?: string;
  toolCallId?: string;
};

/**
 * 延迟加载配置选项
 */
export type LazyLoadingOptions = {
  enabled: boolean;
  webSearchEnabled?: boolean;
  imageSearchEnabled?: boolean;
  wikipediaEnabled?: boolean;
  currencyEnabled?: boolean;
};

/**
 * 使用延迟加载策略的流式对话
 * 
 * @param messages 对话消息列表
 * @param streamOptions 流式选项
 * @param lazyOptions 延迟加载选项
 * @param onToolDetected 检测到工具意图时的回调
 */
export async function* streamChatWithLazyLoading(
  messages: OpenAIChatMessage[],
  streamOptions: Omit<StreamOptions, "messages" | "tools">,
  lazyOptions: LazyLoadingOptions,
  onToolDetected?: (toolName: string) => void
): AsyncGenerator<StreamChunk & { lazyState?: LazyLoadingState }, void, unknown> {
  
  const state: LazyLoadingState = {
    stage: "initial"
  };

  // 如果未启用延迟加载，直接使用原有方式
  if (!lazyOptions.enabled) {
    // 导入原有的工具列表
    const aiTools = await import("./ai-tools");
    const tools = aiTools.getTools(lazyOptions.webSearchEnabled);
    
    yield* streamChatCompletion({
      ...streamOptions,
      messages,
      tools
    });
    return;
  }

  // ========== 阶段 1：初始请求（不带工具定义）==========
  
  let fullResponse = "";
  let fullReasoning = "";
  
  // 第一次请求不包含任何工具定义
  for await (const chunk of streamChatCompletion({
    ...streamOptions,
    messages,
    tools: [] // 空数组，不包含工具定义
  })) {
    if (chunk.type === "content" && chunk.content) {
      fullResponse += chunk.content;
      yield { ...chunk, lazyState: state };
    } else if (chunk.type === "reasoning" && chunk.reasoning) {
      fullReasoning += chunk.reasoning;
      yield { ...chunk, lazyState: state };
    } else if (chunk.type === "tool_calls") {
      // 如果 AI 直接调用了工具（不应该发生，因为我们没提供工具定义）
      // 但某些模型可能会尝试
      yield { ...chunk, lazyState: state };
    } else if (chunk.type === "done") {
      // 第一次请求完成，检查是否包含工具意图
      const detectedTool = detectToolIntent(chunk.result.content || "");
      
      if (detectedTool) {
        // ========== 阶段 2：检测到工具意图 ==========
        state.stage = "tool_detected";
        state.detectedTool = detectedTool;
        state.firstResponse = chunk.result.content || "";
        
        if (onToolDetected) {
          onToolDetected(detectedTool);
        }
        
        // 获取该工具的完整定义
        const toolDef = getToolDefinition(detectedTool);
        
        if (toolDef) {
          state.stage = "tool_loaded";
          
          // ========== 阶段 3：发起第二次请求（带工具定义）==========
          
          // 构建引导消息，告诉 AI 直接调用工具
          const originalUserMessage = messages[messages.length - 1];
          const toolPrompt = buildToolCallPrompt(
            detectedTool, 
            originalUserMessage.content || ""
          );
          
          // 构建第二次请求的消息
          const secondMessages: OpenAIChatMessage[] = [
            ...messages,
            {
              role: "assistant",
              content: state.firstResponse
            },
            {
              role: "user",
              content: toolPrompt
            }
          ];
          
          // 发起第二次请求，只包含需要的工具定义
          for await (const secondChunk of streamChatCompletion({
            ...streamOptions,
            messages: secondMessages,
            tools: [toolDef] // 只包含一个工具！
          })) {
            yield { ...secondChunk, lazyState: state };
            
            if (secondChunk.type === "done") {
              state.stage = "completed";
            }
          }
          
          return;
        }
      }
      
      // 没有检测到工具意图，正常结束
      state.stage = "completed";
      yield { ...chunk, lazyState: state };
    }
  }
}

/**
 * 将工具列表添加到系统提示词
 * 
 * @param systemPrompt 原始系统提示词
 * @param lazyOptions 延迟加载选项
 * @returns 增强后的系统提示词
 */
export function enhanceSystemPromptWithToolList(
  systemPrompt: string,
  lazyOptions: LazyLoadingOptions
): string {
  if (!lazyOptions.enabled) {
    return systemPrompt;
  }
  
  // 获取启用的工具列表
  const enabledTools = getEnabledToolsLazy(
    lazyOptions.webSearchEnabled ?? false,
    lazyOptions.imageSearchEnabled ?? false,
    lazyOptions.wikipediaEnabled ?? false,
    lazyOptions.currencyEnabled ?? false
  );
  
  // 构建工具列表提示词
  const toolListPrompt = buildToolListPrompt(enabledTools);
  
  // 将工具列表添加到系统提示词末尾
  return `${systemPrompt}\n\n${toolListPrompt}`;
}

/**
 * 混合策略：高频工具直接可用 + 低频工具延迟加载
 * 
 * @param lazyOptions 延迟加载选项
 * @returns 高频工具定义数组
 */
export function getHighFrequencyTools(lazyOptions: LazyLoadingOptions): OpenAITool[] {
  if (!lazyOptions.enabled) {
    return [];
  }
  
  // 定义高频工具列表（最常用的 3-5 个）
  const highFrequencyToolNames = [
    "searchBlocksByText",  // 最常用
    "getTodayJournal",      // 次常用
    "createBlock"           // 三常用
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

/**
 * 使用混合策略的流式对话
 * 高频工具直接可用，低频工具延迟加载
 */
export async function* streamChatWithHybridStrategy(
  messages: OpenAIChatMessage[],
  streamOptions: Omit<StreamOptions, "messages" | "tools">,
  lazyOptions: LazyLoadingOptions,
  onToolDetected?: (toolName: string) => void
): AsyncGenerator<StreamChunk & { lazyState?: LazyLoadingState }, void, unknown> {
  
  const state: LazyLoadingState = {
    stage: "initial"
  };

  if (!lazyOptions.enabled) {
    const aiTools = await import("./ai-tools");
    const tools = aiTools.getTools(lazyOptions.webSearchEnabled);
    
    yield* streamChatCompletion({
      ...streamOptions,
      messages,
      tools
    });
    return;
  }

  // 获取高频工具（直接可用）
  const highFreqTools = getHighFrequencyTools(lazyOptions);
  
  // 第一次请求包含高频工具
  let fullResponse = "";
  let toolCallDetected = false;
  
  for await (const chunk of streamChatCompletion({
    ...streamOptions,
    messages,
    tools: highFreqTools // 只包含高频工具
  })) {
    if (chunk.type === "content" && chunk.content) {
      fullResponse += chunk.content;
      yield { ...chunk, lazyState: state };
    } else if (chunk.type === "reasoning" && chunk.reasoning) {
      yield { ...chunk, lazyState: state };
    } else if (chunk.type === "tool_calls") {
      // AI 调用了高频工具，直接执行
      toolCallDetected = true;
      yield { ...chunk, lazyState: state };
    } else if (chunk.type === "done") {
      if (!toolCallDetected) {
        // 没有调用工具，检查是否有低频工具意图
        const detectedTool = detectToolIntent(chunk.result.content || "");
        
        if (detectedTool) {
          // 检测到低频工具意图
          state.stage = "tool_detected";
          state.detectedTool = detectedTool;
          state.firstResponse = chunk.result.content || "";
          
          if (onToolDetected) {
            onToolDetected(detectedTool);
          }
          
          // 获取低频工具定义
          const toolDef = getToolDefinition(detectedTool);
          
          if (toolDef) {
            state.stage = "tool_loaded";
            
            // 发起第二次请求
            const originalUserMessage = messages[messages.length - 1];
            const toolPrompt = buildToolCallPrompt(
              detectedTool, 
              originalUserMessage.content || ""
            );
            
            const secondMessages: OpenAIChatMessage[] = [
              ...messages,
              {
                role: "assistant",
                content: state.firstResponse
              },
              {
                role: "user",
                content: toolPrompt
              }
            ];
            
            for await (const secondChunk of streamChatCompletion({
              ...streamOptions,
              messages: secondMessages,
              tools: [toolDef]
            })) {
              yield { ...secondChunk, lazyState: state };
              
              if (secondChunk.type === "done") {
                state.stage = "completed";
              }
            }
            
            return;
          }
        }
      }
      
      state.stage = "completed";
      yield { ...chunk, lazyState: state };
    }
  }
}
