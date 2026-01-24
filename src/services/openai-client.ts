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
  if (args.tools && args.tools.length > 0) {
    if (protocol === "anthropic") {
      requestBody.tools = args.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    } else {
      requestBody.tools = args.tools;
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
