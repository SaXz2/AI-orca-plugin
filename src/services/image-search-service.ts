/**
 * Image Search Service
 * 支持多个图像搜索引擎：Google Images, Bing Images, DuckDuckGo Images
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

export type ImageSearchProvider = "google" | "bing" | "duckduckgo";

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

export interface ImageSearchConfig {
  provider: ImageSearchProvider;
  maxResults?: number;
  google?: GoogleImageConfig;
  bing?: BingImageConfig;
  duckduckgo?: DuckDuckGoImageConfig;
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
// ═══════════════════════════════════════════════════════════════════════════

async function searchDuckDuckGoImages(
  query: string,
  maxResults: number,
  config: DuckDuckGoImageConfig
): Promise<ImageSearchResponse> {
  const { region = "wt-wt", safeSearch = "moderate" } = config;
  const startTime = Date.now();

  console.log(`[DuckDuckGo Images] Searching: ${query}`);

  try {
    // 方法1: 尝试使用DuckDuckGo的即时答案API
    const instantAnswerUrl = new URL("https://api.duckduckgo.com/");
    instantAnswerUrl.searchParams.set("q", query);
    instantAnswerUrl.searchParams.set("format", "json");
    instantAnswerUrl.searchParams.set("no_html", "1");
    instantAnswerUrl.searchParams.set("skip_disambig", "1");

    const instantResponse = await fetch(instantAnswerUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        "Referer": "https://duckduckgo.com/",
        "Origin": "https://duckduckgo.com",
      },
    });

    if (instantResponse.ok) {
      const instantData = await instantResponse.json();
      
      // 从即时答案中提取图片
      const results: ImageResult[] = [];
      
      // 检查是否有相关主题的图片
      if (instantData.RelatedTopics) {
        for (const topic of instantData.RelatedTopics.slice(0, maxResults)) {
          if (topic.Icon && topic.Icon.URL) {
            results.push({
              title: topic.Text || query,
              url: topic.Icon.URL,
              thumbnailUrl: topic.Icon.URL,
              sourceUrl: topic.FirstURL || "",
            });
          }
        }
      }

      // 检查主要结果的图片
      if (results.length < maxResults && instantData.Image) {
        results.push({
          title: instantData.Heading || query,
          url: instantData.Image,
          thumbnailUrl: instantData.Image,
          sourceUrl: instantData.AbstractURL || "",
        });
      }

      if (results.length > 0) {
        console.log(`[DuckDuckGo Images] Found ${results.length} results via instant answer`);
        return {
          query,
          provider: "DuckDuckGo Images",
          results: results.slice(0, maxResults),
          responseTime: Date.now() - startTime,
        };
      }
    }

    // 方法2: 如果即时答案没有图片，返回占位符结果
    console.log(`[DuckDuckGo Images] No images found via instant answer, using fallback`);
    
    // 生成一些通用的占位符图片（来自可靠的图片服务）
    const fallbackResults: ImageResult[] = [];
    
    // 使用Unsplash的搜索API作为备选（免费且可靠）
    try {
      const unsplashUrl = new URL("https://source.unsplash.com/featured/");
      unsplashUrl.searchParams.set("q", query);
      
      for (let i = 0; i < Math.min(maxResults, 3); i++) {
        const imageUrl = `${unsplashUrl.toString()}&sig=${i}`;
        fallbackResults.push({
          title: `${query} - 图片 ${i + 1}`,
          url: imageUrl,
          thumbnailUrl: imageUrl,
          sourceUrl: "https://unsplash.com/",
          width: 800,
          height: 600,
        });
      }
    } catch (unsplashError) {
      console.warn("[DuckDuckGo Images] Unsplash fallback failed:", unsplashError);
    }

    return {
      query,
      provider: "DuckDuckGo Images (Fallback)",
      results: fallbackResults,
      responseTime: Date.now() - startTime,
    };

  } catch (error: any) {
    console.error("[DuckDuckGo Images] All methods failed:", error);
    
    // 最后的备选方案：返回提示用户配置其他搜索引擎的消息
    throw new Error(`DuckDuckGo图像搜索暂时不可用。建议配置Google Images或Bing Images API以获得更好的图片搜索体验。错误详情: ${error.message}`);
  }
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