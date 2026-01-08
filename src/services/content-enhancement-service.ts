/**
 * Content Enhancement Service
 * 智能内容增强服务，为AI回复自动添加图片和引用来源
 */

import { searchImages, smartImageSearch, type ImageSearchConfig } from "./image-search-service";
import { createCitationsFromSearchResults, generateSmartCitations, type Citation } from "./citation-service";
import type { ImageItem } from "../components/ImageGallery";
import type { SearchResult } from "./web-search-service";

export interface ContentEnhancement {
  images: ImageItem[];
  citations: Citation[];
  enhancedContent: string;
}

export interface EnhancementConfig {
  enableImageSearch: boolean;
  enableCitations: boolean;
  maxImages: number;
  imageSearchProvider: "google" | "bing" | "duckduckgo";
  // 搜索引擎配置
  searchConfig?: any;
}

/**
 * 智能内容增强 - 为AI回复自动添加相关图片和引用
 */
export async function enhanceContent(
  content: string,
  searchResults: SearchResult[] = [],
  config: EnhancementConfig
): Promise<ContentEnhancement> {
  const images: ImageItem[] = [];
  const citations: Citation[] = [];
  let enhancedContent = content;

  try {
    // 1. 图像搜索增强
    if (config.enableImageSearch && config.searchConfig) {
      const imageResults = await performImageSearch(content, config);
      images.push(...imageResults);
    }

    // 2. 引用来源增强
    if (config.enableCitations && searchResults.length > 0) {
      const citationResults = createCitationsFromSearchResults(searchResults, "web");
      citations.push(...citationResults);
      
      // 生成带引用的内容
      const smartCitations = generateSmartCitations(content, searchResults);
      enhancedContent = smartCitations.content;
    }

    return {
      images,
      citations,
      enhancedContent,
    };
  } catch (error) {
    console.error("[ContentEnhancement] Error enhancing content:", error);
    return {
      images: [],
      citations,
      enhancedContent: content,
    };
  }
}

/**
 * 执行图像搜索
 */
async function performImageSearch(
  content: string,
  config: EnhancementConfig
): Promise<ImageItem[]> {
  try {
    const imageConfig: ImageSearchConfig = {
      provider: config.imageSearchProvider,
      maxResults: config.maxImages,
      ...config.searchConfig,
    };

    // 使用智能图像搜索
    const results = await smartImageSearch(content, imageConfig, config.maxImages);
    
    return results.map(result => ({
      url: result.url,
      title: result.title,
      sourceUrl: result.sourceUrl,
      width: result.width,
      height: result.height,
      size: result.size,
    }));
  } catch (error) {
    console.warn("[ContentEnhancement] Image search failed:", error);
    return [];
  }
}

/**
 * 检测内容是否需要图像增强
 */
export function shouldEnhanceWithImages(content: string): boolean {
  // 检测是否包含人物、地点、物品等可视化内容
  const imageKeywords = [
    // 人物相关
    /(?:谁是|介绍|了解).{1,20}(?:[？?]|$)/,
    /.{1,20}(?:是谁|简介|资料|长什么样)/,
    
    // 地点相关
    /(?:什么地方|哪里|地点|景点|建筑).{1,30}/,
    /.{1,30}(?:在哪里|怎么去|景色|风景)/,
    
    // 物品相关
    /(?:什么是|介绍|了解).{1,30}(?:[？?]|$)/,
    /.{1,30}(?:的样子|外观|长什么样|图片|照片)/,
    
    // 概念相关
    /(?:如何|怎么).{1,30}(?:看起来|外观|形状)/,
  ];

  return imageKeywords.some(pattern => pattern.test(content));
}

/**
 * 检测内容是否需要引用增强
 */
export function shouldEnhanceWithCitations(content: string): boolean {
  // 检测是否包含事实性陈述、数据、引用等
  const citationKeywords = [
    // 数据和统计
    /\d+%|\d+\.\d+%|百分之\d+/,
    /\d{4}年|\d+月\d+日|最新数据|统计显示/,
    
    // 事实性陈述
    /据.*报道|根据.*研究|.*表示|.*指出/,
    /研究表明|数据显示|调查发现|报告称/,
    
    // 引用标记
    /\[[0-9]+\]|\(\d+\)|来源:|参考:/,
    
    // 新闻和时事
    /最新消息|今日|昨日|本月|今年|去年/,
  ];

  return citationKeywords.some(pattern => pattern.test(content));
}

/**
 * 自动检测并增强内容
 */
export async function autoEnhanceContent(
  content: string,
  searchResults: SearchResult[] = [],
  baseConfig: Partial<EnhancementConfig> = {}
): Promise<ContentEnhancement> {
  const config: EnhancementConfig = {
    enableImageSearch: shouldEnhanceWithImages(content),
    enableCitations: shouldEnhanceWithCitations(content) && searchResults.length > 0,
    maxImages: 3,
    imageSearchProvider: "duckduckgo", // 默认使用免费的DuckDuckGo
    ...baseConfig,
  };

  return enhanceContent(content, searchResults, config);
}

/**
 * 从AI设置构建增强配置
 */
export function buildEnhancementConfigFromSettings(settings: any): Partial<EnhancementConfig> {
  const webConfig = settings.webSearch;
  
  if (!webConfig || !webConfig.enabled) {
    return {
      enableImageSearch: false,
      enableCitations: false,
    };
  }

  // 确定图像搜索提供商
  let imageSearchProvider: "google" | "bing" | "duckduckgo" = "duckduckgo";
  let searchConfig: any = {};

  const instances = webConfig.instances || [];
  
  // 优先使用Google Images
  const googleInstance = instances.find((i: any) => 
    i.provider === "google" && i.enabled && i.googleApiKey && i.googleSearchEngineId
  );
  if (googleInstance) {
    imageSearchProvider = "google";
    searchConfig = {
      google: {
        apiKey: googleInstance.googleApiKey,
        searchEngineId: googleInstance.googleSearchEngineId,
        gl: googleInstance.googleGl,
        hl: googleInstance.googleHl || "zh-CN",
        safe: googleInstance.googleSafe || "off",
      },
    };
  } else {
    // 尝试使用Bing Images
    const bingInstance = instances.find((i: any) => 
      i.provider === "bing" && i.enabled && i.bingApiKey
    );
    if (bingInstance) {
      imageSearchProvider = "bing";
      searchConfig = {
        bing: {
          apiKey: bingInstance.bingApiKey,
          mkt: bingInstance.bingMarket || "zh-CN",
          safeSearch: "Moderate",
        },
      };
    } else {
      // 使用免费的DuckDuckGo
      imageSearchProvider = "duckduckgo";
      searchConfig = {
        duckduckgo: {
          region: "cn-zh",
          safeSearch: "moderate",
        },
      };
    }
  }

  return {
    enableImageSearch: webConfig.imageSearchEnabled !== false,
    enableCitations: true,
    maxImages: webConfig.maxImageResults || 3,
    imageSearchProvider,
    searchConfig,
  };
}