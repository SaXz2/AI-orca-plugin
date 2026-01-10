/**
 * Auto Enhancement Service
 * 自动增强AI回复，即使AI没有主动调用图片搜索也能自动添加图片和引用
 */

import { smartImageSearch, type ImageSearchConfig } from "./image-search-service";
import { generateSmartCitations, type Citation } from "./citation-service";
import type { ImageItem } from "../components/ImageGallery";

export interface AutoEnhancementResult {
  shouldEnhance: boolean;
  images: ImageItem[];
  citations: Citation[];
  enhancedContent: string;
}

/**
 * 智能实体和关键词提取 - 基于语义理解
 * 不是简单的关键词匹配，而是理解用户真正想看什么
 */
export function extractSmartKeywords(content: string): {
  primaryEntity: string | null;
  visualKeywords: string[];
  searchContext: 'character' | 'person' | 'place' | 'object' | 'concept';
  searchIntent: 'official' | 'realistic' | 'artistic' | 'general';
} {
  // 1. 语义判断 - 先理解用户在问什么
  const characterPatterns = [
    /([^，,。.！!？?\s]{2,8})(?:是谁|是什么角色|有照片|长什么样)/g,
    /(?:谁是|介绍)([^，,。.！!？?\s]{2,8})/g,
    /([A-Z][a-z]*|[^，,。.！!？?\s]{2,8})(?:角色|人物|主角)/g,
  ];
  
  const personPatterns = [
    /([^，,。.！!？?\s]{2,6})(?:是.*人|演员|明星|歌手|作家)/g,
    /(?:真人|现实中的)([^，,。.！!？?\s]{2,8})/g,
  ];
  
  const placePatterns = [
    /([^，,。.！!？?\s]{2,15})(?:在哪里|位于|坐落|地方|景点)/g,
    /(?:去|到|看)([^，,。.！!？?\s]{2,15})(?:旅游|游玩)/g,
  ];
  
  const objectPatterns = [
    /([^，,。.！!？?\s]{2,15})(?:是什么|产品|设备|工具)/g,
    /什么是([^，,。.！!？?\s]{2,15})/g,
  ];

  let primaryEntity: string | null = null;
  let searchContext: 'character' | 'person' | 'place' | 'object' | 'concept' = 'concept';
  let searchIntent: 'official' | 'realistic' | 'artistic' | 'general' = 'general';

  // 2. 按优先级检测实体类型
  // 角色检测（最高优先级，因为最容易误判）
  for (const pattern of characterPatterns) {
    const matches = [...content.matchAll(pattern)];
    if (matches.length > 0) {
      primaryEntity = matches[0][1].trim();
      searchContext = 'character';
      searchIntent = 'official'; // 角色优先官方图
      break;
    }
  }

  // 真人检测
  if (!primaryEntity) {
    for (const pattern of personPatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        primaryEntity = matches[0][1].trim();
        searchContext = 'person';
        searchIntent = 'realistic';
        break;
      }
    }
  }

  // 地点检测
  if (!primaryEntity) {
    for (const pattern of placePatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        primaryEntity = matches[0][1].trim();
        searchContext = 'place';
        searchIntent = 'realistic';
        break;
      }
    }
  }

  // 物品检测
  if (!primaryEntity) {
    for (const pattern of objectPatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        primaryEntity = matches[0][1].trim();
        searchContext = 'object';
        searchIntent = 'general';
        break;
      }
    }
  }

  // 3. 生成视觉搜索关键词 - 基于理解的内容类型
  const visualKeywords: string[] = [];
  
  if (primaryEntity) {
    switch (searchContext) {
      case 'character':
        // 角色：优先官方设定图、角色设计
        visualKeywords.push(
          `${primaryEntity} official art`,
          `${primaryEntity} character design`,
          `${primaryEntity} anime character`
        );
        break;
        
      case 'person':
        // 真人：优先正式照片、肖像
        visualKeywords.push(
          `${primaryEntity} portrait`,
          `${primaryEntity} photo`,
          `${primaryEntity} official`
        );
        break;
        
      case 'place':
        // 地点：优先标志性景观、全景
        visualKeywords.push(
          `${primaryEntity} landmark`,
          `${primaryEntity} scenic view`,
          `${primaryEntity} architecture`
        );
        break;
        
      case 'object':
        // 物品：优先产品图、示意图
        visualKeywords.push(
          `${primaryEntity} product`,
          `${primaryEntity} design`,
          `${primaryEntity} illustration`
        );
        break;
    }
  }

  return {
    primaryEntity,
    visualKeywords: visualKeywords.slice(0, 3), // 限制关键词数量
    searchContext,
    searchIntent,
  };
}

/**
 * 检测AI回复是否需要自动增强 - 基于智能语义分析
 */
export function shouldAutoEnhance(content: string, hasSearchResults: boolean = false): {
  needsImages: boolean;
  needsCitations: boolean;
  keywords: string[];
  smartAnalysis?: ReturnType<typeof extractSmartKeywords>;
} {
  // 使用智能关键词提取
  const smartAnalysis = extractSmartKeywords(content);
  
  // 更严格的图片需求判断 - 只对明确的人物和角色查询搜索图片
  const needsImages = smartAnalysis.primaryEntity !== null && 
    (smartAnalysis.searchContext === 'person' || smartAnalysis.searchContext === 'character') &&
    // 确保是询问"是谁"类型的问题，而不是其他类型
    (/是谁|谁是|有照片|长什么样|介绍.*人|演员|明星/.test(content));
  
  // 引用生成逻辑：如果有搜索结果，就应该生成引用
  let needsCitations = false;
  
  // 优先级1：如果有webSearch结果，直接生成引用
  if (hasSearchResults) {
    needsCitations = true;
    console.log(`[AutoEnhancement] Will generate citations because we have ${hasSearchResults ? 'search results' : 'no search results'}`);
  } else {
    // 优先级2：检测内容中是否有需要引用的模式
    const citationPatterns = [
      /\d{4}年|\d+月\d+日|最新|据.*报道|研究表明|数据显示/,
      /百分之\d+|\d+%|\d+\.\d+%/,
      /官方|正式|发布|宣布|表示|指出/,
      /特点|特征|优势|缺点|功能|作用|影响|意义/,
      /历史|发展|起源|创立|成立|建立/,
      /位于|坐落|地处|分布|范围/,
      /包括|含有|具有|拥有|提供/,
    ];
    needsCitations = citationPatterns.some(pattern => pattern.test(content));
  }

  // 生成搜索关键词
  const keywords = smartAnalysis.primaryEntity 
    ? [smartAnalysis.primaryEntity, ...smartAnalysis.visualKeywords]
    : [];

  console.log(`[AutoEnhancement] Analysis for "${content.substring(0, 50)}...":`, {
    primaryEntity: smartAnalysis.primaryEntity,
    searchContext: smartAnalysis.searchContext,
    needsImages,
    needsCitations,
    hasSearchResults,
    keywords: keywords.slice(0, 3)
  });

  return {
    needsImages,
    needsCitations,
    keywords: keywords.slice(0, 3), // 限制数量
    smartAnalysis,
  };
}

/**
 * 自动增强AI回复 - 基于智能语义理解
 */
export async function autoEnhanceResponse(
  content: string,
  searchResults: any[] = [],
  settings: any
): Promise<AutoEnhancementResult> {
  const enhancement = shouldAutoEnhance(content, searchResults.length > 0);
  
  if (!enhancement.needsImages && !enhancement.needsCitations) {
    return {
      shouldEnhance: false,
      images: [],
      citations: [],
      enhancedContent: content,
    };
  }

  const images: ImageItem[] = [];
  const citations: Citation[] = [];
  let enhancedContent = content;

  try {
    // 1. 智能图片搜索 - 基于语义理解
    if (enhancement.needsImages && enhancement.smartAnalysis?.primaryEntity) {
      const webConfig = settings.webSearch;
      
      if (webConfig && webConfig.enabled && webConfig.imageSearchEnabled !== false) {
        const { primaryEntity, visualKeywords, searchContext, searchIntent } = enhancement.smartAnalysis;
        
        console.log(`[AutoEnhancement] Smart analysis:`, {
          entity: primaryEntity,
          context: searchContext,
          intent: searchIntent,
          keywords: visualKeywords
        });
        
        // 构建图片搜索配置
        const imageConfig = buildImageSearchConfig(webConfig);
        
        // 使用最佳关键词进行搜索
        const searchKeyword = visualKeywords[0] || primaryEntity;
        console.log(`[AutoEnhancement] Searching images for: "${searchKeyword}" (${searchContext})`);
        
        const imageResults = await smartImageSearch(
          searchKeyword,
          imageConfig,
          Math.min(webConfig.maxImageResults || 3, 3)
        );
        
        // 转换为ImageItem格式
        images.push(...imageResults.map(result => ({
          url: result.url,
          title: result.title,
          sourceUrl: result.sourceUrl,
          width: result.width,
          height: result.height,
          size: result.size,
        })));
        
        console.log(`[AutoEnhancement] Found ${images.length} images for ${searchContext} "${primaryEntity}"`);
      }
    }

    // 2. 自动引用生成 - 更积极地生成引用
    if (enhancement.needsCitations && searchResults.length > 0) {
      console.log(`[AutoEnhancement] Generating citations from ${searchResults.length} search results`);
      
      const smartCitations = generateSmartCitations(content, searchResults);
      enhancedContent = smartCitations.content;
      citations.push(...smartCitations.citations);
      
      console.log(`[AutoEnhancement] Generated ${citations.length} citations`);
    }

    return {
      shouldEnhance: images.length > 0 || citations.length > 0,
      images,
      citations,
      enhancedContent,
    };

  } catch (error) {
    console.error("[AutoEnhancement] Error during auto enhancement:", error);
    return {
      shouldEnhance: false,
      images: [],
      citations: [], // 即使出错也返回已生成的引用
      enhancedContent: content,
    };
  }
}

/**
 * 从设置构建图片搜索配置
 */
function buildImageSearchConfig(webConfig: any): ImageSearchConfig {
  const instances = webConfig.instances || [];
  
  // 优先使用Google Images
  const googleInstance = instances.find((i: any) => 
    i.provider === "google" && i.enabled && i.googleApiKey && i.googleSearchEngineId
  );
  if (googleInstance) {
    return {
      provider: "google",
      maxResults: 3,
      google: {
        apiKey: googleInstance.googleApiKey,
        searchEngineId: googleInstance.googleSearchEngineId,
        gl: googleInstance.googleGl,
        hl: googleInstance.googleHl || "zh-CN",
        safe: googleInstance.googleSafe || "off",
      },
    };
  }

  // 尝试使用Bing Images
  const bingInstance = instances.find((i: any) => 
    i.provider === "bing" && i.enabled && i.bingApiKey
  );
  if (bingInstance) {
    return {
      provider: "bing",
      maxResults: 3,
      bing: {
        apiKey: bingInstance.bingApiKey,
        mkt: bingInstance.bingMarket || "zh-CN",
        safeSearch: "Moderate",
      },
    };
  }

  // 使用DuckDuckGo作为备选
  return {
    provider: "duckduckgo",
    maxResults: 3,
    duckduckgo: {
      region: "cn-zh",
      safeSearch: "moderate",
    },
  };
}

/**
 * 检测内容中的实体（人物、地点、物品等）
 */
export function extractEntities(content: string): string[] {
  const entities: string[] = [];
  
  // 中文实体模式
  const patterns = [
    // 人名模式（通常2-4个字）
    /([A-Z][a-z]+\s+[A-Z][a-z]+)/g, // 英文人名
    /([^\w\s]{2,4})(?:是|为|担任|创立)/g, // 中文人名
    
    // 地名模式
    /([^\w\s]{2,8})(?:位于|坐落|建于)/g,
    
    // 产品/品牌模式
    /([A-Z][a-zA-Z0-9\s]{2,15})(?:是|为|推出)/g,
  ];

  for (const pattern of patterns) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      const entity = match[1]?.trim();
      if (entity && entity.length >= 2 && entity.length <= 15) {
        entities.push(entity);
      }
    }
  }

  return [...new Set(entities)]; // 去重
}