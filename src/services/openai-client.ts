export type OpenAIChatRole = "system" | "user" | "assistant" | "tool";

export type OpenAIChatMessage = {
  role: OpenAIChatRole;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
};

export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
};

export type OpenAIChatStreamArgs = {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: OpenAITool[];
  protocol?: "openai" | "anthropic";
  anthropicApiPath?: string;
  /** 模型上下文长度限制（tokens），超出时自动截断 */
  maxContextTokens?: number;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

function getChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/chat/completions")) return trimmed;
  return joinUrl(trimmed, "/chat/completions");
}

function getChatCompletionsUrlCandidates(apiUrl: string): string[] {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/chat/completions")) return [trimmed];
  if (lower.endsWith("/v1")) return [joinUrl(trimmed, "/chat/completions")];
  // 兼容：很多 OpenAI 兼容网关要求 /v1 前缀
  return [joinUrl(trimmed, "/v1/chat/completions"), joinUrl(trimmed, "/chat/completions")];
}

function getAnthropicMessagesUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/messages")) return trimmed;
  if (lower.endsWith("/v1")) return joinUrl(trimmed, "/messages");
  return joinUrl(trimmed, "/v1/messages");
}

function getAnthropicMessagesUrlCandidates(apiUrl: string, anthropicApiPath?: string): string[] {
  const override = typeof anthropicApiPath === "string" ? anthropicApiPath.trim() : "";
  if (override) {
    if (/^https?:\/\//i.test(override)) return [override];
    return [joinUrl(apiUrl, override)];
  }

  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/messages")) return [trimmed];
  if (lower.endsWith("/v1")) return [joinUrl(trimmed, "/messages"), trimmed];
  // 兼容部分代理：baseUrl 可能已经包含了版本路径（不需要 /v1）
  // 额外回退：有些第三方把“baseUrl 本身”当作最终 messages 入口（不需要追加 /v1/messages）
  return [joinUrl(trimmed, "/v1/messages"), joinUrl(trimmed, "/messages"), trimmed];
}

async function readErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await res.json();
      
      // 详细日志：输出完整的错误响应
      console.error("[API Error] Full error response:", JSON.stringify(json, null, 2));
      
      const msg =
        json?.error?.message ??
        json?.message ??
        (typeof json === "string" ? json : null);
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return JSON.stringify(json);
    }
  } catch {}

  try {
    const text = await res.text();
    if (text.trim()) {
      console.error("[API Error] Text response:", text);
      return text.trim();
    }
  } catch {}

  return `HTTP ${res.status}`;
}

type StreamChunk = {
  type: "content" | "tool_calls" | "reasoning";
  content?: string;
  reasoning?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

function parseDataUrl(url: string): { mediaType: string; base64: string } | null {
  // 兼容带参数的 data URL，例如 data:image/png;name=xxx;base64,...
  const match = url.match(/^data:([^;,]+)(?:;[^,]+)*;base64,(.+)$/i);
  if (!match) return null;
  const mediaType = match[1].trim();
  const base64 = match[2].trim();
  if (!mediaType || !base64) return null;
  return { mediaType, base64 };
}

function openAIContentToAnthropicBlocks(content: any): any[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }

  if (Array.isArray(content)) {
    const blocks: any[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;

      if (part.type === "text" && typeof part.text === "string") {
        if (part.text) blocks.push({ type: "text", text: part.text });
        continue;
      }

      // OpenAI multimodal image part: { type: "image_url", image_url: { url } }
      if (part.type === "image_url" && typeof part.image_url?.url === "string") {
        const parsed = parseDataUrl(part.image_url.url);
        // Anthropic 仅支持 image/jpeg, image/png, image/gif, image/webp
        // 参考: https://docs.anthropic.com/en/docs/build-with-claude/vision#supported-image-formats
        const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        
        if (parsed && supportedTypes.includes(parsed.mediaType.toLowerCase())) {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: parsed.mediaType,
              data: parsed.base64,
            },
          });
        } else {
          // 不支持的格式或无法解析，降级为文本提示
          // 如果是 base64，截断显示
          const urlPreview = part.image_url.url.length > 100
            ? part.image_url.url.substring(0, 50) + "..."
            : part.image_url.url;
          blocks.push({ type: "text", text: `[image: ${urlPreview}]` });
        }
        continue;
      }

      // 视频/其它：Anthropic Messages 不支持 video_url，降级为文本
      if (part.type === "video_url" && typeof part.video_url?.url === "string") {
        blocks.push({ type: "text", text: `[video: ${part.video_url.url}]` });
        continue;
      }
    }
    return blocks;
  }

  return [];
}

function buildAnthropicMessagesFromOpenAI(
  openAiMessages: OpenAIChatMessage[],
): { system?: string; messages: Array<{ role: "user" | "assistant"; content: any[] }> } {
  const systemMessages = openAiMessages.filter((m) => m.role === "system");
  const system = systemMessages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n");

  const messages: Array<{ role: "user" | "assistant"; content: any[] }> = [];

  for (const m of openAiMessages) {
    if (m.role === "system") continue;

    // Tool result messages (OpenAI) => tool_result blocks (Anthropic) carried by user role.
    if (m.role === "tool") {
      const toolUseId = typeof (m as any).tool_call_id === "string" ? (m as any).tool_call_id : "";
      const contentText = typeof m.content === "string" ? m.content : "";

      if (!toolUseId) {
        // 无法关联 tool_use，降级为普通文本 user 消息
        const blocks = contentText ? [{ type: "text", text: contentText }] : [];
        if (blocks.length > 0) messages.push({ role: "user", content: blocks });
        continue;
      }

      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: contentText || "",
          },
        ],
      });
      continue;
    }

    if (m.role !== "user" && m.role !== "assistant") continue;

    const blocks = openAIContentToAnthropicBlocks(m.content);

    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      for (const tc of m.tool_calls) {
        const id = typeof tc?.id === "string" ? tc.id : "";
        const name = typeof tc?.function?.name === "string" ? tc.function.name : "";
        const args = typeof tc?.function?.arguments === "string" ? tc.function.arguments : "";

        let input: any = {};
        if (args && args.trim()) {
          try {
            input = JSON.parse(args);
          } catch {
            input = {};
          }
        }

        blocks.push({
          type: "tool_use",
          id: id || undefined,
          name,
          input,
        });
      }
    }

    // Anthropic 要求 content 非空；否则降级加一个空文本块
    const safeBlocks = blocks.length > 0 ? blocks : [{ type: "text", text: "" }];

    // 合并连续的相同角色消息
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === m.role) {
      lastMsg.content.push(...safeBlocks);
    } else {
      messages.push({ role: m.role, content: safeBlocks });
    }
  }

  return { system: system || undefined, messages };
}

function safeDeltaFromEvent(obj: any): StreamChunk {
  const errMsg = obj?.error?.message;
  if (typeof errMsg === "string" && errMsg.trim()) {
    throw new Error(errMsg.trim());
  }

  const delta = obj?.choices?.[0]?.delta;
  const choice = obj?.choices?.[0];

  // Check for tool calls in delta
  if (delta?.tool_calls) {
    return {
      type: "tool_calls",
      tool_calls: delta.tool_calls,
    };
  }

  // Check for reasoning content (DeepSeek/Claude/OpenAI thinking)
  // 尝试多种可能的字段名
  let reasoning =
    delta?.reasoning_content ||
    delta?.thinking ||
    delta?.reasoning ||
    choice?.reasoning_content ||
    choice?.thinking;
  
  // DeepSeek Reasoner 有时会返回重复字符，尝试去重
  if (typeof reasoning === "string" && reasoning) {
    // 检测并修复连续重复的字符模式（如 "我我喜喜欢欢" -> "我喜欢"）
    // 使用更宽松的检测：如果超过 50% 的字符是连续重复的，就进行去重
    const originalLength = reasoning.length;
    const deduped = reasoning.replace(/(.)\1/g, '$1');
    const removedCount = originalLength - deduped.length;
    // 如果去除的重复字符超过原长度的 40%，说明确实有大量重复
    if (originalLength > 4 && removedCount > originalLength * 0.4) {
      reasoning = deduped;
    }
    
    return {
      type: "reasoning",
      reasoning,
    };
  }

  // Check for content in delta
  if (delta && typeof delta.content === "string") {
    return {
      type: "content",
      content: delta.content,
    };
  }

  // Check message (non-streaming response)
  const msg = obj?.choices?.[0]?.message;
  if (msg) {
    if (msg.tool_calls) {
      return {
        type: "tool_calls",
        tool_calls: msg.tool_calls,
      };
    }
    // Check reasoning in non-streaming message
    const msgReasoning = msg.reasoning_content || msg.thinking;
    if (typeof msgReasoning === "string" && msgReasoning) {
      return {
        type: "reasoning",
        reasoning: msgReasoning,
      };
    }
    if (typeof msg.content === "string") {
      return {
        type: "content",
        content: msg.content,
      };
    }
  }

  // Legacy text field
  if (typeof obj?.text === "string") {
    return {
      type: "content",
      content: obj.text,
    };
  }

  return {
    type: "content",
    content: "",
  };
}

function safeAnthropicDeltaFromEvent(obj: any): StreamChunk {
  const error = obj?.error;
  if (error?.message && typeof error.message === "string") {
    throw new Error(error.message);
  }

  // Anthropic streaming events
  // https://docs.anthropic.com/en/api/messages-streaming
  if (obj?.type === "content_block_delta") {
    const text = obj?.delta?.text;
    if (typeof text === "string" && text) {
      return { type: "content", content: text };
    }
  }

  // Some proxies may send plain message object
  if (Array.isArray(obj?.content)) {
    const text = obj.content
      .map((b: any) => (b?.type === "text" ? b?.text : ""))
      .filter((t: any) => typeof t === "string" && t)
      .join("");
    return { type: "content", content: text || "" };
  }

  return { type: "content", content: "" };
}

function extractAnthropicText(json: any): string {
  if (!json) return "";
  if (Array.isArray(json.content)) {
    return json.content
      .map((b: any) => (b?.type === "text" ? b?.text : ""))
      .filter((t: any) => typeof t === "string")
      .join("");
  }
  return "";
}

function extractAnthropicToolCalls(json: any): StreamChunk["tool_calls"] {
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const toolUses = blocks.filter((b: any) => b?.type === "tool_use");
  if (toolUses.length === 0) return undefined;
  return toolUses.map((b: any, i: number) => {
    const id = typeof b?.id === "string" && b.id ? b.id : `tool_call_${i}`;
    const name = typeof b?.name === "string" ? b.name : "";
    const input = b?.input ?? {};
    return {
      id,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(input),
      },
    };
  });
}

/**
 * 估算内容的 token 数（简单方法：字符数/3.5 for 中文，/4 for 英文）
 * base64 图片大约每 3 字符 = 1 token
 */
function estimateTokens(content: any): number {
  if (!content) return 0;
  if (typeof content === "string") {
    // 检测是否是 base64 图片数据
    if (content.startsWith("data:image")) {
      // base64 图片：大约每 3 个字符 = 1 token
      return Math.ceil(content.length / 3);
    }
    // 普通文本：中英文混合，用 3.5 作为平均值
    return Math.ceil(content.length / 3.5);
  }
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (part?.type === "text") return sum + estimateTokens(part.text);
      if (part?.type === "image_url") return sum + estimateTokens(part.image_url?.url);
      return sum + estimateTokens(JSON.stringify(part));
    }, 0);
  }
  return Math.ceil(JSON.stringify(content).length / 4);
}

/**
 * 估算消息数组的总 token 数
 */
function estimateMessagesTokens(messages: OpenAIChatMessage[]): number {
  return messages.reduce((sum, msg) => {
    // 每条消息有约 4 token 的开销
    return sum + 4 + estimateTokens(msg.content);
  }, 0);
}

/**
 * 估算工具定义的 token 数
 */
function estimateToolsTokens(tools: OpenAITool[]): number {
  if (!tools || tools.length === 0) return 0;
  return tools.reduce((sum, tool) => {
    const desc = tool.function.description || "";
    const params = JSON.stringify(tool.function.parameters || {});
    return sum + estimateTokens(tool.function.name) + estimateTokens(desc) + estimateTokens(params);
  }, 0);
}

/**
 * 移除消息中的图片，替换为文本提示
 */
function stripImagesFromMessages(messages: OpenAIChatMessage[]): OpenAIChatMessage[] {
  return messages.map(msg => {
    if (!msg.content || typeof msg.content === "string") return msg;
    // OpenAI multimodal messages can have array content
    const contentArr = msg.content as any[];
    if (!Array.isArray(contentArr)) return msg;
    
    const newContent = contentArr.map((part: any) => {
      if (part?.type === "image_url") {
        return { type: "text", text: "[图片已移除以适应上下文限制]" };
      }
      return part;
    });
    
    return { ...msg, content: newContent as any };
  });
}

/**
 * 截断较早的消息以适应上下文限制
 */
function truncateOlderMessages(
  messages: OpenAIChatMessage[],
  targetTokens: number,
  currentTokens: number
): OpenAIChatMessage[] {
  if (currentTokens <= targetTokens) return messages;
  
  // 保留 system 消息和最近的消息
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");
  
  // 从最早的非系统消息开始移除
  let result = [...nonSystemMessages];
  let tokens = currentTokens;
  
  while (tokens > targetTokens && result.length > 2) {
    const removed = result.shift();
    if (removed) {
      tokens -= (4 + estimateTokens(removed.content));
    }
  }
  
  // 如果还是超出，添加摘要提示
  if (tokens > targetTokens && result.length > 0) {
    result = [{
      role: "user" as const,
      content: "[早期对话已被截断以适应上下文限制]"
    }, ...result.slice(-2)];
  }
  
  return [...systemMessages, ...result];
}

export async function* openAIChatCompletionsStream(
  args: OpenAIChatStreamArgs,
): AsyncGenerator<StreamChunk, void, unknown> {
  const protocol = args.protocol || "openai";
  const logPrefix = protocol === "anthropic" ? "[anthropic]" : "[openAI]";
  const urlCandidates =
    protocol === "anthropic"
      ? getAnthropicMessagesUrlCandidates(args.apiUrl, args.anthropicApiPath)
      : getChatCompletionsUrlCandidates(args.apiUrl);

  let requestBody: any;

  if (protocol === "anthropic") {
    // Anthropic messages format
    const built = buildAnthropicMessagesFromOpenAI(args.messages);

    requestBody = {
      model: args.model,
      messages: built.messages,
      system: built.system,
      max_tokens: args.maxTokens ?? 1024,
      temperature: args.temperature,
      stream: true,
    };
  } else {
    // OpenAI-compatible format
    requestBody = {
      model: args.model,
      messages: args.messages,
      temperature: args.temperature,
      max_tokens: args.maxTokens,
      stream: true,
      // 启用推理内容返回（DeepSeek/OpenAI-compatible APIs）
      stream_options: {
        include_usage: true,
      },
    };
  }

  // Debug: 检查 assistant 消息是否符合 DeepSeek 要求
  for (const msg of args.messages) {
    if (msg.role === "assistant") {
      const hasContent = msg.content !== null && msg.content !== undefined && 
        (typeof msg.content === 'string' ? msg.content.length > 0 : true);
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
      if (!hasContent && !hasToolCalls) {
        console.warn(`${logPrefix} Warning: assistant message has no content and no tool_calls:`, msg);
      }
    }
  }

  // Add tools (OpenAI-compatible vs Anthropic-compatible schemas)
  let toolsToUse = args.tools;
  if (toolsToUse && toolsToUse.length > 0) {
    if (protocol === "anthropic") {
      requestBody.tools = toolsToUse.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    } else {
      requestBody.tools = toolsToUse;
    }
  }

  // ========== 上下文溢出保护 ==========
  const maxContextTokens = args.maxContextTokens || 0;
  if (maxContextTokens > 0) {
    // 预留响应空间（max_tokens 或默认 2048）
    const reservedForResponse = args.maxTokens || 2048;
    const availableTokens = maxContextTokens - reservedForResponse;
    
    // 估算当前 token 数
    let messagesTokens = estimateMessagesTokens(requestBody.messages);
    let toolsTokens = toolsToUse ? estimateToolsTokens(toolsToUse) : 0;
    let totalTokens = messagesTokens + toolsTokens;
    
    console.log(`${logPrefix} Token 估算: messages=${messagesTokens}, tools=${toolsTokens}, total=${totalTokens}, limit=${availableTokens}`);
    
    // 如果超出限制，依次执行截断策略
    if (totalTokens > availableTokens) {
      console.warn(`${logPrefix} ⚠️ 上下文超出限制 (${totalTokens} > ${availableTokens})，开始自动调整...`);
      
      // 策略 1：移除图片
      const messagesWithoutImages = stripImagesFromMessages(requestBody.messages);
      const tokensAfterStripImages = estimateMessagesTokens(messagesWithoutImages);
      
      if (tokensAfterStripImages + toolsTokens <= availableTokens) {
        console.log(`${logPrefix} 策略 1 成功：移除图片后 tokens=${tokensAfterStripImages + toolsTokens}`);
        requestBody.messages = messagesWithoutImages;
        totalTokens = tokensAfterStripImages + toolsTokens;
      } else {
        // 图片已移除，继续下一策略
        requestBody.messages = messagesWithoutImages;
        messagesTokens = tokensAfterStripImages;
        totalTokens = messagesTokens + toolsTokens;
        
        // 策略 2：移除工具（如果 tools 占比很大）
        if (toolsTokens > availableTokens * 0.3 && toolsTokens > 500) {
          console.log(`${logPrefix} 策略 2：移除工具以节省 ${toolsTokens} tokens`);
          delete requestBody.tools;
          toolsToUse = undefined;
          toolsTokens = 0;
          totalTokens = messagesTokens;
        }
        
        // 策略 3：截断早期消息
        if (totalTokens > availableTokens) {
          console.log(`${logPrefix} 策略 3：截断早期消息...`);
          requestBody.messages = truncateOlderMessages(
            requestBody.messages,
            availableTokens - toolsTokens,
            messagesTokens
          );
          totalTokens = estimateMessagesTokens(requestBody.messages) + toolsTokens;
          console.log(`${logPrefix} 截断后 tokens=${totalTokens}`);
        }
      }
      
      console.log(`${logPrefix} ✅ 调整完成，最终 tokens=${totalTokens}`);
    }
  }

  // DEBUG: Log the full request body to help troubleshoot 400 errors
  console.log(`${logPrefix} Request URL:`, urlCandidates[0]);
  console.log(`${logPrefix} Request Body:`, JSON.stringify(requestBody, null, 2));
  
  // 验证请求体中的关键字段
  if (requestBody.tools && requestBody.tools.length > 0) {
    console.log(`${logPrefix} Tools count:`, requestBody.tools.length);
    requestBody.tools.forEach((tool: any, idx: number) => {
      const toolName = protocol === "anthropic" ? tool.name : tool.function?.name;
      console.log(`${logPrefix} Tool[${idx}]:`, toolName);
      
      // 检查工具名称是否符合规范（只能包含字母、数字、下划线和连字符）
      if (toolName && !/^[a-zA-Z0-9_-]+$/.test(toolName)) {
        console.error(`${logPrefix} ⚠️ Invalid tool name detected: "${toolName}" - must match pattern ^[a-zA-Z0-9_-]+$`);
      }
    });
  }

  const body = JSON.stringify(requestBody);
  let res: Response | null = null;
  for (let i = 0; i < urlCandidates.length; i++) {
    const url = urlCandidates[i];
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
          ...(protocol === "anthropic"
            ? {
                "x-api-key": args.apiKey,
                "anthropic-version": "2023-06-01",
                Authorization: `Bearer ${args.apiKey}`,
              }
            : { Authorization: `Bearer ${args.apiKey}` }),
        },
        body,
        signal: args.signal,
      });
    } catch (fetchErr: any) {
      console.error(`${logPrefix} Fetch error:`, fetchErr);
      throw fetchErr;
    }

    if (res.ok) break;
    if (res.status === 404 && i < urlCandidates.length - 1) {
      console.warn(`${logPrefix} 404 at ${url}, trying fallback...`);
      continue;
    }

    const msg = await readErrorMessage(res);
    console.error(`${logPrefix} ❌ Error response:`, {
      status: res.status,
      statusText: res.statusText,
      url: url,
      message: msg,
      headers: Object.fromEntries(res.headers.entries())
    });
    throw new Error(msg);
  }

  if (!res) throw new Error("Failed to fetch");

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

  if (!res.body || contentType.includes("application/json")) {
    const json = await res.json();
    if (protocol === "anthropic") {
      const toolCalls = extractAnthropicToolCalls(json);
      if (toolCalls?.length) {
        yield { type: "tool_calls", tool_calls: toolCalls };
      }
      const text = extractAnthropicText(json);
      if (text) {
        yield { type: "content", content: text };
      }
      return;
    }

    const chunk: StreamChunk = safeDeltaFromEvent(json);
    if (chunk.content || chunk.tool_calls || chunk.reasoning) yield chunk;
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const anthropicToolBlocks = new Map<number, { id: string; name: string }>();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      const line = rawLine.trim();
      if (!line) continue;
      if (!line.startsWith("data:")) continue;

      const data = line.slice("data:".length).trim();
      if (!data) continue;
      if (data === "[DONE]") return;

      let obj: any;
      try {
        obj = JSON.parse(data);
      } catch (parseErr) {
        console.warn(`${logPrefix} Failed to parse SSE data:`, data);
        continue;
      }

      if (protocol === "anthropic") {
        if (obj?.type === "error" && obj?.error?.message) {
          throw new Error(String(obj.error.message));
        }

        if (obj?.type === "content_block_start" && obj?.content_block?.type === "tool_use") {
          const index = typeof obj?.index === "number" ? obj.index : 0;
          const id = typeof obj?.content_block?.id === "string" && obj.content_block.id
            ? obj.content_block.id
            : `tool_call_${index}`;
          const name = typeof obj?.content_block?.name === "string" ? obj.content_block.name : "";
          anthropicToolBlocks.set(index, { id, name });

          const input = obj?.content_block?.input;
          const hasInput = input && typeof input === "object" && Object.keys(input).length > 0;
          if (hasInput) {
            yield {
              type: "tool_calls",
              tool_calls: [
                {
                  id,
                  type: "function",
                  function: { name, arguments: JSON.stringify(input) },
                },
              ],
            };
          } else {
            // Initialize empty args, so later input_json_delta can append safely.
            yield {
              type: "tool_calls",
              tool_calls: [
                {
                  id,
                  type: "function",
                  function: { name, arguments: "" },
                },
              ],
            };
          }
          continue;
        }

        if (obj?.type === "content_block_delta") {
          const deltaType = obj?.delta?.type;
          if (deltaType === "text_delta" && typeof obj?.delta?.text === "string" && obj.delta.text) {
            yield { type: "content", content: obj.delta.text };
            continue;
          }

          if (deltaType === "input_json_delta" && typeof obj?.delta?.partial_json === "string") {
            const index = typeof obj?.index === "number" ? obj.index : 0;
            const tool = anthropicToolBlocks.get(index) || { id: `tool_call_${index}`, name: "" };
            yield {
              type: "tool_calls",
              tool_calls: [
                {
                  id: tool.id,
                  type: "function",
                  function: { name: tool.name, arguments: obj.delta.partial_json },
                },
              ],
            };
            continue;
          }
        }

        if (obj?.type === "message_stop") {
          return;
        }

        const chunk = safeAnthropicDeltaFromEvent(obj);
        if (chunk.content || chunk.tool_calls || chunk.reasoning) yield chunk;
        continue;
      }

      const chunk = safeDeltaFromEvent(obj);
      if (chunk.content || chunk.tool_calls || chunk.reasoning) yield chunk;
    }
  }
}
