/**
 * Web Search Service
 * 支持多个搜索引擎：Tavily, Serper, Bing, DuckDuckGo, Brave, SearXNG, You.com
 */

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  answer?: string;
  responseTime?: number;
  provider: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 搜索引擎类型定义
// ═══════════════════════════════════════════════════════════════════════════

export type SearchProvider = "tavily" | "serper" | "bing" | "duckduckgo" | "brave" | "searxng" | "you";

export interface TavilyConfig {
  apiKey: string;
  searchDepth?: "basic" | "advanced";
  includeAnswer?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface SerperConfig {
  apiKey: string;
  gl?: string;  // 国家代码，如 "cn", "us"
  hl?: string;  // 语言代码，如 "zh-cn", "en"
}

export interface BingConfig {
  apiKey: string;
  mkt?: string;  // 市场，如 "zh-CN", "en-US"
}

export interface DuckDuckGoConfig {
  // DuckDuckGo 不需要 API Key
  region?: string;  // 区域，如 "cn-zh", "us-en"
}

export interface BraveConfig {
  apiKey: string;
  country?: string;  // 国家代码，如 "CN", "US"
  searchLang?: string;  // 搜索语言，如 "zh-hans", "en"
}

export interface SearXNGConfig {
  // SearXNG 不需要 API Key，使用公共实例
  instanceUrl?: string;  // 实例 URL，默认使用公共实例
  language?: string;  // 语言，如 "zh-CN", "en"
}

export interface YouConfig {
  apiKey: string;
}

export interface SearchConfig {
  provider: SearchProvider;
  maxResults?: number;
  tavily?: TavilyConfig;
  serper?: SerperConfig;
  bing?: BingConfig;
  duckduckgo?: DuckDuckGoConfig;
  brave?: BraveConfig;
  searxng?: SearXNGConfig;
  you?: YouConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tavily API
// ═══════════════════════════════════════════════════════════════════════════

const TAVILY_API_URL = "https://api.tavily.com/search";

async function searchTavily(query: string, maxResults: number, config: TavilyConfig): Promise<SearchResponse> {
  const {
    apiKey,
    searchDepth = "basic",
    includeAnswer = true,
    includeDomains,
    excludeDomains,
  } = config;

  if (!apiKey) {
    throw new Error("Tavily API Key 未配置");
  }

  const requestBody: Record<string, any> = {
    api_key: apiKey,
    query,
    search_depth: searchDepth,
    max_results: maxResults,
    include_answer: includeAnswer,
  };

  if (includeDomains?.length) {
    requestBody.include_domains = includeDomains;
  }
  if (excludeDomains?.length) {
    requestBody.exclude_domains = excludeDomains;
  }

  const startTime = Date.now();
  const response = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Tavily API Key 无效");
    if (response.status === 429) throw new Error("Tavily API 调用次数已达上限");
    throw new Error(`Tavily API 错误: ${response.status}`);
  }

  const data = await response.json();
  return {
    query,
    provider: "Tavily",
    results: (data.results || []).map((r: any) => ({
      title: r.title || "",
      url: r.url || "",
      content: r.content || "",
      score: r.score,
      publishedDate: r.published_date,
    })),
    answer: data.answer,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Serper API (Google Search)
// ═══════════════════════════════════════════════════════════════════════════

const SERPER_API_URL = "https://google.serper.dev/search";

async function searchSerper(query: string, maxResults: number, config: SerperConfig): Promise<SearchResponse> {
  const { apiKey, gl = "us", hl = "en" } = config;

  if (!apiKey) {
    throw new Error("Serper API Key 未配置");
  }

  const startTime = Date.now();
  const response = await fetch(SERPER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      q: query,
      gl,
      hl,
      num: maxResults,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Serper API Key 无效");
    if (response.status === 429) throw new Error("Serper API 调用次数已达上限");
    throw new Error(`Serper API 错误: ${response.status}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  // 处理 organic 结果
  if (data.organic) {
    for (const r of data.organic.slice(0, maxResults)) {
      results.push({
        title: r.title || "",
        url: r.link || "",
        content: r.snippet || "",
      });
    }
  }

  // 如果有 answerBox，作为答案
  let answer: string | undefined;
  if (data.answerBox?.answer) {
    answer = data.answerBox.answer;
  } else if (data.answerBox?.snippet) {
    answer = data.answerBox.snippet;
  }

  return {
    query,
    provider: "Serper (Google)",
    results,
    answer,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Bing Search API
// ═══════════════════════════════════════════════════════════════════════════

const BING_API_URL = "https://api.bing.microsoft.com/v7.0/search";

async function searchBing(query: string, maxResults: number, config: BingConfig): Promise<SearchResponse> {
  const { apiKey, mkt = "en-US" } = config;

  if (!apiKey) {
    throw new Error("Bing API Key 未配置");
  }

  const startTime = Date.now();
  const url = new URL(BING_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  url.searchParams.set("mkt", mkt);

  const response = await fetch(url.toString(), {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Bing API Key 无效");
    if (response.status === 429) throw new Error("Bing API 调用次数已达上限");
    throw new Error(`Bing API 错误: ${response.status}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  if (data.webPages?.value) {
    for (const r of data.webPages.value.slice(0, maxResults)) {
      results.push({
        title: r.name || "",
        url: r.url || "",
        content: r.snippet || "",
        publishedDate: r.dateLastCrawled,
      });
    }
  }

  return {
    query,
    provider: "Bing",
    results,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DuckDuckGo (免费，无需 API Key)
// 使用 DuckDuckGo HTML 搜索接口
// ═══════════════════════════════════════════════════════════════════════════

async function searchDuckDuckGo(
  query: string,
  maxResults: number,
  config: DuckDuckGoConfig
): Promise<SearchResponse> {
  const { region = "wt-wt" } = config;
  const startTime = Date.now();

  // 使用 DuckDuckGo HTML lite 版本，更容易解析
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  url.searchParams.set("kl", region);

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo 搜索失败: ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // 解析 HTML 结果
  // DuckDuckGo HTML 版本的结果格式: <a class="result__a" href="...">title</a>
  // 和 <a class="result__snippet">snippet</a>
  const resultRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/gi;

  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    let url = match[1];
    const title = decodeHTMLEntities(match[2].trim());
    const snippet = decodeHTMLEntities(match[3].trim());

    // DuckDuckGo 的链接是重定向链接，需要提取真实 URL
    // 格式: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com...
    if (url.includes("uddg=")) {
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        url = decodeURIComponent(uddgMatch[1]);
      }
    }

    if (title && url && url.startsWith("http")) {
      results.push({
        title,
        url,
        content: snippet || title,
      });
    }
  }

  // 如果正则没匹配到，尝试备用解析
  if (results.length === 0) {
    // 尝试匹配更宽松的模式
    const linkRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
      let url = match[1];
      const title = decodeHTMLEntities(match[2].replace(/<[^>]*>/g, "").trim());

      if (url.includes("uddg=")) {
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          url = decodeURIComponent(uddgMatch[1]);
        }
      }

      if (title && url && url.startsWith("http")) {
        results.push({
          title,
          url,
          content: title,
        });
      }
    }
  }

  return {
    query,
    provider: "DuckDuckGo",
    results,
    responseTime: Date.now() - startTime,
  };
}

// HTML 实体解码
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };
  return text.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
}

// ═══════════════════════════════════════════════════════════════════════════
// Brave Search API
// ═══════════════════════════════════════════════════════════════════════════

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";

async function searchBrave(
  query: string,
  maxResults: number,
  config: BraveConfig
): Promise<SearchResponse> {
  const { apiKey, country = "US", searchLang = "en" } = config;

  if (!apiKey) {
    throw new Error("Brave API Key 未配置");
  }

  const startTime = Date.now();
  const url = new URL(BRAVE_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  url.searchParams.set("country", country);
  url.searchParams.set("search_lang", searchLang);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Brave API Key 无效");
    if (response.status === 429) throw new Error("Brave API 调用次数已达上限");
    throw new Error(`Brave API 错误: ${response.status}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  if (data.web?.results) {
    for (const r of data.web.results.slice(0, maxResults)) {
      results.push({
        title: r.title || "",
        url: r.url || "",
        content: r.description || "",
        publishedDate: r.age,
      });
    }
  }

  return {
    query,
    provider: "Brave",
    results,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SearXNG (开源元搜索引擎，免费无需 API Key)
// ═══════════════════════════════════════════════════════════════════════════

// 公共 SearXNG 实例列表（按稳定性排序）
const SEARXNG_PUBLIC_INSTANCES = [
  "https://searx.be",
  "https://search.bus-hit.me",
  "https://searx.tiekoetter.com",
  "https://search.ononoki.org",
];

async function searchSearXNG(
  query: string,
  maxResults: number,
  config: SearXNGConfig
): Promise<SearchResponse> {
  const { instanceUrl, language = "en" } = config;
  const startTime = Date.now();

  // 使用指定实例或尝试公共实例
  const instances = instanceUrl ? [instanceUrl] : SEARXNG_PUBLIC_INSTANCES;
  let lastError: Error | null = null;

  for (const instance of instances) {
    try {
      const url = new URL(`${instance}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("language", language);

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      if (data.results) {
        for (const r of data.results.slice(0, maxResults)) {
          results.push({
            title: r.title || "",
            url: r.url || "",
            content: r.content || r.title || "",
            publishedDate: r.publishedDate,
          });
        }
      }

      return {
        query,
        provider: `SearXNG`,
        results,
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      lastError = error;
      // 继续尝试下一个实例
    }
  }

  throw new Error(lastError?.message || "所有 SearXNG 实例都不可用");
}

// ═══════════════════════════════════════════════════════════════════════════
// You.com Search API
// ═══════════════════════════════════════════════════════════════════════════

const YOU_API_URL = "https://api.ydc-index.io/search";

async function searchYou(
  query: string,
  maxResults: number,
  config: YouConfig
): Promise<SearchResponse> {
  const { apiKey } = config;

  if (!apiKey) {
    throw new Error("You.com API Key 未配置");
  }

  const startTime = Date.now();
  const url = new URL(YOU_API_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("num_web_results", String(maxResults));

  const response = await fetch(url.toString(), {
    headers: {
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("You.com API Key 无效");
    if (response.status === 429) throw new Error("You.com API 调用次数已达上限");
    throw new Error(`You.com API 错误: ${response.status}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  if (data.hits) {
    for (const r of data.hits.slice(0, maxResults)) {
      results.push({
        title: r.title || "",
        url: r.url || "",
        content: r.description || r.snippet || "",
      });
    }
  }

  return {
    query,
    provider: "You.com",
    results,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 统一搜索入口
// ═══════════════════════════════════════════════════════════════════════════

export async function searchWeb(query: string, config: SearchConfig): Promise<SearchResponse> {
  const { provider, maxResults = 5 } = config;

  try {
    switch (provider) {
      case "tavily":
        if (!config.tavily) throw new Error("Tavily 配置缺失");
        return await searchTavily(query, maxResults, config.tavily);
      
      case "serper":
        if (!config.serper) throw new Error("Serper 配置缺失");
        return await searchSerper(query, maxResults, config.serper);
      
      case "bing":
        if (!config.bing) throw new Error("Bing 配置缺失");
        return await searchBing(query, maxResults, config.bing);
      
      case "duckduckgo":
        return await searchDuckDuckGo(query, maxResults, config.duckduckgo || {});
      
      case "brave":
        if (!config.brave) throw new Error("Brave 配置缺失");
        return await searchBrave(query, maxResults, config.brave);
      
      case "searxng":
        return await searchSearXNG(query, maxResults, config.searxng || {});
      
      case "you":
        if (!config.you) throw new Error("You.com 配置缺失");
        return await searchYou(query, maxResults, config.you);
      
      default:
        throw new Error(`不支持的搜索引擎: ${provider}`);
    }
  } catch (error: any) {
    console.error(`[WebSearch] ${provider} search failed:`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 格式化搜索结果
// ═══════════════════════════════════════════════════════════════════════════

export function formatSearchResults(response: SearchResponse): string {
  const lines: string[] = [];
  
  lines.push(`🔍 搜索: "${response.query}" (${response.provider})`);
  
  if (response.answer) {
    lines.push(`\n📝 摘要: ${response.answer}`);
  }
  
  if (response.results.length > 0) {
    lines.push(`\n📄 搜索结果 (${response.results.length} 条):\n`);
    
    response.results.forEach((r, i) => {
      // 使用 Markdown 链接格式，方便 AI 直接引用
      lines.push(`${i + 1}. [${r.title}](${r.url})`);
      if (r.publishedDate) {
        lines.push(`   发布时间: ${r.publishedDate}`);
      }
      lines.push(`   ${r.content}`);
      lines.push("");
    });
  } else {
    lines.push("\n未找到相关结果。");
  }
  
  if (response.responseTime) {
    lines.push(`\n⏱️ 搜索耗时: ${response.responseTime}ms`);
  }
  
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// 故障转移搜索 - 支持多个搜索引擎实例
// ═══════════════════════════════════════════════════════════════════════════

import type { SearchProviderInstance } from "../settings/ai-chat-settings";

/**
 * 从实例配置构建 SearchConfig
 */
function buildSearchConfig(instance: SearchProviderInstance, maxResults: number): SearchConfig {
  const config: SearchConfig = {
    provider: instance.provider,
    maxResults,
  };
  
  switch (instance.provider) {
    case "tavily":
      config.tavily = {
        apiKey: instance.tavilyApiKey || "",
        searchDepth: instance.tavilySearchDepth || "basic",
        includeAnswer: instance.tavilyIncludeAnswer ?? true,
        includeDomains: instance.tavilyIncludeDomains,
        excludeDomains: instance.tavilyExcludeDomains,
      };
      break;
    case "serper":
      config.serper = {
        apiKey: instance.serperApiKey || "",
        gl: instance.serperCountry || "us",
        hl: instance.serperLanguage || "en",
      };
      break;
    case "bing":
      config.bing = {
        apiKey: instance.bingApiKey || "",
        mkt: instance.bingMarket || "en-US",
      };
      break;
    case "duckduckgo":
      config.duckduckgo = {
        region: instance.duckduckgoRegion || "wt-wt",
      };
      break;
    case "brave":
      config.brave = {
        apiKey: instance.braveApiKey || "",
        country: instance.braveCountry || "US",
        searchLang: instance.braveSearchLang || "en",
      };
      break;
    case "searxng":
      config.searxng = {
        instanceUrl: instance.searxngInstanceUrl,
        language: instance.searxngLanguage || "en",
      };
      break;
    case "you":
      config.you = {
        apiKey: instance.youApiKey || "",
      };
      break;
  }
  
  return config;
}

/**
 * 故障转移搜索 - 按优先级尝试多个搜索引擎
 * @param query 搜索查询
 * @param instances 搜索引擎实例列表（按优先级排序）
 * @param maxResults 最大结果数
 * @returns 搜索结果
 */
export async function searchWithFallback(
  query: string,
  instances: SearchProviderInstance[],
  maxResults: number = 5
): Promise<SearchResponse> {
  // 过滤出已启用的实例
  const enabledInstances = instances.filter(i => i.enabled);
  
  if (enabledInstances.length === 0) {
    throw new Error("没有启用的搜索引擎。请在设置中添加并启用至少一个搜索引擎。");
  }
  
  const errors: string[] = [];
  
  for (const instance of enabledInstances) {
    const instanceName = instance.name || `${instance.provider}-${instance.id.slice(-4)}`;
    
    try {
      console.log(`[WebSearch] Trying ${instanceName}...`);
      const config = buildSearchConfig(instance, maxResults);
      const response = await searchWeb(query, config);
      
      // 成功，返回结果
      console.log(`[WebSearch] ${instanceName} succeeded with ${response.results.length} results`);
      return {
        ...response,
        provider: instanceName, // 使用实例名称
      };
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.warn(`[WebSearch] ${instanceName} failed: ${errorMsg}`);
      errors.push(`${instanceName}: ${errorMsg}`);
      // 继续尝试下一个
    }
  }
  
  // 所有实例都失败了
  throw new Error(`所有搜索引擎都失败了:\n${errors.join("\n")}`);
}

/**
 * 检查实例是否有有效的 API Key（DuckDuckGo/SearXNG 除外）
 */
export function isInstanceConfigured(instance: SearchProviderInstance): boolean {
  switch (instance.provider) {
    case "tavily":
      return !!instance.tavilyApiKey?.trim();
    case "serper":
      return !!instance.serperApiKey?.trim();
    case "bing":
      return !!instance.bingApiKey?.trim();
    case "duckduckgo":
      return true; // 不需要 API Key
    case "brave":
      return !!instance.braveApiKey?.trim();
    case "searxng":
      return true; // 不需要 API Key，使用公共实例
    case "you":
      return !!instance.youApiKey?.trim();
    default:
      return false;
  }
}

/**
 * 获取提供商显示名称
 */
export function getProviderDisplayName(provider: SearchProvider): string {
  switch (provider) {
    case "tavily": return "Tavily";
    case "serper": return "Serper (Google)";
    case "bing": return "Bing";
    case "duckduckgo": return "DuckDuckGo";
    case "brave": return "Brave";
    case "searxng": return "SearXNG";
    case "you": return "You.com";
    default: return provider;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 连通性测试
// ═══════════════════════════════════════════════════════════════════════════

export interface ConnectivityTestResult {
  success: boolean;
  message: string;
  responseTime?: number;
  resultCount?: number;
}

/**
 * 测试搜索引擎实例的连通性
 */
export async function testSearchInstance(instance: SearchProviderInstance): Promise<ConnectivityTestResult> {
  const testQuery = "test";
  const startTime = Date.now();
  
  try {
    const config = buildSearchConfig(instance, 3);
    const response = await searchWeb(testQuery, config);
    const responseTime = Date.now() - startTime;
    
    return {
      success: true,
      message: `连接成功 (${responseTime}ms)`,
      responseTime,
      resultCount: response.results.length,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "连接失败",
    };
  }
}
