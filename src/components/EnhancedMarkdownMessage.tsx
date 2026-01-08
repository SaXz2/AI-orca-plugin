/**
 * EnhancedMarkdownMessage Component
 * 增强版Markdown消息组件，支持：
 * - 自动解析和显示图片
 * - 引用来源显示（底部折叠列表 + 内联标签）
 * - 智能内容增强
 * - 自动图片搜索和引用生成
 */

import MarkdownMessage from "./MarkdownMessage";
import ImageGallery, { type ImageItem } from "./ImageGallery";
import CitationList, { type Citation } from "./CitationList";
import InlineCitation, { type InlineCitationData } from "./InlineCitation";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useMemo, useCallback, Fragment } = React;

interface EnhancedMarkdownMessageProps {
  content: string;
  role: "user" | "assistant" | "tool";
  // 可选的图片和引用数据
  images?: ImageItem[];
  citations?: Citation[];
  // 是否自动解析内容中的图片和引用
  autoParseEnhancements?: boolean;
  // 是否启用自动增强（图片搜索和引用生成）- 已禁用
  enableAutoEnhancement?: boolean;
  // 搜索结果（用于生成引用）
  searchResults?: any[];
}

/**
 * 检测是否有内联图片的更智能逻辑
 * 只有当图片真正嵌入在段落中间时才认为是内联
 */
function hasInlineImagesInContent(content: string): boolean {
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 检查是否是图片行
    if (line.match(/^!\[.*?\]\(.*?\)$/)) {
      // 检查图片前后是否有非空的文本行（不是标题、不是空行）
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
      
      // 如果图片前后都有实质性文本内容（不是标题、不是图片描述），则认为是内联
      const hasPrevText = prevLine.length > 0 && 
                         !prevLine.startsWith('#') && 
                         !prevLine.startsWith('*') &&
                         !prevLine.match(/^!\[.*?\]\(.*?\)$/);
      
      const hasNextText = nextLine.length > 0 && 
                         !nextLine.startsWith('#') && 
                         !nextLine.startsWith('*') &&
                         !nextLine.match(/^!\[.*?\]\(.*?\)$/);
      
      // 只有当图片真正嵌入在文本段落中间时才认为是内联
      if (hasPrevText && hasNextText) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 从Markdown内容中解析图片
 */
function parseImagesFromMarkdown(content: string): { images: ImageItem[], hasInlineImages: boolean } {
  const images: ImageItem[] = [];
  
  // 匹配Markdown图片语法: ![alt](url "title")
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)(?:\s+"([^"]*)")?\)/g;
  let match;
  
  while ((match = imageRegex.exec(content)) !== null) {
    const [, alt, url, title] = match;
    
    // 只处理HTTP/HTTPS图片URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      images.push({
        url: url.trim(),
        title: title || alt || '图片',
        sourceUrl: url.trim(), // 图片本身就是来源
      });
    }
  }
  
  // 使用更智能的内联检测
  const hasInlineImages = hasInlineImagesInContent(content);
  
  return { images, hasInlineImages };
}

/**
 * 从Markdown内容中解析引用
 */
function parseCitationsFromMarkdown(content: string): Citation[] {
  const citations: Citation[] = [];
  
  // 匹配引用格式: [数字] 或 [标题](URL)
  const citationRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  let citationIndex = 1;
  
  while ((match = citationRegex.exec(content)) !== null) {
    const [, title, url] = match;
    
    // 只处理HTTP/HTTPS链接
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const domain = extractDomain(url);
      
      citations.push({
        id: `citation-${citationIndex}`,
        title: title || `引用 ${citationIndex}`,
        url: url.trim(),
        domain,
        type: "web",
      });
      
      citationIndex++;
    }
  }
  
  // 匹配参考来源部分
  const referenceSection = content.match(/---\s*\*\*参考来源:\*\*\s*([\s\S]*?)(?:\n\n|$)/);
  if (referenceSection) {
    const referencesText = referenceSection[1];
    const referenceRegex = /(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)([^\n]*)/g;
    let refMatch;
    
    while ((refMatch = referenceRegex.exec(referencesText)) !== null) {
      const [, number, title, url, extra] = refMatch;
      
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const domain = extractDomain(url);
        
        // 解析额外信息（域名、日期等）
        const domainMatch = extra.match(/\(([^)]+)\)/);
        const dateMatch = extra.match(/- ([^)]+)$/);
        
        citations.push({
          id: `ref-${number}`,
          title: title.trim(),
          url: url.trim(),
          domain: domainMatch ? domainMatch[1] : domain,
          publishedDate: dateMatch ? dateMatch[1] : undefined,
          type: "web",
        });
      }
    }
  }
  
  return citations;
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
 * 清理内容，移除已解析的图片和引用部分
 * 智能清理策略 - 避免重复显示图片
 */
function cleanContentForDisplay(content: string, images: ImageItem[], citations: Citation[], hasInlineImages: boolean): string {
  let cleanContent = content;
  
  // 移除参考来源部分
  cleanContent = cleanContent.replace(/---\s*\*\*参考来源:\*\*\s*[\s\S]*?(?=\n\n|$)/g, '');
  
  // 如果有图片且会在ImageGallery中显示，则移除Markdown中的图片避免重复
  if (images.length > 0) {
    const imageUrls = images.map(img => img.url);
    imageUrls.forEach(url => {
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 移除所有匹配的图片行
      const imageRegex = new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}[^)]*\\)`, 'g');
      cleanContent = cleanContent.replace(imageRegex, '');
    });
  }
  
  // 清理多余的空行
  cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();
  
  return cleanContent;
}

export default function EnhancedMarkdownMessage({
  content,
  role,
  images: providedImages,
  citations: providedCitations,
  autoParseEnhancements = true,
  enableAutoEnhancement = false, // 默认禁用自动增强
  searchResults = [],
}: EnhancedMarkdownMessageProps) {
  
  // 调试日志 - 检查searchResults是否正确传递
  useMemo(() => {
    if (searchResults && searchResults.length > 0) {
      console.log(`[EnhancedMarkdownMessage] Received ${searchResults.length} search results:`, searchResults);
    }
  }, [searchResults]);
  
  // 从searchResults生成内联引用数据
  const inlineCitations = useMemo((): InlineCitationData[] => {
    if (!searchResults || searchResults.length === 0) {
      return [];
    }
    
    console.log(`[EnhancedMarkdownMessage] Generating ${searchResults.length} inline citations`);
    
    return searchResults.map((result, index) => {
      let domain = "";
      try {
        const urlObj = new URL(result.url);
        domain = urlObj.hostname.replace(/^www\./, "");
      } catch {
        domain = result.url || "";
      }
      
      return {
        index: index + 1,
        title: result.title || `来源 ${index + 1}`,
        url: result.url || "",
        domain,
        snippet: result.content || result.snippet || "",
      };
    });
  }, [searchResults]);
  
  // 使用useCallback优化内容清理函数
  const cleanContent = useCallback((rawContent: string) => {
    let contentToUse = rawContent;
    
    // 只有当内容包含工具调用标记时才进行清理
    if (contentToUse.includes('<｜DSML｜') || contentToUse.includes('<function_calls>')) {
      // 清理完整的工具调用块 - 匹配从开始到结束的完整结构
      contentToUse = contentToUse.replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/g, '');
      
      // 清理单独的invoke标签（没有被function_calls包围的情况）
      contentToUse = contentToUse.replace(/<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/g, '');
      
      // 清理单独的parameter标签
      contentToUse = contentToUse.replace(/<｜DSML｜parameter[\s\S]*?<\/｜DSML｜parameter>/g, '');
      
      // 清理自闭合的invoke标签（如果存在）
      contentToUse = contentToUse.replace(/<｜DSML｜invoke[^>]*\/>/g, '');
      
      // 清理其他可能的工具调用格式
      contentToUse = contentToUse.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '');
      contentToUse = contentToUse.replace(/<invoke[\s\S]*?<\/invoke>/g, '');
      
      // 清理多余的空行和空白
      contentToUse = contentToUse.replace(/\n{3,}/g, '\n\n').trim();
      
      // 只在内容实际被清理时才输出日志
      if (contentToUse.length !== rawContent.length) {
        console.log(`[EnhancedMarkdownMessage] Cleaned content from ${rawContent.length} to ${contentToUse.length} chars`);
      }
    }
    
    return contentToUse;
  }, []);
  
  // 解析内容中的图片和引用 - 智能显示模式切换
  const { parsedImages, parsedCitations, cleanedContent, hasMarkdownImages } = useMemo(() => {
    const contentToUse = cleanContent(content);
    
    if (!autoParseEnhancements) {
      return {
        parsedImages: [],
        parsedCitations: [],
        cleanedContent: contentToUse,
        hasMarkdownImages: false,
      };
    }
    
    // 检测是否有Markdown图片
    const hasMarkdownImgs = contentToUse.includes('![') && contentToUse.includes('](');
    
    // 解析Markdown中的图片（仅用于检测，不用于显示）
    const { images: markdownImages } = hasMarkdownImgs
      ? parseImagesFromMarkdown(contentToUse)
      : { images: [] };
    
    // 只有当内容包含引用格式时才解析引用，避免不必要的正则操作
    const citations = (contentToUse.includes('[') && contentToUse.includes('](') && contentToUse.includes('http'))
      ? parseCitationsFromMarkdown(contentToUse)
      : [];
    
    // 只清理参考来源部分，保留Markdown图片让其自然显示
    const cleaned = (contentToUse.includes('---') && contentToUse.includes('**参考来源:**'))
      ? contentToUse.replace(/---\s*\*\*参考来源:\*\*\s*[\s\S]*?(?=\n\n|$)/g, '')
      : contentToUse;
    
    return {
      parsedImages: markdownImages,
      parsedCitations: citations,
      cleanedContent: cleaned.replace(/\n{3,}/g, '\n\n').trim(),
      hasMarkdownImages: markdownImages.length > 0,
    };
  }, [content, autoParseEnhancements, cleanContent]);
  
  // 智能图片显示策略：
  // - 如果有Markdown图片：不显示ImageGallery，让Markdown自己处理
  // - 如果只有AI工具图片：用ImageGallery显示
  const finalImages = useMemo(() => {
    // 如果内容中有Markdown图片，就不使用ImageGallery模式
    if (hasMarkdownImages) {
      return [];
    }
    
    // 只有AI工具调用的图片时，才使用ImageGallery
    if (!providedImages || providedImages.length === 0) {
      return [];
    }
    
    // 去重 - 使用更高效的去重算法
    const seen = new Set<string>();
    return providedImages.filter(img => {
      if (seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });
  }, [providedImages, hasMarkdownImages]);
  
  // 合并引用 - 优化依赖项
  const finalCitations = useMemo(() => {
    const allCitations = [
      ...(providedCitations || []), 
      ...parsedCitations,
    ];
    
    if (allCitations.length === 0) {
      return [];
    }
    
    // 去重 - 使用更高效的去重算法
    const seen = new Set<string>();
    return allCitations.filter(citation => {
      if (seen.has(citation.url)) return false;
      seen.add(citation.url);
      return true;
    });
  }, [providedCitations, parsedCitations]);
  
  return createElement(
    Fragment,
    null,
    // 智能图片显示策略：
    // - 有Markdown图片时：不显示ImageGallery，让Markdown自己处理图片
    // - 只有AI工具图片时：用ImageGallery统一显示
    finalImages.length > 0 && createElement(ImageGallery, {
      images: finalImages,
      maxDisplay: 6,
      // 智能布局选择：1-2张用行布局，3张以上用网格布局
      layout: finalImages.length <= 2 ? "row" : "grid",
    }),
    // Markdown内容（保留原始图片，让其自然显示）
    createElement(MarkdownMessage, {
      content: cleanedContent,
      role,
    }),
    // 内联引用标签栏 - 显示在内容后面，引用列表前面
    inlineCitations.length > 0 && createElement(
      "div",
      {
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          marginTop: "12px",
          paddingTop: "8px",
          borderTop: "1px dashed var(--orca-color-border)",
        },
      },
      createElement(
        "span",
        {
          style: {
            fontSize: "11px",
            color: "var(--orca-color-text-3)",
            marginRight: "4px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          },
        },
        createElement("i", { className: "ti ti-quote", style: { fontSize: "12px" } }),
        "来源:"
      ),
      ...inlineCitations.slice(0, 5).map((citation) => 
        createElement(InlineCitation, {
          key: citation.index,
          citation,
          showDomain: true,
          compact: false,
        })
      ),
      inlineCitations.length > 5 && createElement(
        "span",
        {
          style: {
            fontSize: "11px",
            color: "var(--orca-color-text-3)",
            padding: "2px 8px",
            background: "var(--orca-color-bg-3)",
            borderRadius: "4px",
            cursor: "pointer",
          },
          onClick: () => {
            // 展开更多引用 - 可以触发底部引用列表展开
          },
        },
        `+${inlineCitations.length - 5} 更多`
      )
    ),
    // 引用列表（在内容之后，默认折叠）
    finalCitations.length > 0 && createElement(CitationList, {
      citations: finalCitations,
      compact: false,
      defaultCollapsed: true, // 默认折叠
    })
  );
}