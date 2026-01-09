/**
 * Image Search Service
 * 支持真正的搜索引擎图片搜索：Google Images, Bing Images, SerpApi, Brave Images, SearXNG Images
 */

export interface ImageResult {
  title: string;
  url: string;
  thumbnailUrl: string;
  sourceUrl: string;
  width?: number;
  height?: number;
  size?: string;
  format?: string;
}

export interface ImageSearchResponse {
  query: string;
  results: ImageResult[];
  responseTime?: number;
  provider: string;
}

export type ImageSearchProvider = "google" | "bing" | "duckduckgo" | "serpapi" | "brave" | "searxng";

export interface GoogleImageConfig {
  apiKey: string;
  searchEngineId: string;
  gl?: string;
  hl?: string;
  safe?: "off" | "active";
}

export interface BingImageConfig {
  apiKey: string;
  mkt?: string;
  safeSearch?: "Off" | "Moderate" | "Strict";
}

export interface DuckDuckGoImageConfig {
  region?: string;
  safeSearch?: "off" | "moderate" | "strict";
}

export interface SerpApiImageConfig {
  apiKey: string;
  gl?: string;  // 国家代码
  hl?: string;  // 语言
}

export interface BraveImageConfig {
  apiKey: string;
  country?: string;
  safeSearch?: "off" | "moderate" | "strict";
}

export interface SearXNGImageConfig {
  instanceUrl?: string;  // 自定义实例 URL
  safeSearch?: 0 | 1 | 2;  // 0=off, 1=moderate, 2=strict
}

export interface ImageSearchConfig {
  provider: ImageSearchProvider;
  maxResults?: number;
  google?: GoogleImageConfig;
  bing?: BingImageConfig;
  duckduckgo?: DuckDuckGoImageConfig;
  serpapi?: SerpApiImageConfig;
  brave?: BraveImageConfig;
  searxng?: SearXNGImageConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// Google Images API (Custom Search)
// ═══════════════════════════════════════════════════════════════════════════

const GOOGLE_CSE_API_URL = "https://www.googleapis.com/customsearch/v1";

/**
 * 清理和标准化图片URL
 * 移除可能导致加载问题的参数和格式转换
 */
function cleanImageUrl(url: string): string {
  try {
    // 处理Storyblok等CDN的特殊格式
    if (url.includes('storyblok.com')) {
      // 移除 /m/filters: 后面的所有参数
      url = url.replace(/\/m\/filters:.*$/, '');
    }
    
    // 处理其他CDN的格式转换参数
    url = url.replace(/\?.*format=webp.*$/, ''); // 移除webp格式转换
    url = url.replace(/\?.*quality=\d+.*$/, ''); // 移除质量参数
    
    // 移除常见的图片处理参数
    const urlObj = new URL(url);
    const paramsToRemove = ['format', 'quality', 'w', 'h', 'fit', 'crop', 'auto'];
    paramsToRemove.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    return urlObj.toString();
  } catch (error) {
    console.warn('[ImageSearch] Failed to clean URL:', url, error);
    return url; // 如果清理失败，返回原URL
  }
}

async function searchGoogleImages(
  query: string,
  maxResults: number,
  config: GoogleImageConfig
): Promise<ImageSearchResponse> {
  const { apiKey, searchEngineId, gl, hl = "zh-CN", safe = "off" } = config;

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
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", String(Math.min(maxResults, 10)));
  url.searchParams.set("safe", safe);
  
  if (gl) url.searchParams.set("gl", gl);
  if (hl) url.searchParams.set("hl", hl);

  console.log(`[Google Images] Searching: ${query}`);

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error?.message || "";
    
    if (response.status === 400) {
      throw new Error(`Google Images API 请求无效: ${errorMessage}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Google Images API Key 无效或无权限: ${errorMessage}`);
    }
    if (response.status === 429) {
      throw new Error("Google Images API 调用次数已达上限");
    }
    throw new Error(`Google Images API 错误: ${response.status} ${errorMessage}`);
  }

  const data = await response.json();
  const results: ImageResult[] = [];

  if (data.items) {
    for (const item of data.items.slice(0, maxResults)) {
      const originalUrl = item.link || "";
      const cleanedUrl = cleanImageUrl(originalUrl);
      
      console.log(`[Google Images] URL cleaning: ${originalUrl} -> ${cleanedUrl}`);
      
      results.push({
        title: item.title || "",
        url: cleanedUrl,
        thumbnailUrl: item.image?.thumbnailLink || cleanedUrl,
        sourceUrl: item.image?.contextLink || item.displayLink || "",
        width: item.image?.width,
        height: item.image?.height,
        size: item.image?.byteSize ? `${Math.round(item.image.byteSize / 1024)}KB` : undefined,
        format: item.fileFormat || item.mime,
      });
    }
  }

  console.log(`[Google Images] Found ${results.length} results`);

  return {
    query,
    provider: "Google Images",
    results,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Bing Images API
// ═══════════════════════════════════════════════════════════════════════════

const BING_IMAGES_API_URL = "https://api.bing.microsoft.com/v7.0/images/search";

async function searchBingImages(
  query: string,
  maxResults: number,
  config: BingImageConfig
): Promise<ImageSearchResponse> {
  const { apiKey, mkt = "en-US", safeSearch = "Moderate" } = config;

  if (!apiKey) {
    throw new Error("Bing API Key 未配置");
  }

  const startTime = Date.now();
  const url = new URL(BING_IMAGES_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));
  url.searchParams.set("mkt", mkt);
  url.searchParams.set("safeSearch", safeSearch);

  console.log(`[Bing Images] Searching: ${query}`);

  const response = await fetch(url.toString(), {
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Bing Images API Key 无效");
    if (response.status === 429) throw new Error("Bing Images API 调用次数已达上限");
    throw new Error(`Bing Images API 错误: ${response.status}`);
  }

  const data = await response.json();
  const results: ImageResult[] = [];

  if (data.value) {
    for (const item of data.value.slice(0, maxResults)) {
      const originalUrl = item.contentUrl || "";
      const cleanedUrl = cleanImageUrl(originalUrl);
      
      console.log(`[Bing Images] URL cleaning: ${originalUrl} -> ${cleanedUrl}`);
      
      results.push({
        title: item.name || "",
        url: cleanedUrl,
        thumbnailUrl: item.thumbnailUrl || cleanedUrl,
        sourceUrl: item.hostPageUrl || "",
        width: item.width,
        height: item.height,
        size: item.contentSize,
        format: item.encodingFormat,
      });
    }
  }

  console.log(`[Bing Images] Found ${results.length} results`);

  return {
    query,
    provider: "Bing Images",
    results,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DuckDuckGo Images (免费，无需 API Key)
// 使用 DuckDuckGo 的图片搜索 API
// ═══════════════════════════════════════════════════════════════════════════

async function searchDuckDuckGoImages(
  query: string,
  maxResults: number,
  config: DuckDuckGoImageConfig
): Promise<ImageSearchResponse> {
  const startTime = Date.now();

  console.log(`[DuckDuckGo Images] Searching: ${query}`);

  try {
    // 步骤1: 获取 vqd token（DuckDuckGo 的搜索令牌）
    const tokenUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    const tokenResponse = await fetch(tokenUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!tokenResponse.ok) {
      throw new Error(`获取 DuckDuckGo token 失败: ${tokenResponse.status}`);
    }

    const html = await tokenResponse.text();
    
    // 从 HTML 中提取 vqd token
    const vqdMatch = html.match(/vqd=["']?([^"'&]+)/i) || 
                     html.match(/vqd\\x3d([^\\&]+)/) ||
                     html.match(/vqd%3D([^%&]+)/);
    
    if (!vqdMatch) {
      // 备用方案：尝试从即时答案 API 获取图片
      return await searchDuckDuckGoInstantAnswer(query, maxResults, startTime);
    }

    const vqd = vqdMatch[1];
    console.log(`[DuckDuckGo Images] Got vqd token: ${vqd.substring(0, 10)}...`);

    // 步骤2: 使用 vqd token 调用图片搜索 API
    const imageApiUrl = new URL("https://duckduckgo.com/i.js");
    imageApiUrl.searchParams.set("l", "us-en");
    imageApiUrl.searchParams.set("o", "json");
    imageApiUrl.searchParams.set("q", query);
    imageApiUrl.searchParams.set("vqd", vqd);
    imageApiUrl.searchParams.set("f", ",,,,,");
    imageApiUrl.searchParams.set("p", "1");

    const imageResponse = await fetch(imageApiUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://duckduckgo.com/",
      },
    });

    if (!imageResponse.ok) {
      throw new Error(`DuckDuckGo 图片 API 错误: ${imageResponse.status}`);
    }

    const data = await imageResponse.json();
    const results: ImageResult[] = [];

    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results.slice(0, maxResults)) {
        if (item.image) {
          results.push({
            title: item.title || query,
            url: item.image,
            thumbnailUrl: item.thumbnail || item.image,
            sourceUrl: item.url || "",
            width: item.width,
            height: item.height,
          });
        }
      }
    }

    if (results.length > 0) {
      console.log(`[DuckDuckGo Images] Found ${results.length} results`);
      return {
        query,
        provider: "DuckDuckGo Images",
        results,
        responseTime: Date.now() - startTime,
      };
    }

    // 如果没有结果，尝试备用方案
    return await searchDuckDuckGoInstantAnswer(query, maxResults, startTime);

  } catch (error: any) {
    console.error("[DuckDuckGo Images] Search failed:", error);
    throw new Error(`DuckDuckGo图像搜索失败: ${error.message}`);
  }
}

/**
 * DuckDuckGo 即时答案 API 备用方案
 */
async function searchDuckDuckGoInstantAnswer(
  query: string,
  maxResults: number,
  startTime: number
): Promise<ImageSearchResponse> {
  const instantAnswerUrl = new URL("https://api.duckduckgo.com/");
  instantAnswerUrl.searchParams.set("q", query);
  instantAnswerUrl.searchParams.set("format", "json");
  instantAnswerUrl.searchParams.set("no_html", "1");
  instantAnswerUrl.searchParams.set("skip_disambig", "1");

  const instantResponse = await fetch(instantAnswerUrl.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
    },
  });

  if (!instantResponse.ok) {
    throw new Error("DuckDuckGo 即时答案 API 失败");
  }

  const instantData = await instantResponse.json();
  const results: ImageResult[] = [];

  // 从即时答案中提取图片
  if (instantData.RelatedTopics) {
    for (const topic of instantData.RelatedTopics.slice(0, maxResults)) {
      if (topic.Icon && topic.Icon.URL) {
        results.push({
          title: topic.Text || query,
          url: topic.Icon.URL.startsWith("http") ? topic.Icon.URL : `https://duckduckgo.com${topic.Icon.URL}`,
          thumbnailUrl: topic.Icon.URL.startsWith("http") ? topic.Icon.URL : `https://duckduckgo.com${topic.Icon.URL}`,
          sourceUrl: topic.FirstURL || "",
        });
      }
    }
  }

  if (results.length < maxResults && instantData.Image) {
    const imgUrl = instantData.Image.startsWith("http") ? instantData.Image : `https://duckduckgo.com${instantData.Image}`;
    results.push({
      title: instantData.Heading || query,
      url: imgUrl,
      thumbnailUrl: imgUrl,
      sourceUrl: instantData.AbstractURL || "",
    });
  }

  if (results.length === 0) {
    throw new Error("DuckDuckGo 未找到相关图片");
  }

  console.log(`[DuckDuckGo Images] Found ${results.length} results via instant answer`);
  return {
    query,
    provider: "DuckDuckGo Images",
    results: results.slice(0, maxResults),
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SerpApi (Google Images via SerpApi) - 免费100次/月
// https://serpapi.com/
// ═══════════════════════════════════════════════════════════════════════════

const SERPAPI_URL = "https://serpapi.com/search.json";

async function searchSerpApiImages(
  query: string,
  maxResults: number,
  config: SerpApiImageConfig
): Promise<ImageSearchResponse> {
  const { apiKey, gl = "cn", hl = "zh-cn" } = config;

  if (!apiKey) {
    throw new Error("SerpApi API Key 未配置");
  }

  const startTime = Date.now();
  const url = new URL(SERPAPI_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", gl);
  url.searchParams.set("hl", hl);
  url.searchParams.set("num", String(maxResults));

  console.log(`[SerpApi Images] Searching: ${query}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    if (response.status === 401) throw new Error("SerpApi API Key 无效");
    if (response.status === 429) throw new Error("SerpApi API 调用次数已达上限");
    throw new Error(`SerpApi API 错误: ${response.status}`);
  }

  const data = await response.json();
  const results: ImageResult[] = [];

  if (data.images_results) {
    for (const item of data.images_results.slice(0, maxResults)) {
      results.push({
        title: item.title || "",
        url: item.original || item.thumbnail || "",
        thumbnailUrl: item.thumbnail || item.original || "",
        sourceUrl: item.link || item.source || "",
        width: item.original_width,
        height: item.original_height,
      });
    }
  }

  console.log(`[SerpApi Images] Found ${results.length} results`);

  return {
    query,
    provider: "SerpApi (Google Images)",
    results,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Brave Images API - 真正的搜索引擎图片搜索
// https://brave.com/search/api/
// 免费 2000 次/月
// ═══════════════════════════════════════════════════════════════════════════

const BRAVE_IMAGES_API_URL = "https://api.search.brave.com/res/v1/images/search";

async function searchBraveImages(
  query: string,
  maxResults: number,
  config: BraveImageConfig
): Promise<ImageSearchResponse> {
  const { apiKey, country = "US", safeSearch = "moderate" } = config;

  if (!apiKey) {
    throw new Error("Brave API Key 未配置");
  }

  const startTime = Date.now();
  const url = new URL(BRAVE_IMAGES_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(maxResults, 100)));
  url.searchParams.set("country", country);
  url.searchParams.set("safesearch", safeSearch);

  console.log(`[Brave Images] Searching: ${query}`);

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Brave API Key 无效");
    if (response.status === 429) throw new Error("Brave API 调用次数已达上限");
    throw new Error(`Brave Images API 错误: ${response.status}`);
  }

  const data = await response.json();
  const results: ImageResult[] = [];

  if (data.results) {
    for (const item of data.results.slice(0, maxResults)) {
      results.push({
        title: item.title || query,
        url: item.properties?.url || item.thumbnail?.src || "",
        thumbnailUrl: item.thumbnail?.src || item.properties?.url || "",
        sourceUrl: item.url || "",
        width: item.properties?.width,
        height: item.properties?.height,
      });
    }
  }

  console.log(`[Brave Images] Found ${results.length} results`);

  return {
    query,
    provider: "Brave Images",
    results,
    responseTime: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SearXNG Images - 开源元搜索引擎图片搜索（免费，无需 API Key）
// 聚合多个搜索引擎的图片结果
// ═══════════════════════════════════════════════════════════════════════════

// 公共 SearXNG 实例列表（从 searx.space 选取活跃且支持 JSON API 的实例）
const SEARXNG_IMAGE_INSTANCES = [
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

async function searchSearXNGImages(
  query: string,
  maxResults: number,
  config: SearXNGImageConfig
): Promise<ImageSearchResponse> {
  const { instanceUrl, safeSearch = 1 } = config;
  const startTime = Date.now();

  const instances = instanceUrl ? [instanceUrl] : SEARXNG_IMAGE_INSTANCES;
  let lastError: Error | null = null;

  for (const instance of instances) {
    try {
      const cleanInstance = instance.replace(/\/+$/, "");
      const url = new URL(`${cleanInstance}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("categories", "images");
      url.searchParams.set("safesearch", String(safeSearch));

      console.log(`[SearXNG Images] Trying ${cleanInstance} for: ${query}`);

      const response = await fetch(url.toString(), {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const results: ImageResult[] = [];

      if (data.results) {
        for (const item of data.results.slice(0, maxResults)) {
          if (item.img_src || item.thumbnail_src) {
            results.push({
              title: item.title || query,
              url: item.img_src || item.thumbnail_src || "",
              thumbnailUrl: item.thumbnail_src || item.img_src || "",
              sourceUrl: item.url || "",
              width: item.img_width,
              height: item.img_height,
            });
          }
        }
      }

      if (results.length > 0) {
        console.log(`[SearXNG Images] Found ${results.length} results from ${cleanInstance}`);
        return {
          query,
          provider: "SearXNG Images",
          results,
          responseTime: Date.now() - startTime,
        };
      }
    } catch (error: any) {
      lastError = error;
      console.warn(`[SearXNG Images] ${instance} failed:`, error.message);
    }
  }

  throw new Error(lastError?.message || "所有 SearXNG 实例都不可用");
}

// ═══════════════════════════════════════════════════════════════════════════
// 统一图像搜索入口
// ═══════════════════════════════════════════════════════════════════════════

export async function searchImages(query: string, config: ImageSearchConfig): Promise<ImageSearchResponse> {
  const { provider, maxResults = 6 } = config;

  try {
    switch (provider) {
      case "google":
        if (!config.google) throw new Error("Google Images 配置缺失");
        return await searchGoogleImages(query, maxResults, config.google);
      
      case "bing":
        if (!config.bing) throw new Error("Bing Images 配置缺失");
        return await searchBingImages(query, maxResults, config.bing);
      
      case "duckduckgo":
        return await searchDuckDuckGoImages(query, maxResults, config.duckduckgo || {});
      
      case "serpapi":
        if (!config.serpapi) throw new Error("SerpApi 配置缺失");
        return await searchSerpApiImages(query, maxResults, config.serpapi);
      
      case "brave":
        if (!config.brave) throw new Error("Brave Images 配置缺失");
        return await searchBraveImages(query, maxResults, config.brave);
      
      case "searxng":
        return await searchSearXNGImages(query, maxResults, config.searxng || {});
      
      default:
        throw new Error(`不支持的图像搜索引擎: ${provider}`);
    }
  } catch (error: any) {
    console.error(`[ImageSearch] ${provider} search failed:`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 智能图像搜索 - 根据查询内容自动选择合适的图片
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 智能图像搜索 - 根据用户查询自动搜索相关图片
 * @param query 用户查询
 * @param config 搜索配置
 * @param maxImages 最大图片数量
 * @returns 搜索结果
 */
export async function smartImageSearch(
  query: string,
  config: ImageSearchConfig,
  maxImages: number = 3
): Promise<ImageResult[]> {
  // 提取查询中的关键词，用于图像搜索
  const imageKeywords = extractImageKeywords(query);
  
  if (imageKeywords.length === 0) {
    return [];
  }

  const results: ImageResult[] = [];
  
  // 对每个关键词进行图像搜索
  for (const keyword of imageKeywords.slice(0, 2)) { // 最多搜索2个关键词
    try {
      const searchQuery = keyword;
      const response = await searchImages(searchQuery, {
        ...config,
        maxResults: Math.ceil(maxImages / imageKeywords.length),
      });
      
      results.push(...response.results);
      
      if (results.length >= maxImages) {
        break;
      }
    } catch (error) {
      console.warn(`[SmartImageSearch] Failed to search for "${keyword}":`, error);
    }
  }

  // 去重并限制数量
  const uniqueResults = deduplicateImages(results);
  return uniqueResults.slice(0, maxImages);
}

/**
 * 从查询中提取适合图像搜索的关键词
 */
function extractImageKeywords(query: string): string[] {
  const keywords: string[] = [];
  
  // 人物名称模式
  const personPatterns = [
    /(?:谁是|介绍|了解)(.+?)(?:[？?]|$)/g,
    /(.+?)(?:是谁|简介|资料)/g,
  ];
  
  for (const pattern of personPatterns) {
    const matches = [...query.matchAll(pattern)];
    for (const match of matches) {
      const name = match[1]?.trim();
      if (name && name.length > 1 && name.length < 20) {
        keywords.push(name);
      }
    }
  }
  
  // 物品、地点、概念等
  const entityPatterns = [
    /(?:什么是|介绍|了解)(.+?)(?:[？?]|$)/g,
    /(.+?)(?:的图片|照片|样子)/g,
  ];
  
  for (const pattern of entityPatterns) {
    const matches = [...query.matchAll(pattern)];
    for (const match of matches) {
      const entity = match[1]?.trim();
      if (entity && entity.length > 1 && entity.length < 30) {
        keywords.push(entity);
      }
    }
  }
  
  // 如果没有匹配到特定模式，尝试提取名词
  if (keywords.length === 0) {
    const words = query.split(/[\s，,。.！!？?]+/).filter(w => w.length > 1);
    // 简单的名词识别（中文）
    for (const word of words) {
      if (/^[\u4e00-\u9fff]+$/.test(word) && word.length >= 2 && word.length <= 10) {
        keywords.push(word);
      }
    }
  }
  
  return [...new Set(keywords)]; // 去重
}

/**
 * 图片去重 - 基于URL和标题
 */
function deduplicateImages(images: ImageResult[]): ImageResult[] {
  const seen = new Set<string>();
  const unique: ImageResult[] = [];
  
  for (const image of images) {
    const key = `${image.url}|${image.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(image);
    }
  }
  
  return unique;
}

// ═══════════════════════════════════════════════════════════════════════════
// 格式化图像搜索结果
// ═══════════════════════════════════════════════════════════════════════════

export function formatImageResults(response: ImageSearchResponse): string {
  const lines: string[] = [];
  
  lines.push(`🖼️ 图片搜索: "${response.query}" (${response.provider})`);
  
  if (response.results.length > 0) {
    lines.push(`\n找到 ${response.results.length} 张相关图片:\n`);
    
    response.results.forEach((img, i) => {
      lines.push(`${i + 1}. ![${img.title}](${img.url})`);
      if (img.sourceUrl) {
        lines.push(`   来源: [${img.sourceUrl}](${img.sourceUrl})`);
      }
      if (img.width && img.height) {
        lines.push(`   尺寸: ${img.width}×${img.height}${img.size ? ` (${img.size})` : ""}`);
      }
      lines.push("");
    });
  } else {
    lines.push("\n未找到相关图片。");
  }
  
  if (response.responseTime) {
    lines.push(`\n⏱️ 搜索耗时: ${response.responseTime}ms`);
  }
  
  return lines.join("\n");
}