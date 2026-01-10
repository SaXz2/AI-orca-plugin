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
  url: string;
  thumbnail?: string;
}

/**
 * 搜索 Wikipedia
 * @param query 搜索关键词
 * @param lang 语言代码，默认 zh（中文）
 */
export async function searchWikipedia(
  query: string,
  lang: string = "zh"
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
      // 尝试英文 Wikipedia
      if (lang !== "en") {
        console.log(`[Wikipedia] No results in ${lang}, trying English...`);
        return await searchWikipedia(query, "en");
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
    
    console.log(`[Wikipedia] Found: ${summaryData.title}`);
    
    return {
      title: summaryData.title || pageTitle,
      extract: summaryData.extract || searchResults[0].snippet?.replace(/<[^>]*>/g, "") || "",
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
  
  lines.push(result.extract);
  lines.push("");
  lines.push(`🔗 [查看完整词条](${result.url})`);
  
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
