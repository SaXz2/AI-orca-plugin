/**
 * Web Search Service
 * 支持多个搜索引擎：Tavily, Bing, DuckDuckGo, Brave, SearXNG, Google
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

export type SearchProvider = "tavily" | "bing" | "duckduckgo" | "brave" | "searxng" | "google" | "serpapi";

export interface TavilyConfig {
  apiKey: string;
  searchDepth?: "basic" | "advanced";
  includeAnswer?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
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

export interface GoogleConfig {
  apiKey: string;  // Google Cloud API Key
  searchEngineId: string;  // Programmable Search Engine ID (cx)
  gl?: string;  // 国家代码，如 "cn", "us"
  hl?: string;  // 界面语言，如 "zh-CN", "en"
  lr?: string;  // 搜索结果语言，如 "lang_zh-CN", "lang_en"
  safe?: "off" | "active";  // 安全搜索
}

export interface SearchConfig {
  provider: SearchProvider;
  maxResults?: number;
  tavily?: TavilyConfig;
  bing?: BingConfig;
  duckduckgo?: DuckDuckGoConfig;
  brave?: BraveConfig;
  searxng?: SearXNGConfig;
  google?: GoogleConfig;
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

// 公共 SearXNG 实例列表（从 searx.space 选取活跃且允许 API 访问的实例）
const SEARXNG_PUBLIC_INSTANCES = [
  "https://search.inetol.net",
  "https://searx.tiekoetter.com",
  "https://search.hbubli.cc",
  "https://searx.juancord.xyz",
  "https://search.leptons.xyz",
  "https://searx.daetalytica.io",
  "https://searx.oakleycord.dev",
  "https://search.mdosch.de",
  "https://searx.colbster937.dev",
  "https://searx.perennialte.ch",
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
    // 清理实例 URL，移除尾部斜杠
    const cleanInstance = instance.replace(/\/+$/, "");

    // 方法1: 尝试 JSON API
    try {
      const results = await searchSearXNGJson(cleanInstance, query, maxResults, language);
      if (results.length > 0) {
        return {
          query,
          provider: `SearXNG`,
          results,
          responseTime: Date.now() - startTime,
        };
      }
    } catch (error: any) {
    }

    // 方法2: 尝试 HTML 解析（很多实例禁用 JSON 但允许 HTML）
    try {
      const results = await searchSearXNGHtml(cleanInstance, query, maxResults, language);
      if (results.length > 0) {
        return {
          query,
          provider: `SearXNG`,
          results,
          responseTime: Date.now() - startTime,
        };
      }
    } catch (error: any) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "所有 SearXNG 实例都不可用");
}

/**
 * SearXNG JSON API 搜索
 */
async function searchSearXNGJson(
  instanceUrl: string,
  query: string,
  maxResults: number,
  language: string
): Promise<SearchResult[]> {
  const url = new URL(`${instanceUrl}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", language);
  url.searchParams.set("categories", "general");
  url.searchParams.set("pageno", "1");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": `${instanceUrl}/`,
    },
    credentials: "omit",
    mode: "cors",
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

  return results;
}

/**
 * SearXNG HTML 解析搜索（备用方案）
 * 当 JSON API 被禁用时使用
 */
async function searchSearXNGHtml(
  instanceUrl: string,
  query: string,
  maxResults: number,
  language: string
): Promise<SearchResult[]> {
  const url = new URL(`${instanceUrl}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("language", language);
  url.searchParams.set("categories", "general");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": `${instanceUrl}/`,
    },
    credentials: "omit",
    mode: "cors",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // SearXNG HTML 结果格式解析
  // 结果通常在 <article class="result"> 或 <div class="result"> 中
  
  // 模式1: 新版 SearXNG 格式
  // <article class="result">
  //   <a href="..." class="url_header">...</a>
  //   <h3><a href="...">title</a></h3>
  //   <p class="content">snippet</p>
  // </article>
  const articleRegex = /<article[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let articleMatch;
  
  while ((articleMatch = articleRegex.exec(html)) !== null && results.length < maxResults) {
    const articleHtml = articleMatch[1];
    
    // 提取 URL 和标题
    const linkMatch = articleHtml.match(/<h[34][^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    
    const resultUrl = linkMatch[1];
    const title = decodeHTMLEntities(linkMatch[2].replace(/<[^>]*>/g, "").trim());
    
    // 提取摘要
    const contentMatch = articleHtml.match(/<p[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const content = contentMatch 
      ? decodeHTMLEntities(contentMatch[1].replace(/<[^>]*>/g, "").trim())
      : title;
    
    if (title && resultUrl && resultUrl.startsWith("http")) {
      results.push({ title, url: resultUrl, content });
    }
  }

  // 模式2: 旧版或其他 SearXNG 主题格式
  if (results.length === 0) {
    // <div class="result">
    //   <h4 class="result_header"><a href="...">title</a></h4>
    //   <p class="result-content">snippet</p>
    // </div>
    const divRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|<\/|$)/gi;
    let divMatch;
    
    while ((divMatch = divRegex.exec(html)) !== null && results.length < maxResults) {
      const divHtml = divMatch[1];
      
      const linkMatch = divHtml.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      
      const resultUrl = linkMatch[1];
      const title = decodeHTMLEntities(linkMatch[2].replace(/<[^>]*>/g, "").trim());
      
      const contentMatch = divHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const content = contentMatch 
        ? decodeHTMLEntities(contentMatch[1].replace(/<[^>]*>/g, "").trim())
        : title;
      
      if (title && resultUrl && resultUrl.startsWith("http")) {
        results.push({ title, url: resultUrl, content });
      }
    }
  }

  // 模式3: 更宽松的匹配（最后手段）
  if (results.length === 0) {
    // 尝试匹配任何看起来像搜索结果的链接
    const looseRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let looseMatch;
    const seenUrls = new Set<string>();
    
    while ((looseMatch = looseRegex.exec(html)) !== null && results.length < maxResults) {
      const resultUrl = looseMatch[1];
      const title = decodeHTMLEntities(looseMatch[2].trim());
      
      // 过滤掉 SearXNG 自身的链接和重复链接
      if (
        title.length > 5 &&
        !resultUrl.includes(instanceUrl) &&
        !resultUrl.includes("searx") &&
        !seenUrls.has(resultUrl)
      ) {
        seenUrls.add(resultUrl);
        results.push({ title, url: resultUrl, content: title });
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// Google Custom Search API (Programmable Search Engine)
// 文档: https://developers.google.com/custom-search/v1/overview
// 免费额度: 每天 100 次查询，超出后 $5/1000 次
// ═══════════════════════════════════════════════════════════════════════════

const GOOGLE_CSE_API_URL = "https://www.googleapis.com/customsearch/v1";

async function searchGoogle(
  query: string,
  maxResults: number,
  config: GoogleConfig
): Promise<SearchResponse> {
  const { apiKey, searchEngineId, gl, hl = "zh-CN", lr, safe = "off" } = config;

  if (!apiKey) {
    throw new Error("Google API Key 未配置");
  }
  if (!searchEngineId) {
    throw new Error("Google Search Engine ID (cx) 未配置");
  }

  const startTime = Date.now();
  const url = new URL(GOOGLE_CSE_API_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", searchEngineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(maxResults, 10))); // Google CSE 最多返回 10 条
  url.searchParams.set("safe", safe);
  
  if (gl) url.searchParams.set("gl", gl);  // 地理位置
  if (hl) url.searchParams.set("hl", hl);  // 界面语言
  if (lr) url.searchParams.set("lr", lr);  // 结果语言限制


  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || "";
    
    if (response.status === 400) {
      throw new Error(`Google API 请求无效: ${errorMessage}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Google API Key 无效或无权限: ${errorMessage}`);
    }
    if (response.status === 429) {
      throw new Error("Google API 调用次数已达上限（每天 100 次免费）");
    }
    throw new Error(`Google API 错误: ${response.status} ${errorMessage}`);
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  // 解析搜索结果
  if (data.items) {
    for (const item of data.items.slice(0, maxResults)) {
      results.push({
        title: item.title || "",
        url: item.link || "",
        content: item.snippet || "",
        // Google CSE 可能返回缩略图等额外信息
      });
    }
  }

  // 检查是否有搜索信息
  let answer: string | undefined;
  if (data.searchInformation?.totalResults === "0") {
  } else {
  }

  // 如果有 Featured Snippet（精选摘要），提取为 answer
  // Google CSE 的 promotions 或 spelling 可能包含有用信息
  if (data.spelling?.correctedQuery) {
    answer = `您是否要搜索: ${data.spelling.correctedQuery}`;
  }

  return {
    query,
    provider: "Google",
    results,
    answer,
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
      
      case "google":
        if (!config.google) throw new Error("Google 配置缺失");
        return await searchGoogle(query, maxResults, config.google);
      
      default:
        throw new Error(`不支持的搜索引擎: ${provider}`);
    }
  } catch (error: any) {
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
      const num = i + 1;
      // 使用编号格式，方便AI引用
      lines.push(`[${num}] ${r.title}`);
      lines.push(`    来源: ${r.url}`);
      if (r.publishedDate) {
        lines.push(`    发布时间: ${r.publishedDate}`);
      }
      lines.push(`    内容: ${r.content}`);
      lines.push("");
    });
    
    // 添加引用格式提示
    lines.push(`\n📌 **引用格式说明**：回复时请在相关内容后使用 [数字] 标注来源，如"这是一个事实[1]"。用户界面会自动将这些标注渲染为可点击的来源链接。`);
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
    case "google":
      config.google = {
        apiKey: instance.googleApiKey || "",
        searchEngineId: instance.googleSearchEngineId || "",
        gl: instance.googleGl,
        hl: instance.googleHl || "zh-CN",
        lr: instance.googleLr,
        safe: instance.googleSafe || "off",
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
      const config = buildSearchConfig(instance, maxResults);
      const response = await searchWeb(query, config);
      
      // 成功，返回结果
      return {
        ...response,
        provider: instanceName, // 使用实例名称
      };
    } catch (error: any) {
      const errorMsg = error.message || String(error);
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
    case "bing":
      return !!instance.bingApiKey?.trim();
    case "duckduckgo":
      return true; // 不需要 API Key
    case "brave":
      return !!instance.braveApiKey?.trim();
    case "searxng":
      return true; // 不需要 API Key，使用公共实例
    case "google":
      return !!instance.googleApiKey?.trim() && !!instance.googleSearchEngineId?.trim();
    case "serpapi":
      return !!instance.serpapiApiKey?.trim();
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
    case "bing": return "Bing";
    case "duckduckgo": return "DuckDuckGo";
    case "brave": return "Brave";
    case "searxng": return "SearXNG";
    case "google": return "Google";
    case "serpapi": return "SerpApi";
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
