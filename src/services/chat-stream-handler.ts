/**
 * Chat Stream Handler Service
 *
 * Encapsulates streaming AI chat completions with automatic retry and fallback logic.
 */

import {
  openAIChatCompletionsStream,
  type OpenAIChatMessage,
  type OpenAITool,
} from "./openai-client";
import { nowId } from "../utils/text-utils";

// ═══════════════════════════════════════════════════════════════════════════
// Qwen3/Llama 风格 <tool_call> XML 标签适配层
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 解析 Qwen3/Llama 风格的 <tool_call> XML 标签
 * 输入: '<tool_call>\n{"name": "searchNotes", "arguments": {"query": "酒馆"}}\n</tool_call>'
 * 输出: [{ id, type, function: { name, arguments } }]
 */
export function parseXmlToolCalls(content: string): ToolCallInfo[] {
  const toolCalls: ToolCallInfo[] = [];
  
  // 匹配所有 <tool_call>...</tool_call> 块
  const toolCallRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match;
  let index = 0;
  
  while ((match = toolCallRegex.exec(content)) !== null) {
    const jsonStr = match[1].trim();
    try {
      const parsed = JSON.parse(jsonStr);
      const name = parsed.name || parsed.function?.name || "";
      // arguments 可能是对象或字符串
      let args = parsed.arguments ?? parsed.parameters ?? {};
      if (typeof args === "object") {
        args = JSON.stringify(args);
      }
      
      toolCalls.push({
        id: `xml_tool_call_${index++}`,
        type: "function",
        function: {
          name,
          arguments: args,
        },
      });
    } catch (e) {
      console.warn("[parseXmlToolCalls] Failed to parse tool call JSON:", jsonStr, e);
    }
  }
  
  return toolCalls;
}

/**
 * 检查内容是否包含 <tool_call> 标签
 */
export function hasXmlToolCalls(content: string): boolean {
  return /<tool_call>/.test(content);
}

/**
 * 从内容中移除 <tool_call> 块，返回纯文本内容
 */
export function stripXmlToolCalls(content: string): string {
  return content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
}

export interface StreamOptions {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: OpenAITool[];
  timeoutMs?: number;
  protocol?: "openai" | "anthropic";
  anthropicApiPath?: string;
  /** 模型上下文长度限制（tokens），超出时自动截断 */
  maxContextTokens?: number;
}

export interface StreamResult {
  content: string;
  toolCalls: ToolCallInfo[];
  reasoning?: string;
}

export interface ToolCallInfo {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type StreamChunk =
  | { type: "content"; content: string }
  | { type: "reasoning"; reasoning: string }
  | { type: "tool_calls"; toolCalls: ToolCallInfo[] }
  | { type: "done"; result: StreamResult };

/**
 * Merge incoming tool call chunks into the accumulator.
 * Streaming APIs may send tool calls in multiple chunks.
 */
export function mergeToolCalls(
  existing: ToolCallInfo[],
  incoming: any[]
): ToolCallInfo[] {
  const result = [...existing];
  for (let i = 0; i < incoming.length; i++) {
    const tc = incoming[i];
    
    // Strategy 1: Match by ID (standard OpenAI/Gemini behavior)
    let found: ToolCallInfo | undefined = undefined;
    if (tc.id !== null && tc.id !== undefined) {
      found = result.find((t) => t.id === tc.id);
    }
    
    // Strategy 2: Fallback to match by index (DeepSeek behavior)
    if (!found && typeof tc.index === "number") {
      found = result.find((t: any) => t.index === tc.index);
    }
    
    if (found) {
      // Append arguments incrementally, but detect if we're getting a new complete JSON object
      if (tc.function?.arguments) {
        const newArgs = tc.function.arguments;
        const existingArgs = found.function.arguments || "";
        
        // Check if the new arguments start with '{' and existing args end with '}'
        // This indicates a new complete JSON object, not a continuation
        const existingEndsComplete = existingArgs.trim().endsWith('}');
        const newStartsComplete = newArgs.trim().startsWith('{');
        
        if (existingEndsComplete && newStartsComplete && existingArgs.trim()) {
          // This is a new tool call with the same ID - don't merge, create new entry
          const newId = `${tc.id || found.id}_${result.length}`;
          const newToolCall: any = {
            id: newId,
            type: tc.type || "function",
            function: {
              name: tc.function?.name || found.function.name || "",
              arguments: newArgs,
            },
          };
          
          if (typeof tc.index === "number") {
            newToolCall.index = tc.index;
          }
          
          result.push(newToolCall);
          continue;
        }
        
        // Normal case: append arguments incrementally
        found.function.arguments = existingArgs + newArgs;
      }
      
      // Update name if it was empty before
      if (!found.function.name && tc.function?.name) {
        found.function.name = tc.function.name;
      }
      
      // Update type if it was empty before
      if ((!found.type || found.type === "function") && tc.type) {
        found.type = tc.type as "function";
      }
    } else {
      // Create new tool call
      const newId = tc.id || (typeof tc.index === "number" ? `tool_call_${tc.index}` : nowId());
      const newToolCall: any = {
        id: newId,
        type: tc.type || "function",
        function: {
          name: tc.function?.name || "",
          arguments: tc.function?.arguments || "",
        },
      };
      
      if (typeof tc.index === "number") {
        newToolCall.index = tc.index;
      }
      
      result.push(newToolCall);
    }
  }
  
  return result;
}

/**
 * Stream chat completions from the API.
 * Yields chunks as they arrive for real-time UI updates.
 */
export async function* streamChatCompletion(
  options: StreamOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  let content = "";
  let reasoning = "";
  let toolCalls: ToolCallInfo[] = [];

  for await (const chunk of openAIChatCompletionsStream({
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    signal: options.signal,
    tools: options.tools,
    protocol: options.protocol,
    anthropicApiPath: options.anthropicApiPath,
    maxContextTokens: options.maxContextTokens,
  })) {
    if (chunk.type === "content" && chunk.content) {
      content += chunk.content;
      yield { type: "content", content: chunk.content };
    } else if (chunk.type === "reasoning" && chunk.reasoning) {
      reasoning += chunk.reasoning;
      yield { type: "reasoning", reasoning: chunk.reasoning };
    } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
      toolCalls = mergeToolCalls(toolCalls, chunk.tool_calls);
      yield { type: "tool_calls", toolCalls };
    }
  }

  yield { type: "done", result: { content, toolCalls, reasoning: reasoning || undefined } };
}

/**
 * Stream chat with automatic retry using fallback message format.
 *
 * @param options - Base streaming options
 * @param standardMessages - Standard OpenAI format messages
 * @param fallbackMessages - Fallback format for incompatible APIs
 * @param onRetry - Callback when retry is triggered
 */
export async function* streamChatWithRetry(
  options: Omit<StreamOptions, "messages">,
  standardMessages: OpenAIChatMessage[],
  fallbackMessages: OpenAIChatMessage[],
  onRetry?: () => void
): AsyncGenerator<StreamChunk, void, unknown> {
  const timeoutMs = options.timeoutMs ?? 30000;
  let content = "";
  let reasoning = "";
  let toolCalls: ToolCallInfo[] = [];
  let usedFallback = false;

  const doStream = async function* (
    messages: OpenAIChatMessage[]
  ): AsyncGenerator<StreamChunk, void, unknown> {
    // Create a combined abort controller that responds to both user abort and timeout
    const timeoutController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    // Helper to reset/start the timeout timer
    const resetTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutController.abort();
      }, timeoutMs);
    };
    
    // Start initial timeout
    resetTimeout();
    
    // If user's signal is already aborted, abort immediately
    if (options.signal?.aborted) {
      if (timeoutId) clearTimeout(timeoutId);
      throw new DOMException("Aborted", "AbortError");
    }
    
    // Link user's abort signal to our timeout controller
    const onUserAbort = () => timeoutController.abort();
    options.signal?.addEventListener("abort", onUserAbort);

    try {
      for await (const chunk of openAIChatCompletionsStream({
        apiUrl: options.apiUrl,
        apiKey: options.apiKey,
        model: options.model,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        signal: timeoutController.signal,
        tools: options.tools,
        protocol: options.protocol,
        anthropicApiPath: options.anthropicApiPath,
        maxContextTokens: options.maxContextTokens,
      })) {
        // Reset timeout on each chunk received (prevents timeout during slow responses)
        resetTimeout();

        if (chunk.type === "content" && chunk.content) {
          content += chunk.content;
          yield { type: "content", content: chunk.content };
        } else if (chunk.type === "reasoning" && chunk.reasoning) {
          reasoning += chunk.reasoning;
          yield { type: "reasoning", reasoning: chunk.reasoning };
        } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
          toolCalls = mergeToolCalls(toolCalls, chunk.tool_calls);
          yield { type: "tool_calls", toolCalls };
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onUserAbort);
    }
  };

  try {
    yield* doStream(standardMessages);
  } catch (err: any) {
    const isAbort = String(err?.name) === "AbortError";
    if (isAbort) throw err;

        usedFallback = true;
    content = "";
    reasoning = ""; // 重置 reasoning
    toolCalls = [];
    onRetry?.();

    yield* doStream(fallbackMessages);
  }

  // Only retry with fallback if response is truly empty (no content AND no tool calls)
  // Tool calls with empty content is a valid response - don't retry in that case
  if (!usedFallback && content.trim().length === 0 && toolCalls.length === 0) {
    usedFallback = true;
    content = "";
    reasoning = ""; // 重置 reasoning
    onRetry?.();

    try {
      yield* doStream(fallbackMessages);
    } catch (fallbackErr: any) {
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Qwen3/Llama 适配: 检查 content 中是否包含 <tool_call> XML 标签
  // 如果模型不支持原生 tool_calls 格式，会把调用写在 content 里
  // ═══════════════════════════════════════════════════════════════════════════
  if (toolCalls.length === 0 && hasXmlToolCalls(content)) {
    console.log("[streamChatWithRetry] Detected <tool_call> XML in content, parsing...");
    const xmlToolCalls = parseXmlToolCalls(content);
    if (xmlToolCalls.length > 0) {
      toolCalls = xmlToolCalls;
      // 从 content 中移除 tool_call 块，保留其他文本
      content = stripXmlToolCalls(content);
      // 通知调用方有 tool_calls
      yield { type: "tool_calls", toolCalls };
    }
  }

  yield { type: "done", result: { content, toolCalls, reasoning: reasoning || undefined } };
}
