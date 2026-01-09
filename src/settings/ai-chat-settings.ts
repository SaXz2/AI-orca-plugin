// 系统提示词（硬编码，支持模板变量如 {maxToolRounds}）
export const DEFAULT_SYSTEM_PROMPT = `你是笔记库智能助手。

## 回复原则
- 结论先行，再展开
- 一段一事，不混杂
- 短句优先，不废话
- 用户理性有判断力，不需要被哄

## 工具使用
- 工具返回"✅ Search complete"后立即展示结果，不再调用其他工具
- 搜索结果已含完整内容，禁止对其调用 getPage
- 一次成功即停止，避免重复查询
- 属性查询：先 get_tag_schema 获取定义 → 再 query_blocks_by_tag 过滤
- 无结果时尝试替代方案（最多 {maxToolRounds} 轮）：标签变体 → 搜索降级 → 条件放宽
- 总结今天用 getTodayJournal，总结近期用 getRecentJournals

## 写入操作
- 仅在用户明确要求「创建/添加/写入」时才写入
- 缺少必要信息时先询问，不猜测
- createBlock 成功后立即停止，禁止重复创建

## 真实性（红线）
- 只引用工具实际返回的内容，绝对禁止编造
- 无结果就说"没有找到"，不脑补
- 明确区分"笔记库内容"和"AI 一般知识"

## 引用格式
- **句中提及**：[标题](orca-block:id) — 作为句子一部分
- **句末来源**：直接写 orca-block:数字 — 渲染为彩色圆点
- ❌ 绝对禁止：[1]、[2]、^1、^2 等脚注格式，这些毫无意义

## 特殊格式
- 时间线事件用 \`\`\`timeline 代码块
- 图片用 ![描述](url)，url 必须从工具返回中复制
- **imageSearch 返回后必须插入图片**：用 ![描述](url) 格式，否则用户看不到图

## 限制
- 不支持修改/删除笔记，仅支持创建
- 最大返回 50 条结果
`;

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

/** 模型能力类型 */
export type ModelCapability = "vision" | "web" | "reasoning" | "tools" | "rerank" | "embedding";

/** 模型能力标签配置 */
export const MODEL_CAPABILITY_LABELS: Record<ModelCapability, { label: string; icon: string; color: string }> = {
  vision: { label: "视觉", icon: "ti ti-eye", color: "#8b5cf6" },
  web: { label: "联网", icon: "ti ti-world", color: "#06b6d4" },
  reasoning: { label: "推理", icon: "ti ti-brain", color: "#f59e0b" },
  tools: { label: "工具", icon: "ti ti-tool", color: "#10b981" },
  rerank: { label: "重排", icon: "ti ti-arrows-sort", color: "#ec4899" },
  embedding: { label: "嵌入", icon: "ti ti-vector", color: "#6366f1" },
};

/** 平台下的模型配置 */
export type ProviderModel = {
  id: string;              // 模型 ID（如 gpt-4o）
  label?: string;          // 显示名称（可选）
  inputPrice?: number;     // 输入价格 $/M tokens
  outputPrice?: number;    // 输出价格 $/M tokens
  capabilities?: ModelCapability[];
  // 模型级别的设置
  temperature?: number;    // 温度（0-2）
  maxTokens?: number;      // 最大输出 token
  maxToolRounds?: number;  // 工具调用最大轮数
  currency?: CurrencyType; // 价格币种
};

/** AI 平台/提供商配置 */
export type AiProvider = {
  id: string;              // 平台唯一 ID
  name: string;            // 平台显示名称
  apiUrl: string;          // API 地址
  apiKey: string;          // API 密钥
  models: ProviderModel[]; // 该平台下的模型列表
  enabled: boolean;        // 是否启用
  isBuiltin?: boolean;     // 是否为内置平台（不可删除）
};

export type CurrencyType = "USD" | "CNY" | "EUR" | "JPY";

export const CURRENCY_SYMBOLS: Record<CurrencyType, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  JPY: "¥",
};

/** 搜索引擎类型 */
export type SearchProvider = "tavily" | "bing" | "duckduckgo" | "brave" | "searxng" | "google" | "serpapi";

/** 单个搜索引擎实例配置 */
export type SearchProviderInstance = {
  id: string;              // 唯一标识
  provider: SearchProvider;
  enabled: boolean;        // 是否启用
  name?: string;           // 自定义名称（如 "Tavily 主账号"）
  // Tavily
  tavilyApiKey?: string;
  tavilySearchDepth?: "basic" | "advanced";
  tavilyIncludeAnswer?: boolean;
  tavilyIncludeDomains?: string[];
  tavilyExcludeDomains?: string[];
  // Bing
  bingApiKey?: string;
  bingMarket?: string;
  // DuckDuckGo
  duckduckgoRegion?: string;
  // Brave
  braveApiKey?: string;
  braveCountry?: string;
  braveSearchLang?: string;
  braveSafeSearch?: "off" | "moderate" | "strict";  // 图片搜索安全级别
  // SearXNG
  searxngInstanceUrl?: string;
  searxngLanguage?: string;
  searxngSafeSearch?: 0 | 1 | 2;  // 图片搜索安全级别
  // Google Custom Search
  googleApiKey?: string;           // Google Cloud API Key
  googleSearchEngineId?: string;   // Programmable Search Engine ID (cx)
  googleGl?: string;               // 国家代码，如 "cn", "us"
  googleHl?: string;               // 界面语言，如 "zh-CN", "en"
  googleLr?: string;               // 搜索结果语言，如 "lang_zh-CN"
  googleSafe?: "off" | "active";   // 安全搜索
  // SerpApi (Google Images)
  serpapiApiKey?: string;
  serpapiGl?: string;              // 国家代码
  serpapiHl?: string;              // 语言
};

/** 联网搜索配置 - 支持多引擎故障转移 */
export type WebSearchConfig = {
  enabled: boolean;
  maxResults: number;
  // 搜索引擎实例列表（按优先级排序，第一个失败自动尝试下一个）
  instances: SearchProviderInstance[];
  // 图像搜索配置
  imageSearchEnabled: boolean;
  maxImageResults: number;
  // 兼容旧版单引擎配置
  provider?: SearchProvider;
  tavilyApiKey?: string;
  tavilySearchDepth?: "basic" | "advanced";
  tavilyIncludeAnswer?: boolean;
  tavilyIncludeDomains?: string[];
  tavilyExcludeDomains?: string[];
  serperApiKey?: string;
  serperCountry?: string;
  serperLanguage?: string;
  bingApiKey?: string;
  bingMarket?: string;
  duckduckgoRegion?: string;
};

/** 新的设置结构 */
export type AiChatSettings = {
  providers: AiProvider[];           // 平台列表
  selectedProviderId: string;        // 当前选中的平台 ID
  selectedModelId: string;           // 当前选中的模型 ID
  // 以下为全局默认值，模型可以覆盖
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  currency: CurrencyType;
  // Token 优化设置
  maxHistoryMessages: number;        // 最大历史消息数（0=不限制）
  maxToolResultChars: number;        // 工具结果最大字符数（0=不限制）
  maxContextChars: number;           // 上下文最大字符数
  // 动态压缩设置
  enableCompression: boolean;        // 是否启用压缩
  compressAfterMessages: number;     // 超过多少条后开始压缩旧消息（5-20）
  // 联网搜索设置
  webSearch: WebSearchConfig;
  // 兼容旧版本的字段（迁移用）
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  customModel?: string;
  customModels?: any[];
};

// ═══════════════════════════════════════════════════════════════════════════
// 默认平台配置
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PROVIDERS: AiProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
    enabled: true,
    isBuiltin: true,
    models: [
      { id: "gpt-4o", label: "GPT-4o", inputPrice: 2.5, outputPrice: 10, capabilities: ["vision", "tools"], temperature: 0.7, maxTokens: 4096, maxToolRounds: 5, currency: "USD" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", inputPrice: 0.15, outputPrice: 0.6, capabilities: ["vision", "tools"], temperature: 0.7, maxTokens: 4096, maxToolRounds: 5, currency: "USD" },
      { id: "o1", label: "o1", inputPrice: 15, outputPrice: 60, capabilities: ["reasoning"], temperature: 1, maxTokens: 8192, maxToolRounds: 3, currency: "USD" },
      { id: "o1-mini", label: "o1 Mini", inputPrice: 3, outputPrice: 12, capabilities: ["reasoning"], temperature: 1, maxTokens: 8192, maxToolRounds: 3, currency: "USD" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    enabled: true,
    isBuiltin: true,
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", inputPrice: 0.14, outputPrice: 0.28, capabilities: ["tools"], temperature: 0.7, maxTokens: 4096, maxToolRounds: 5, currency: "USD" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", inputPrice: 0.55, outputPrice: 2.19, capabilities: ["reasoning"], temperature: 1, maxTokens: 8192, maxToolRounds: 3, currency: "USD" },
    ],
  },
];

export const DEFAULT_AI_CHAT_SETTINGS: AiChatSettings = {
  providers: DEFAULT_PROVIDERS,
  selectedProviderId: "openai",
  selectedModelId: "gpt-4o-mini",
  // 全局默认值（模型未设置时使用）
  temperature: 0.7,
  maxTokens: 4096,
  maxToolRounds: 5,
  currency: "USD",
  // Token 优化默认值
  maxHistoryMessages: 0,           // 0=不限制（改用动态压缩）
  maxToolResultChars: 0,           // 0=不限制
  maxContextChars: 60000,          // 恢复原来的 60000
  // 动态压缩设置
  enableCompression: true,         // 默认启用压缩
  compressAfterMessages: 10,       // 超过 10 条后开始压缩旧消息
  // 联网搜索设置
  webSearch: {
    enabled: false,
    maxResults: 5,
    instances: [], // 用户添加的搜索引擎实例
    imageSearchEnabled: true, // 默认启用图像搜索
    maxImageResults: 3, // 默认最多3张图片
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// 设置 Schema 注册
// ═══════════════════════════════════════════════════════════════════════════

const PROVIDERS_STORAGE_KEY = "ai-providers-config";

export async function registerAiChatSettingsSchema(
  pluginName: string,
): Promise<void> {
  // systemPrompt 已硬编码，不再暴露给用户配置
  await orca.plugins.setSettingsSchema(pluginName, {});
}

// ═══════════════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════════════

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  return fallback;
}

function toCurrency(value: unknown, fallback: CurrencyType): CurrencyType {
  if (value === "USD" || value === "CNY" || value === "EUR" || value === "JPY") {
    return value;
  }
  return fallback;
}

// ═══════════════════════════════════════════════════════════════════════════
// 获取和更新设置
// ═══════════════════════════════════════════════════════════════════════════

/** 存储的配置数据结构 */
type StoredConfig = {
  providers: AiProvider[];
  selectedProviderId: string;
  selectedModelId: string;
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  currency: CurrencyType;
  // Token 优化设置
  maxHistoryMessages?: number;
  maxToolResultChars?: number;
  maxContextChars?: number;
  enableCompression?: boolean;
  compressAfterMessages?: number;
  // 联网搜索设置
  webSearch?: WebSearchConfig;
};

// 内存缓存（避免频繁读取）
let cachedConfig: StoredConfig | null = null;
let cachePluginName: string | null = null;

/** 从存储加载配置 */
async function loadStoredConfig(pluginName: string): Promise<StoredConfig | null> {
  try {
    const raw = await orca.plugins.getData(pluginName, PROVIDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch (e) {
  }
  return null;
}

/** 保存配置到存储 */
async function saveStoredConfig(pluginName: string, config: StoredConfig): Promise<void> {
  try {
    await orca.plugins.setData(pluginName, PROVIDERS_STORAGE_KEY, JSON.stringify(config));
    cachedConfig = config;
    cachePluginName = pluginName;
  } catch (e) {
    throw e;
  }
}

/** 同步获取设置（使用缓存，首次需要先调用 initAiChatSettings） */
export function getAiChatSettings(pluginName: string): AiChatSettings {
  const raw = (orca.state.plugins as any)?.[pluginName]?.settings ?? {};
  
  // 使用缓存的配置
  const config = (cachePluginName === pluginName && cachedConfig) ? cachedConfig : null;
  
  // 如果有缓存，使用缓存的 providers
  const providers = config?.providers || JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  
  // 兼容旧版迁移
  if (!config && raw.apiKey) {
    const openai = providers.find((p: AiProvider) => p.id === "openai");
    if (openai) {
      openai.apiKey = raw.apiKey;
      if (raw.apiUrl) openai.apiUrl = raw.apiUrl;
    }
  }
  
  const merged: AiChatSettings = {
    providers,
    selectedProviderId: config?.selectedProviderId || DEFAULT_AI_CHAT_SETTINGS.selectedProviderId,
    selectedModelId: config?.selectedModelId || DEFAULT_AI_CHAT_SETTINGS.selectedModelId,
    temperature: config?.temperature ?? DEFAULT_AI_CHAT_SETTINGS.temperature,
    maxTokens: config?.maxTokens ?? DEFAULT_AI_CHAT_SETTINGS.maxTokens,
    maxToolRounds: config?.maxToolRounds ?? DEFAULT_AI_CHAT_SETTINGS.maxToolRounds,
    currency: config?.currency ?? DEFAULT_AI_CHAT_SETTINGS.currency,
    // Token 优化设置
    maxHistoryMessages: config?.maxHistoryMessages ?? DEFAULT_AI_CHAT_SETTINGS.maxHistoryMessages,
    maxToolResultChars: config?.maxToolResultChars ?? DEFAULT_AI_CHAT_SETTINGS.maxToolResultChars,
    maxContextChars: config?.maxContextChars ?? DEFAULT_AI_CHAT_SETTINGS.maxContextChars,
    enableCompression: config?.enableCompression ?? DEFAULT_AI_CHAT_SETTINGS.enableCompression,
    compressAfterMessages: config?.compressAfterMessages ?? DEFAULT_AI_CHAT_SETTINGS.compressAfterMessages,
    // 联网搜索设置
    webSearch: config?.webSearch ?? DEFAULT_AI_CHAT_SETTINGS.webSearch,
  };

  merged.temperature = Math.max(0, Math.min(2, merged.temperature));
  merged.maxTokens = Math.max(1, Math.floor(merged.maxTokens));
  merged.maxToolRounds = Math.max(3, Math.min(10, Math.floor(merged.maxToolRounds)));
  // Token 优化设置范围限制
  merged.maxHistoryMessages = Math.max(0, Math.floor(merged.maxHistoryMessages));
  merged.maxToolResultChars = Math.max(0, Math.floor(merged.maxToolResultChars));
  merged.maxContextChars = Math.max(5000, Math.floor(merged.maxContextChars));
  merged.compressAfterMessages = Math.max(5, Math.min(20, Math.floor(merged.compressAfterMessages)));

  return merged;
}

/** 初始化设置（异步加载存储的配置） */
export async function initAiChatSettings(pluginName: string): Promise<void> {
  const config = await loadStoredConfig(pluginName);
  if (config) {
    cachedConfig = config;
    cachePluginName = pluginName;
  }
}

export async function updateAiChatSettings(
  to: "app" | "repo",
  pluginName: string,
  patch: Partial<AiChatSettings>,
): Promise<void> {
  const current = getAiChatSettings(pluginName);
  const next = { ...current, ...patch };
  
  // 构建存储配置
  const config: StoredConfig = {
    providers: next.providers,
    selectedProviderId: next.selectedProviderId,
    selectedModelId: next.selectedModelId,
    temperature: next.temperature,
    maxTokens: next.maxTokens,
    maxToolRounds: next.maxToolRounds,
    currency: next.currency,
    // Token 优化设置
    maxHistoryMessages: next.maxHistoryMessages,
    maxToolResultChars: next.maxToolResultChars,
    maxContextChars: next.maxContextChars,
    enableCompression: next.enableCompression,
    compressAfterMessages: next.compressAfterMessages,
    // 联网搜索设置
    webSearch: next.webSearch,
  };
  
  // 保存到 data 存储
  await saveStoredConfig(pluginName, config);
}

// ═══════════════════════════════════════════════════════════════════════════
// 平台和模型操作
// ═══════════════════════════════════════════════════════════════════════════

/** 获取当前选中的平台 */
export function getSelectedProvider(settings: AiChatSettings): AiProvider | undefined {
  return settings.providers.find(p => p.id === settings.selectedProviderId);
}

/** 获取当前选中的模型 */
export function getSelectedModel(settings: AiChatSettings): ProviderModel | undefined {
  const provider = getSelectedProvider(settings);
  return provider?.models.find(m => m.id === settings.selectedModelId);
}

/** 获取当前 API 配置 */
export function getCurrentApiConfig(settings: AiChatSettings): { apiUrl: string; apiKey: string; model: string } {
  const provider = getSelectedProvider(settings);
  return {
    apiUrl: provider?.apiUrl || "",
    apiKey: provider?.apiKey || "",
    model: settings.selectedModelId,
  };
}

/** 获取当前模型的完整配置（包括模型级别的设置，回退到全局默认值） */
export function getModelConfig(settings: AiChatSettings, modelId?: string): {
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  currency: CurrencyType;
  inputPrice: number;
  outputPrice: number;
} {
  const targetModelId = modelId || settings.selectedModelId;
  
  // 查找模型
  let model: ProviderModel | undefined;
  for (const provider of settings.providers) {
    model = provider.models.find(m => m.id === targetModelId);
    if (model) break;
  }
  
  return {
    temperature: model?.temperature ?? settings.temperature,
    maxTokens: model?.maxTokens ?? settings.maxTokens,
    maxToolRounds: model?.maxToolRounds ?? settings.maxToolRounds,
    currency: model?.currency ?? settings.currency,
    inputPrice: model?.inputPrice ?? 0,
    outputPrice: model?.outputPrice ?? 0,
  };
}

/** 验证当前配置是否完整 */
export function validateCurrentConfig(settings: AiChatSettings): string | null {
  const provider = getSelectedProvider(settings);
  if (!provider) return "请选择一个平台";
  if (!provider.apiUrl.trim()) return `请设置 ${provider.name} 的 API 地址`;
  if (!provider.apiKey.trim()) return `请设置 ${provider.name} 的 API 密钥`;
  if (!settings.selectedModelId.trim()) return "请选择一个模型";
  return null;
}

/** 创建新平台 */
export function createProvider(name: string): AiProvider {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || "新平台",
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
    enabled: true,
    models: [],
  };
}

/** 添加模型到平台 */
export function addModelToProvider(provider: AiProvider, modelId: string, label?: string): ProviderModel {
  const model: ProviderModel = {
    id: modelId,
    label: label || modelId,
  };
  provider.models.push(model);
  return model;
}

// ═══════════════════════════════════════════════════════════════════════════
// 兼容旧版 API（逐步废弃）
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated 使用 getCurrentApiConfig */
export function getModelApiConfig(
  settings: AiChatSettings,
  modelName: string,
): { apiUrl: string; apiKey: string } {
  // 查找包含该模型的平台
  for (const provider of settings.providers) {
    if (provider.models.find(m => m.id === modelName)) {
      return {
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey,
      };
    }
  }
  // 回退到当前选中的平台
  const current = getCurrentApiConfig(settings);
  return { apiUrl: current.apiUrl, apiKey: current.apiKey };
}

/** @deprecated 使用 validateCurrentConfig */
export function validateModelApiConfig(
  settings: AiChatSettings,
  modelName: string,
): string | null {
  const config = getModelApiConfig(settings, modelName);
  if (!config.apiUrl) return "Missing API URL";
  if (!config.apiKey) return "Missing API Key";
  if (!modelName.trim()) return "Missing model name";
  return null;
}

/** 构建模型选项列表（用于下拉菜单） */
export type AiModelOption = {
  value: string;
  label: string;
  group?: string;
  providerId?: string;
  apiUrl?: string;
  apiKey?: string;
  inputPrice?: number;
  outputPrice?: number;
  capabilities?: ModelCapability[];
};

export function buildAiModelOptions(settings: AiChatSettings): AiModelOption[] {
  const options: AiModelOption[] = [];
  
  for (const provider of settings.providers) {
    if (!provider.enabled) continue;
    
    for (const model of provider.models) {
      options.push({
        value: model.id,
        label: model.label || model.id,
        group: provider.name,
        providerId: provider.id,
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey,
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
        capabilities: model.capabilities,
      });
    }
  }
  
  return options;
}

/** @deprecated */
export function resolveAiModel(settings: AiChatSettings): string {
  return settings.selectedModelId;
}

/** @deprecated */
export function validateAiChatSettings(settings: AiChatSettings): string | null {
  return validateCurrentConfig(settings);
}

/** @deprecated */
export function validateAiChatSettingsWithModel(
  settings: AiChatSettings,
  modelOverride: string,
): string | null {
  const config = getModelApiConfig(settings, modelOverride);
  if (!config.apiUrl) return "Missing API URL";
  if (!config.apiKey) return "Missing API Key";
  if (!modelOverride.trim()) return "Missing model";
  return null;
}

// 兼容旧版类型
export type AiModelPreset = ProviderModel;
