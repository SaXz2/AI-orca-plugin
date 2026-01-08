/**
 * Citation Service
 * 处理AI回复中的引用来源，类似ChatGPT的引用功能
 */

export interface Citation {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
  domain?: string;
  type: "web" | "image" | "document" | "note";
}

export interface CitationContext {
  citations: Citation[];
  citationMap: Map<string, Citation>; // id -> citation
}

/**
 * 从搜索结果创建引用
 */
export function createCitationsFromSearchResults(
  searchResults: any[],
  type: "web" | "image" = "web"
): Citation[] {
  console.log(`[CitationService] Creating ${type} citations from results:`, searchResults);
  
  return searchResults.map((result, index) => {
    // 处理不同格式的搜索结果
    const url = result.url || result.sourceUrl || result.link || "";
    const title = result.title || result.name || `${type === "web" ? "网页" : "图片"} ${index + 1}`;
    const snippet = result.content || result.snippet || result.description || "";
    const domain = extractDomain(url);
    
    console.log(`[CitationService] Creating citation ${index + 1}:`, {
      title: title.substring(0, 50),
      url: url.substring(0, 50),
      domain,
      hasSnippet: !!snippet
    });
    
    return {
      id: `${type}-${index + 1}`,
      title,
      url,
      snippet,
      publishedDate: result.publishedDate || result.date,
      domain,
      type,
    };
  });
}

/**
 * 从URL提取域名
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * 在AI回复中插入引用标记
 * 将文本中的相关内容标记为引用，类似ChatGPT的引用方式
 */
export function insertCitationMarkers(
  content: string,
  citations: Citation[]
): string {
  if (citations.length === 0) return content;

  let markedContent = content;
  
  // 为每个引用创建标记，使用更智能的匹配策略
  citations.forEach((citation, index) => {
    const citationNumber = index + 1;
    
    // 策略1: 匹配引用标题中的关键词
    if (citation.title) {
      const titleKeywords = extractKeywordsFromTitle(citation.title);
      for (const keyword of titleKeywords) {
        if (keyword.length > 2 && markedContent.includes(keyword)) {
          // 在包含关键词的句子末尾添加引用
          const sentenceRegex = new RegExp(`([^。！？.!?]*${escapeRegex(keyword)}[^。！？.!?]*[。！？.!?])`, 'g');
          markedContent = markedContent.replace(sentenceRegex, (match) => {
            // 避免重复添加引用标记
            if (match.includes(`[${citationNumber}]`)) return match;
            return match + `[${citationNumber}]`;
          });
          break; // 每个引用只标记一次
        }
      }
    }
    
    // 策略2: 匹配引用摘要中的关键概念
    if (citation.snippet && !markedContent.includes(`[${citationNumber}]`)) {
      const snippetKeywords = extractKeywords(citation.snippet);
      for (const keyword of snippetKeywords.slice(0, 3)) { // 只取前3个关键词
        if (keyword.length > 3 && markedContent.includes(keyword)) {
          const sentenceRegex = new RegExp(`([^。！？.!?]*${escapeRegex(keyword)}[^。！？.!?]*[。！？.!?])`, 'g');
          markedContent = markedContent.replace(sentenceRegex, (match) => {
            if (match.includes(`[${citationNumber}]`)) return match;
            return match + `[${citationNumber}]`;
          });
          break;
        }
      }
    }
  });

  // 策略3: 为没有匹配到的引用，在相关段落末尾添加
  citations.forEach((citation, index) => {
    const citationNumber = index + 1;
    if (!markedContent.includes(`[${citationNumber}]`)) {
      // 在第一个段落末尾添加引用
      const firstParagraphMatch = markedContent.match(/^[^。！？.!?]+[。！？.!?]/);
      if (firstParagraphMatch) {
        const firstSentence = firstParagraphMatch[0];
        markedContent = markedContent.replace(firstSentence, firstSentence + `[${citationNumber}]`);
      }
    }
  });

  return markedContent;
}

/**
 * 从标题中提取关键词（更精确）
 */
function extractKeywordsFromTitle(title: string): string[] {
  // 移除常见的网站后缀和格式
  const cleanTitle = title
    .replace(/\s*-\s*(Wikipedia|百度百科|知乎|官网|官方网站).*$/i, '')
    .replace(/\s*\|\s*.*$/i, '') // 移除 | 后的内容
    .replace(/\s*_\s*.*$/i, '') // 移除 _ 后的内容
    .trim();
  
  // 分割并过滤关键词
  const words = cleanTitle.split(/[\s，,。.！!？?；;：:]+/)
    .map(w => w.trim())
    .filter(w => w.length > 1)
    .filter(w => !isStopWord(w));
  
  return words.slice(0, 5); // 返回前5个关键词
}

/**
 * 检查是否为停用词
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    // 中文停用词
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "什么", "可以", "这个", "我们", "能够", "如果", "因为", "所以", "但是", "然后", "还是", "只是", "已经", "可能", "应该", "需要", "通过", "进行", "实现", "提供", "包括", "具有", "成为", "作为", "由于", "根据", "对于", "关于", "以及", "或者", "而且", "不过", "虽然", "尽管", "无论", "不管", "除了", "除非", "直到", "当",
    // 英文停用词
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "up", "about", "into", "through", "during", "before", "after", "above", "below", "between", "among", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "must", "shall",
    // 网站相关词汇
    "wiki", "wikipedia", "baidu", "zhihu", "google", "bing", "search", "page", "site", "website", "com", "org", "net", "cn", "html", "http", "https", "www"
  ]);
  
  return stopWords.has(word.toLowerCase());
}

/**
 * 提取文本中的关键词
 */
function extractKeywords(text: string): string[] {
  // 简单的关键词提取，去除常见停用词
  const stopWords = new Set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "什么", "可以", "这个", "我们", "能够", "如果", "因为", "所以", "但是", "然后", "还是", "只是", "已经", "可能", "应该", "需要", "通过", "进行", "实现", "提供", "包括", "具有", "成为", "作为", "由于", "根据", "对于", "关于", "以及", "或者", "而且", "不过", "虽然", "尽管", "无论", "不管", "除了", "除非", "直到", "当", "while", "when", "where", "what", "how", "why", "who", "which", "that", "this", "these", "those", "a", "an", "the", "and", "or", "but", "so", "if", "then", "else", "for", "with", "by", "from", "to", "of", "in", "on", "at", "as", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "must"
  ]);
  
  const words = text.split(/[\s，,。.！!？?；;：:]+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()));
  
  // 返回出现频率较高的词
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });
  
  return Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 生成引用列表的Markdown格式
 */
export function formatCitationList(citations: Citation[]): string {
  if (citations.length === 0) return "";

  const lines: string[] = [];
  lines.push("\n---");
  lines.push("**参考来源:**");
  lines.push("");

  citations.forEach((citation, index) => {
    const number = index + 1;
    const domain = citation.domain ? ` (${citation.domain})` : "";
    const date = citation.publishedDate ? ` - ${citation.publishedDate}` : "";
    
    lines.push(`${number}. [${citation.title}](${citation.url})${domain}${date}`);
    
    if (citation.snippet && citation.snippet.length > 0) {
      // 限制摘要长度
      const snippet = citation.snippet.length > 150 
        ? citation.snippet.substring(0, 150) + "..."
        : citation.snippet;
      lines.push(`   > ${snippet}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * 创建引用上下文
 */
export function createCitationContext(citations: Citation[]): CitationContext {
  const citationMap = new Map<string, Citation>();
  
  citations.forEach(citation => {
    citationMap.set(citation.id, citation);
  });

  return {
    citations,
    citationMap,
  };
}

/**
 * 智能引用生成 - 根据AI回复内容自动添加引用
 * 改进版：更好地处理句内引用标记
 */
export function generateSmartCitations(
  aiResponse: string,
  searchResults: any[],
  imageResults: any[] = []
): { content: string; citations: Citation[] } {
  const allCitations: Citation[] = [];
  
  // 从搜索结果创建引用
  if (searchResults.length > 0) {
    console.log(`[CitationService] Creating citations from ${searchResults.length} search results`);
    const webCitations = createCitationsFromSearchResults(searchResults, "web");
    allCitations.push(...webCitations);
    console.log(`[CitationService] Created ${webCitations.length} web citations`);
  }
  
  // 从图片结果创建引用
  if (imageResults.length > 0) {
    console.log(`[CitationService] Creating citations from ${imageResults.length} image results`);
    const imageCitations = createCitationsFromSearchResults(imageResults, "image");
    allCitations.push(...imageCitations);
    console.log(`[CitationService] Created ${imageCitations.length} image citations`);
  }
  
  if (allCitations.length === 0) {
    console.log(`[CitationService] No citations to generate`);
    return { content: aiResponse, citations: [] };
  }
  
  console.log(`[CitationService] Total citations: ${allCitations.length}`);
  
  // 在回复中插入引用标记 - 使用更简单的策略
  let contentWithCitations = aiResponse;
  
  // 策略：在每个段落末尾添加引用标记
  const paragraphs = contentWithCitations.split('\n\n');
  const citationsPerParagraph = Math.ceil(allCitations.length / Math.max(paragraphs.length, 1));
  
  let citationIndex = 0;
  const updatedParagraphs = paragraphs.map((paragraph, paragraphIndex) => {
    if (paragraph.trim().length === 0) return paragraph;
    
    // 为每个段落分配引用
    const citationsForThisParagraph = allCitations.slice(
      citationIndex, 
      citationIndex + citationsPerParagraph
    );
    
    if (citationsForThisParagraph.length > 0) {
      const citationNumbers = citationsForThisParagraph.map((_, idx) => citationIndex + idx + 1);
      const citationMarkers = citationNumbers.map(num => `[${num}]`).join('');
      
      // 在段落末尾添加引用标记
      const trimmedParagraph = paragraph.trim();
      const updatedParagraph = trimmedParagraph + citationMarkers;
      
      citationIndex += citationsForThisParagraph.length;
      
      console.log(`[CitationService] Added citations ${citationNumbers.join(', ')} to paragraph ${paragraphIndex + 1}`);
      return updatedParagraph;
    }
    
    return paragraph;
  });
  
  contentWithCitations = updatedParagraphs.join('\n\n');
  
  console.log(`[CitationService] Generated content with ${allCitations.length} citations`);
  
  return {
    content: contentWithCitations,
    citations: allCitations,
  };
}

/**
 * 从网络搜索结果生成带引用的回复
 * 专门用于处理webSearch工具的结果
 */
export function generateCitationsFromWebSearch(
  searchResponse: any
): Citation[] {
  if (!searchResponse || !searchResponse.results) {
    return [];
  }
  
  return searchResponse.results.map((result: any, index: number) => ({
    id: `web-${index + 1}`,
    title: result.title || `搜索结果 ${index + 1}`,
    url: result.url || "",
    snippet: result.content || result.snippet,
    publishedDate: result.publishedDate,
    domain: extractDomain(result.url || ""),
    type: "web" as const,
  }));
}

/**
 * 解析消息中的引用标记
 * 用于在UI中显示引用信息
 */
export function parseCitationMarkers(content: string): {
  content: string;
  citationNumbers: number[];
} {
  const citationNumbers: number[] = [];
  const citationRegex = /\[(\d+)\]/g;
  
  let match;
  while ((match = citationRegex.exec(content)) !== null) {
    const number = parseInt(match[1], 10);
    if (!citationNumbers.includes(number)) {
      citationNumbers.push(number);
    }
  }
  
  return {
    content,
    citationNumbers: citationNumbers.sort((a, b) => a - b),
  };
}

/**
 * 验证引用URL的有效性
 */
export async function validateCitationUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      mode: 'no-cors' // 避免CORS问题
    });
    return true; // 如果没有抛出异常，说明URL可访问
  } catch {
    return false;
  }
}

/**
 * 引用统计信息
 */
export interface CitationStats {
  totalCitations: number;
  webCitations: number;
  imageCitations: number;
  documentCitations: number;
  noteCitations: number;
  domains: string[];
}

/**
 * 计算引用统计信息
 */
export function calculateCitationStats(citations: Citation[]): CitationStats {
  const stats: CitationStats = {
    totalCitations: citations.length,
    webCitations: 0,
    imageCitations: 0,
    documentCitations: 0,
    noteCitations: 0,
    domains: [],
  };
  
  const domainSet = new Set<string>();
  
  citations.forEach(citation => {
    switch (citation.type) {
      case "web":
        stats.webCitations++;
        break;
      case "image":
        stats.imageCitations++;
        break;
      case "document":
        stats.documentCitations++;
        break;
      case "note":
        stats.noteCitations++;
        break;
    }
    
    if (citation.domain) {
      domainSet.add(citation.domain);
    }
  });
  
  stats.domains = Array.from(domainSet).sort();
  
  return stats;
}