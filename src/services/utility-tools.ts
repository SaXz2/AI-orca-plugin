/**
 * Utility Tools - Wikipedia 和汇率查询
 * 免费 API，无需 API Key
 */

// ═══════════════════════════════════════════════════════════════════════════
// Wikipedia API
// ═══════════════════════════════════════════════════════════════════════════

export interface WikipediaResult {
  title: string;
  extract: string;
  fullContent?: string;
  contentParts?: string[];  // 分段内容
  totalLength?: number;     // 总长度
  url: string;
  thumbnail?: string;
}

/**
 * 将 HTML 表格转换为 Markdown 表格
 */
function convertHtmlTableToMarkdown(tableHtml: string): string {
  try {
    // 检查是否在浏览器环境
    if (typeof DOMParser === 'undefined') {
      // 非浏览器环境，使用正则表达式简单处理
      return convertTableWithRegex(tableHtml);
    }
    
    // 创建临时 DOM 解析器
    const parser = new DOMParser();
    const doc = parser.parseFromString(tableHtml, 'text/html');
    const table = doc.querySelector('table');
    
    if (!table) return convertTableWithRegex(tableHtml);
    
    const rows: string[][] = [];
    let maxCols = 0;
    
    // 提取所有行
    const allRows = table.querySelectorAll('tr');
    allRows.forEach(tr => {
      const cells: string[] = [];
      
      // 处理 th 和 td
      const allCells = tr.querySelectorAll('th, td');
      allCells.forEach(cell => {
        // 获取单元格文本内容
        let text = cell.textContent?.trim() || '';
        
        // 移除引用标记 [1], [2] 等
        text = text.replace(/\[\d+\]/g, '');
        
        // 清理多余空白
        text = text.replace(/\s+/g, ' ').trim();
        
        // 处理 colspan - 如果有 colspan，添加相应数量的空单元格
        const colspan = parseInt(cell.getAttribute('colspan') || '1');
        cells.push(text);
        for (let i = 1; i < colspan; i++) {
          cells.push(''); // 添加空单元格
        }
        
        // 注意：rowspan 在简单的 Markdown 表格中无法完美表示
        // 我们只能在当前行显示内容
      });
      
      if (cells.length > 0) {
        rows.push(cells);
        maxCols = Math.max(maxCols, cells.length);
      }
    });
    
    if (rows.length === 0) return '';
    
    // 确保所有行的列数一致
    rows.forEach(row => {
      while (row.length < maxCols) {
        row.push('');
      }
    });
    
    // 构建 Markdown 表格
    const lines: string[] = [];
    
    // 第一行（表头）
    if (rows.length > 0) {
      lines.push('| ' + rows[0].join(' | ') + ' |');
      
      // 分隔线
      lines.push('| ' + rows[0].map(() => '---').join(' | ') + ' |');
      
      // 数据行
      for (let i = 1; i < rows.length; i++) {
        lines.push('| ' + rows[i].join(' | ') + ' |');
      }
    }
    
    return '\n' + lines.join('\n') + '\n';
  } catch (error) {
    console.warn('[Wikipedia] Failed to convert table with DOM:', error);
    return convertTableWithRegex(tableHtml);
  }
}

/**
 * 使用正则表达式转换表格（备用方案）
 */
function convertTableWithRegex(tableHtml: string): string {
  try {
    const rows: string[][] = [];
    
    // 提取所有 <tr> 标签内容
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    
    while ((trMatch = trRegex.exec(tableHtml)) !== null) {
      const rowHtml = trMatch[1];
      const cells: string[] = [];
      
      // 提取 th 和 td
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        let text = cellMatch[1];
        
        // 移除所有 HTML 标签
        text = text.replace(/<[^>]+>/g, '');
        
        // 解码 HTML 实体
        text = text
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&nbsp;/g, ' ');
        
        // 移除引用标记
        text = text.replace(/\[\d+\]/g, '');
        
        // 清理空白
        text = text.replace(/\s+/g, ' ').trim();
        
        cells.push(text);
      }
      
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    
    if (rows.length === 0) {
      // 完全失败，返回纯文本
      let text = tableHtml.replace(/<[^>]+>/g, ' ');
      text = text.replace(/\s+/g, ' ').trim();
      return '\n[表格内容] ' + text + '\n';
    }
    
    // 确保所有行列数一致
    const maxCols = Math.max(...rows.map(r => r.length));
    rows.forEach(row => {
      while (row.length < maxCols) {
        row.push('');
      }
    });
    
    // 构建 Markdown 表格
    const lines: string[] = [];
    lines.push('| ' + rows[0].join(' | ') + ' |');
    lines.push('| ' + rows[0].map(() => '---').join(' | ') + ' |');
    
    for (let i = 1; i < rows.length; i++) {
      lines.push('| ' + rows[i].join(' | ') + ' |');
    }
    
    return '\n' + lines.join('\n') + '\n';
  } catch (error) {
    console.warn('[Wikipedia] Failed to convert table with regex:', error);
    return '\n[表格内容无法解析]\n';
  }
}

/**
 * 清理 HTML 标签但保留表格结构
 */
function cleanHtmlKeepTables(html: string): string {
  let text = html;
  
  // 先提取所有表格
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
  const tables = text.match(tableRegex) || [];
  const tablePlaceholders: { [key: string]: string } = {};
  
  // 用占位符替换表格
  tables.forEach((table, index) => {
    const placeholder = `__TABLE_PLACEHOLDER_${index}__`;
    tablePlaceholders[placeholder] = convertHtmlTableToMarkdown(table);
    text = text.replace(table, placeholder);
  });
  
  // 移除其他 HTML 标签
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<p[^>]*>/gi, '');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<div[^>]*>/gi, '');
  text = text.replace(/<h([1-6])[^>]*>/gi, (match, level) => '\n' + '#'.repeat(parseInt(level)) + ' ');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '- ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<ul[^>]*>/gi, '\n');
  text = text.replace(/<\/ul>/gi, '\n');
  text = text.replace(/<ol[^>]*>/gi, '\n');
  text = text.replace(/<\/ol>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  
  // 恢复表格（已转换为 Markdown）
  Object.keys(tablePlaceholders).forEach(placeholder => {
    text = text.replace(placeholder, tablePlaceholders[placeholder]);
  });
  
  // 解码 HTML 实体
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
  
  // 清理多余的空行
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}

/**
 * 将长文本按段落智能分段
 * @param text 原始文本
 * @param maxCharsPerPart 每段最大字符数
 */
function splitContentIntoParts(text: string, maxCharsPerPart: number = 8000): string[] {
  if (text.length <= maxCharsPerPart) {
    return [text];
  }

  const parts: string[] = [];
  const paragraphs = text.split(/\n\n+/); // 按段落分割
  let currentPart = "";

  for (const paragraph of paragraphs) {
    // 如果单个段落就超过限制，需要强制分割
    if (paragraph.length > maxCharsPerPart) {
      if (currentPart) {
        parts.push(currentPart.trim());
        currentPart = "";
      }
      
      // 按句子分割长段落
      const sentences = paragraph.split(/([。！？.!?]+)/);
      let sentencePart = "";
      
      for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i] + (sentences[i + 1] || "");
        
        if (sentencePart.length + sentence.length > maxCharsPerPart) {
          if (sentencePart) {
            parts.push(sentencePart.trim());
          }
          sentencePart = sentence;
        } else {
          sentencePart += sentence;
        }
      }
      
      if (sentencePart) {
        currentPart = sentencePart;
      }
      continue;
    }

    // 如果加上这个段落会超过限制，先保存当前部分
    if (currentPart.length + paragraph.length + 2 > maxCharsPerPart) {
      if (currentPart) {
        parts.push(currentPart.trim());
      }
      currentPart = paragraph;
    } else {
      currentPart += (currentPart ? "\n\n" : "") + paragraph;
    }
  }

  // 添加最后一部分
  if (currentPart) {
    parts.push(currentPart.trim());
  }

  return parts;
}

/**
 * 搜索 Wikipedia
 * @param query 搜索关键词
 * @param lang 语言代码，默认 zh（中文）
 * @param fullContent 是否获取完整内容，默认 true
 * @param fallback 是否在当前语言没有结果时尝试英文，默认 true
 */
export async function searchWikipedia(
  query: string,
  lang: string = "zh",
  fullContent: boolean = true,
  fallback: boolean = true
): Promise<WikipediaResult | null> {
  try {
    console.log(`[Wikipedia] Searching: ${query} (${lang})`);
    
    // 先搜索获取最相关的页面标题
    const searchUrl = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", query);
    searchUrl.searchParams.set("srlimit", "1");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    const searchResponse = await fetch(searchUrl.toString());
    if (!searchResponse.ok) {
      throw new Error(`Wikipedia 搜索失败: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const searchResults = searchData.query?.search;
    
    if (!searchResults || searchResults.length === 0) {
      // 如果允许 fallback 且不是英文，尝试英文 Wikipedia
      if (fallback && lang !== "en") {
        console.log(`[Wikipedia] No results in ${lang}, trying English...`);
        return await searchWikipedia(query, "en", fullContent, false); // 避免无限递归
      }
      return null;
    }

    const pageTitle = searchResults[0].title;
    
    // 获取页面摘要和图片
    const summaryUrl = new URL(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`);
    
    const summaryResponse = await fetch(summaryUrl.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "OrcaAIChat/1.0",
      },
    });

    if (!summaryResponse.ok) {
      throw new Error(`Wikipedia 摘要获取失败: ${summaryResponse.status}`);
    }

    const summaryData = await summaryResponse.json();
    
    let fullContentText: string | undefined;
    let contentParts: string[] | undefined;
    let totalLength: number | undefined;
    
    // 如果需要完整内容，获取页面的完整纯文本并分段
    if (fullContent) {
      try {
        // 方案1: 尝试获取带 HTML 的内容（保留表格）
        const htmlUrl = new URL(`https://${lang}.wikipedia.org/w/api.php`);
        htmlUrl.searchParams.set("action", "query");
        htmlUrl.searchParams.set("prop", "extracts");
        htmlUrl.searchParams.set("titles", pageTitle);
        htmlUrl.searchParams.set("format", "json");
        htmlUrl.searchParams.set("origin", "*");
        // 不设置 explaintext，获取 HTML 格式

        const htmlResponse = await fetch(htmlUrl.toString());
        if (htmlResponse.ok) {
          const htmlData = await htmlResponse.json();
          const pages = htmlData.query?.pages;
          if (pages) {
            const pageId = Object.keys(pages)[0];
            const htmlContent = pages[pageId]?.extract;
            
            if (htmlContent) {
              // 清理 HTML 但保留表格结构
              fullContentText = cleanHtmlKeepTables(htmlContent);
              
              totalLength = fullContentText.length;
              const wordCount = fullContentText.split(/\s+/).length;
              
              // 智能分段
              contentParts = splitContentIntoParts(fullContentText, 8000);
              
              console.log(`[Wikipedia] Retrieved full content with tables (${lang}): ${totalLength} chars, ~${wordCount} words, split into ${contentParts.length} parts`);
            }
          }
        }
      } catch (error) {
        console.warn("[Wikipedia] Failed to fetch full content:", error);
        // 如果获取完整内容失败，继续使用摘要
      }
    }
    
    console.log(`[Wikipedia] Found: ${summaryData.title} (${lang})`);
    
    return {
      title: summaryData.title || pageTitle,
      extract: summaryData.extract || searchResults[0].snippet?.replace(/<[^>]*>/g, "") || "",
      fullContent: fullContentText,
      contentParts,
      totalLength,
      url: summaryData.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
      thumbnail: summaryData.thumbnail?.source,
    };
  } catch (error: any) {
    console.error("[Wikipedia] Error:", error);
    throw new Error(`Wikipedia 查询失败: ${error.message}`);
  }
}

/**
 * 格式化 Wikipedia 结果
 */
export function formatWikipediaResult(result: WikipediaResult): string {
  const lines: string[] = [];
  
  lines.push(`📚 **${result.title}**`);
  lines.push("");
  
  if (result.thumbnail) {
    lines.push(`![${result.title}](${result.thumbnail})`);
    lines.push("");
  }
  
  // 如果有分段内容，逐段返回
  if (result.contentParts && result.contentParts.length > 0) {
    lines.push(`📖 **完整内容** (共 ${result.totalLength?.toLocaleString()} 字符，分 ${result.contentParts.length} 段)`);
    lines.push("");
    
    result.contentParts.forEach((part, index) => {
      if (result.contentParts!.length > 1) {
        lines.push(`--- **第 ${index + 1}/${result.contentParts!.length} 段** ---`);
        lines.push("");
      }
      lines.push(part);
      lines.push("");
    });
  } else if (result.fullContent) {
    // 如果有完整内容但没有分段（内容较短）
    lines.push(result.fullContent);
    lines.push("");
  } else {
    // 只有摘要
    lines.push(result.extract);
    lines.push("");
  }
  
  lines.push(`🔗 [查看原文](${result.url})`);
  
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════
// 汇率 API (使用 exchangerate-api.com 免费接口)
// ═══════════════════════════════════════════════════════════════════════════

export interface ExchangeRateResult {
  from: string;
  to: string;
  rate: number;
  amount: number;
  result: number;
  timestamp: string;
}

// 常用货币代码映射
const CURRENCY_ALIASES: Record<string, string> = {
  // 中文
  "人民币": "CNY", "元": "CNY", "rmb": "CNY",
  "美元": "USD", "美金": "USD", "刀": "USD",
  "欧元": "EUR",
  "英镑": "GBP",
  "日元": "JPY", "日币": "JPY",
  "韩元": "KRW", "韩币": "KRW",
  "港币": "HKD", "港元": "HKD",
  "台币": "TWD", "新台币": "TWD",
  "澳元": "AUD", "澳币": "AUD",
  "加元": "CAD", "加币": "CAD",
  "新加坡元": "SGD", "新币": "SGD",
  "瑞士法郎": "CHF",
  "卢布": "RUB", "俄罗斯卢布": "RUB",
  "印度卢比": "INR",
  "泰铢": "THB",
  "越南盾": "VND",
  "马来西亚林吉特": "MYR",
  "比特币": "BTC",
  // 英文简写
  "dollar": "USD", "dollars": "USD",
  "euro": "EUR", "euros": "EUR",
  "pound": "GBP", "pounds": "GBP",
  "yen": "JPY",
  "yuan": "CNY",
};

/**
 * 解析货币代码
 */
function parseCurrencyCode(input: string): string {
  const normalized = input.trim().toLowerCase();
  
  // 先检查别名
  if (CURRENCY_ALIASES[normalized]) {
    return CURRENCY_ALIASES[normalized];
  }
  
  // 如果是3字母代码，直接返回大写
  if (/^[a-zA-Z]{3}$/.test(input)) {
    return input.toUpperCase();
  }
  
  return input.toUpperCase();
}

/**
 * 查询汇率并转换
 * @param amount 金额
 * @param from 源货币
 * @param to 目标货币
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<ExchangeRateResult> {
  const fromCode = parseCurrencyCode(from);
  const toCode = parseCurrencyCode(to);
  
  console.log(`[Currency] Converting ${amount} ${fromCode} to ${toCode}`);
  
  try {
    // 使用免费的 exchangerate-api
    const url = `https://api.exchangerate-api.com/v4/latest/${fromCode}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`不支持的货币代码: ${fromCode}`);
      }
      throw new Error(`汇率 API 错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.rates || !data.rates[toCode]) {
      throw new Error(`不支持的目标货币: ${toCode}`);
    }
    
    const rate = data.rates[toCode];
    const result = amount * rate;
    
    console.log(`[Currency] Rate: 1 ${fromCode} = ${rate} ${toCode}`);
    
    return {
      from: fromCode,
      to: toCode,
      rate,
      amount,
      result,
      timestamp: data.date || new Date().toISOString().split("T")[0],
    };
  } catch (error: any) {
    console.error("[Currency] Error:", error);
    throw new Error(`汇率查询失败: ${error.message}`);
  }
}

/**
 * 获取多种货币汇率
 */
export async function getExchangeRates(
  base: string,
  targets?: string[]
): Promise<Record<string, number>> {
  const baseCode = parseCurrencyCode(base);
  
  console.log(`[Currency] Getting rates for ${baseCode}`);
  
  try {
    const url = `https://api.exchangerate-api.com/v4/latest/${baseCode}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`汇率 API 错误: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (targets && targets.length > 0) {
      const filtered: Record<string, number> = {};
      for (const target of targets) {
        const code = parseCurrencyCode(target);
        if (data.rates[code]) {
          filtered[code] = data.rates[code];
        }
      }
      return filtered;
    }
    
    return data.rates;
  } catch (error: any) {
    console.error("[Currency] Error:", error);
    throw new Error(`汇率查询失败: ${error.message}`);
  }
}

/**
 * 格式化汇率结果
 */
export function formatCurrencyResult(result: ExchangeRateResult): string {
  const lines: string[] = [];
  
  lines.push(`💱 **汇率转换**`);
  lines.push("");
  lines.push(`**${result.amount.toLocaleString()} ${result.from}** = **${result.result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${result.to}**`);
  lines.push("");
  lines.push(`📊 汇率: 1 ${result.from} = ${result.rate.toFixed(4)} ${result.to}`);
  lines.push(`📅 数据日期: ${result.timestamp}`);
  
  return lines.join("\n");
}

/**
 * 格式化多货币汇率
 */
export function formatExchangeRates(base: string, rates: Record<string, number>): string {
  const lines: string[] = [];
  
  lines.push(`💱 **${base} 汇率**`);
  lines.push("");
  
  // 常用货币优先显示
  const priorityCurrencies = ["USD", "CNY", "EUR", "GBP", "JPY", "HKD", "KRW"];
  const sortedCurrencies = Object.keys(rates).sort((a, b) => {
    const aIndex = priorityCurrencies.indexOf(a);
    const bIndex = priorityCurrencies.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
  
  for (const currency of sortedCurrencies.slice(0, 10)) {
    lines.push(`• 1 ${base} = ${rates[currency].toFixed(4)} ${currency}`);
  }
  
  if (sortedCurrencies.length > 10) {
    lines.push(`\n... 共 ${sortedCurrencies.length} 种货币`);
  }
  
  return lines.join("\n");
}
