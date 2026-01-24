/**
 * AI Tools for Orca AI Chat
 * This file defines the available tools for the AI model and their implementations.
 * It interacts with the Orca Host API to perform actions like searching, reading, 
 * and creating blocks.
 */

import type { OpenAITool } from "./openai-client";
import {
  searchBlocksByTag,
  searchBlocksByText,
  queryBlocksByTag,
  queryBlocksAdvanced,
  getTagSchema,
  getPageByName,
  searchBlocksByReference,
  getRecentJournals,
  getJournalByDate,
  getJournalsByDateRange,
  getTodayJournal,
  getCachedTagSchema,
} from "./search-service";
import {
  formatBlockResult,
  addLinkPreservationNote
} from "../utils/block-link-enhancer";
import type { 
  QueryCondition, 
  QueryCombineMode 
} from "../utils/query-types";
import { uiStore } from "../store/ui-store";
import { searchWeb, formatSearchResults, type SearchConfig } from "./web-search-service";
import { isImageSearchEnabled, isScriptAnalysisEnabled, isWebSearchEnabled, isWikipediaEnabled, isCurrencyEnabled } from "../store/tool-store";
import { 
  getScriptAnalysisTools, 
  handleScriptAnalysisTool 
} from "./script-analysis-tool";
import {
  searchWikipedia,
  formatWikipediaResult,
  convertCurrency,
  formatCurrencyResult,
  getExchangeRates,
  formatExchangeRates,
} from "./utility-tools";
import {
  fetchWebContent,
  formatFetchedContent,
} from "./web-fetcher";

// 获取 Skill 工具列表（新的 SkillsManager 实现）
function getSkillTools(): OpenAITool[] {
  // 动态生成 Skill 工具列表
  // 注意：这是同步函数，Skills 列表需要在初始化时加载
  // 实际的 Skills 列表由 AiChatPanel 在发送消息时动态获取
  return [];
}

/**
 * 三层渐进加载架构
 * Level 1: 元数据（启动时加载）- 名称、描述、标签
 * Level 2: 指令（请求匹配时加载）- 详细使用指南
 * Level 3: 资源（执行时加载）- 脚本、模板、文档
 */

/**
 * 将 Skill ID 转换为符合 OpenAI 规范的工具名称
 * OpenAI 要求工具名称只能包含：字母、数字、下划线、连字符
 * 
 * 转换规则：
 * 1. 移除所有非 ASCII 字符（包括中文）
 * 2. 将空格替换为下划线
 * 3. 如果结果为空，使用 skill_ + 索引
 */
function sanitizeSkillName(skillId: string, index: number): string {
  // 移除所有非字母、数字、下划线、连字符的字符
  let sanitized = skillId.replace(/[^a-zA-Z0-9_-]/g, '');
  
  // 移除连续的下划线
  sanitized = sanitized.replace(/_+/g, '_');
  
  // 移除开头和结尾的下划线
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  
  // 如果结果为空，使用索引作为名称
  if (!sanitized) {
    return `skill_${index}`;
  }
  
  // 确保以字母开头（如果以数字开头，添加 s 前缀）
  if (/^\d/.test(sanitized)) {
    sanitized = 's' + sanitized;
  }
  
  return `skill_${sanitized}`;
}

/**
 * Level 1: 获取 Skill 元数据列表（轻量级）
 * 用于 AI 发现可用的 Skills，成本极低
 */
export async function getSkillMetadataAsync(): Promise<OpenAITool[]> {
  try {
    const { listSkills, getSkill } = await import("./skills-manager");
    const skillIds = await listSkills();
    const tools: OpenAITool[] = [];
    
    for (let i = 0; i < skillIds.length; i++) {
      const skillId = skillIds[i];
      try {
        const skill = await getSkill(skillId);
        if (!skill) continue;
        
        // 生成符合 OpenAI 规范的工具名称
        const toolName = sanitizeSkillName(skillId, i);
        
        // 验证工具名称是否符合规范
        if (!/^[a-zA-Z0-9_-]+$/.test(toolName)) {
          console.error(`[SkillTools] Generated invalid tool name: "${toolName}" from skillId: "${skillId}"`);
          continue; // 跳过无效的工具
        }
        
        console.log(`[SkillTools] Skill "${skillId}" → tool name "${toolName}"`);
        
        // Level 1: 只返回元数据，不包含详细指令
        // 在 description 中包含原始 Skill ID，以便后续查找
        tools.push({
          type: "function",
          function: {
            name: toolName,
            description: `[Skill: ${skillId}] ${skill.metadata.description || skill.metadata.name || skillId}`,
            parameters: {
              type: "object",
              properties: {
                input: {
                  type: "string",
                  description: "Skill 的输入内容或参数",
                }
              },
              required: ["input"]
            }
          }
        });
      } catch (err) {
        console.warn(`[SkillTools] Failed to load skill metadata ${skillId}:`, err);
      }
    }
    
    return tools;
  } catch (err) {
    console.error("[SkillTools] Failed to get skill metadata:", err);
    return [];
  }
}

/**
 * Level 2: 获取特定 Skill 的详细指令
 * 当 AI 判断需要使用某个 Skill 时调用
 */
export async function getSkillInstructionsAsync(skillId: string): Promise<string | null> {
  try {
    const { getSkill } = await import("./skills-manager");
    const skill = await getSkill(skillId);
    if (!skill) return null;
    
    // Level 2: 返回详细指令
    return `
# 技能：${skill.metadata.name}

## 技能说明
${skill.metadata.description || ""}

## 执行指令
${skill.instruction}

---

请根据上述指令处理用户输入，并提供结果。`;
  } catch (err) {
    console.error(`[SkillTools] Failed to get skill instructions for ${skillId}:`, err);
    return null;
  }
}

/**
 * 向后兼容：getSkillToolsAsync 现在只返回 Level 1 元数据
 */
export async function getSkillToolsAsync(): Promise<OpenAITool[]> {
  return getSkillMetadataAsync();
}

// 辅助函数：从URL提取域名
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type JournalExportCacheEntry = {
  rangeLabel: string;
  entries: any[];
  cachedAt: number;
};

const JOURNAL_EXPORT_CACHE_TTL = 30 * 60 * 1000;
const JOURNAL_EXPORT_CACHE_MAX = 5;

// 全局缓存：存储大型日记导出数据（供前端使用）
export const journalExportDataCache = new Map<string, JournalExportCacheEntry>();

// 全局缓存：存储搜索结果（供自动增强使用）
export const searchResultsCache = new Map<string, any[]>();

// 日志去重缓存 - 使用更智能的去重策略
const loggedMessages = new Map<string, number>();
const LOG_THROTTLE_MS = 5000; // 5秒内相同消息只输出一次

/**
 * 从工具结果中提取搜索结果
 * 支持两种方式：
 * 1. 从缓存中获取（如果缓存存在）
 * 2. 直接从工具结果内容中解析（作为备选）
 */
export function extractSearchResultsFromToolResults(
  toolResults?: Map<string, { content: string; name: string }>
): any[] {
  if (!toolResults) return [];
  
  const allSearchResults: any[] = [];
  
  for (const [toolCallId, result] of toolResults.entries()) {
    if (result.name === "webSearch") {
      // 方式1：从缓存中获取
      const cacheKeyMatch = result.content.match(/<!-- search-cache:([^>]+) -->/);
      if (cacheKeyMatch) {
        const cacheKey = cacheKeyMatch[1];
        const cachedResults = searchResultsCache.get(cacheKey);
        if (cachedResults && cachedResults.length > 0) {
          allSearchResults.push(...cachedResults);
          
          // 智能日志去重
          const logKey = `cache-${cacheKey}`;
          const now = Date.now();
          const lastLogged = loggedMessages.get(logKey) || 0;
          
          if (now - lastLogged > LOG_THROTTLE_MS) {
            loggedMessages.set(logKey, now);
          }
          continue; // 已从缓存获取，跳过解析
        }
      }
      
      // 方式2：直接从工具结果内容中解析搜索结果
      // 格式：1. [标题](URL)\n   发布时间: xxx\n   内容摘要
      const parsedResults = parseSearchResultsFromContent(result.content);
      if (parsedResults.length > 0) {
        allSearchResults.push(...parsedResults);
      }
    }
  }
  
  return allSearchResults;
}

/**
 * 从webSearch工具返回的文本内容中解析搜索结果
 */
function parseSearchResultsFromContent(content: string): any[] {
  const results: any[] = [];
  
  // 匹配格式：数字. [标题](URL)
  const resultRegex = /(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = resultRegex.exec(content)) !== null) {
    const [fullMatch, index, title, url] = match;
    
    // 只处理HTTP/HTTPS链接
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      continue;
    }
    
    // 尝试提取该结果后面的内容摘要
    const afterMatch = content.substring(match.index + fullMatch.length);
    const nextResultIndex = afterMatch.search(/\n\d+\.\s*\[/);
    const resultBlock = nextResultIndex > 0 
      ? afterMatch.substring(0, nextResultIndex) 
      : afterMatch.substring(0, 500);
    
    // 提取摘要（跳过发布时间行）
    const lines = resultBlock.split('\n').filter(line => line.trim());
    let snippet = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('发布时间:') && !trimmed.startsWith('⏱️') && trimmed.length > 10) {
        snippet = trimmed;
        break;
      }
    }
    
    results.push({
      title: title.trim(),
      url: url.trim(),
      content: snippet,
      snippet: snippet,
    });
  }
  
  return results;
}

function pruneJournalExportCache(now: number): void {
  for (const [key, entry] of journalExportDataCache.entries()) {
    if (now - entry.cachedAt > JOURNAL_EXPORT_CACHE_TTL) {
      journalExportDataCache.delete(key);
    }
  }
}

function setJournalExportCache(cacheId: string, rangeLabel: string, entries: any[]): void {
  const now = Date.now();
  pruneJournalExportCache(now);

  journalExportDataCache.set(cacheId, { rangeLabel, entries, cachedAt: now });

  if (journalExportDataCache.size <= JOURNAL_EXPORT_CACHE_MAX) {
    return;
  }

  const sorted = Array.from(journalExportDataCache.entries()).sort(
    (a, b) => a[1].cachedAt - b[1].cachedAt
  );
  const excess = sorted.length - JOURNAL_EXPORT_CACHE_MAX;
  for (let i = 0; i < excess; i++) {
    journalExportDataCache.delete(sorted[i][0]);
  }
}

/**
 * 从块树中提取每个块的详细信息（包括时间）
 */
type BlockInfo = {
  id: number;
  content: string;
  created?: string;
  modified?: string;
  depth: number;
};

function extractBlocksFromTree(tree: any, depth: number = 0, maxBlocks: number = 200): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  
  function traverse(node: any, currentDepth: number): void {
    if (!node || blocks.length >= maxBlocks) return;
    
    if (Array.isArray(node)) {
      for (const item of node) {
        traverse(item, currentDepth);
        if (blocks.length >= maxBlocks) break;
      }
      return;
    }
    
    // 处理数字 ID（引用）
    if (typeof node === "number") {
      const block = (orca.state.blocks as any)?.[node];
      if (block) traverse(block, currentDepth);
      return;
    }
    
    // 获取实际的块对象
    const block = node?.block && typeof node.block === "object" ? node.block : node;
    if (!block || !block.id) return;
    
    // 提取文本内容
    let content = "";
    if (block.content) {
      if (typeof block.content === "string") {
        content = block.content;
      } else if (Array.isArray(block.content)) {
        content = block.content.map((f: any) => {
          if (typeof f?.v === "string") return f.v;
          if (typeof f?.v === "number") return String(f.v);
          return "";
        }).join("");
      }
    }
    
    blocks.push({
      id: block.id,
      content: content.trim(),
      created: block.created ? new Date(block.created).toISOString() : undefined,
      modified: block.modified ? new Date(block.modified).toISOString() : undefined,
      depth: currentDepth,
    });
    
    // 处理子块
    const children = node?.children || node?.tree?.children || block?.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        traverse(child, currentDepth + 1);
        if (blocks.length >= maxBlocks) break;
      }
    }
  }
  
  traverse(tree, depth);
  return blocks;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI Tool Definitions (JSON Schema for OpenAI)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "tool_instructions",
      description: `获取指定工具的用法说明（仅返回该工具）。`,
      parameters: {
        type: "object",
        properties: {
          toolName: {
            type: "string",
            description: "工具名称，如 createPage、searchBlocksByText。",
          },
        },
        required: ["toolName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBlocksByTag",
      description: `按标签搜索笔记，默认返回内容+标签属性（block-ref 自动展开为块摘要）。briefMode=true 仅标题摘要，不含属性/子块。用于 #标签查询。tag_query 必填（"#标签名"，空格分多标签）；属性过滤用 query_blocks_by_tag。`,
      parameters: {
        type: "object",
        properties: {
          tag_query: {
            type: "string",
            description: "标签查询，必须带#号，如'#TODO'或'#TODO #Project'",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认20，最大50",
          },
          countOnly: {
            type: "boolean",
            description: "true=只返回数量，用于'有多少条'类问题",
          },
          briefMode: {
            type: "boolean",
            description: "true=只返回标题+摘要",
          },
          sortBy: {
            type: "string",
            enum: ["created", "modified"],
            description: "排序字段：created（创建时间）或 modified（修改时间）",
          },
          sortOrder: {
            type: "string",
            enum: ["asc", "desc"],
            description: "排序顺序：asc（升序/最早）或 desc（降序/最新），默认 desc",
          },
        },
        required: ["tag_query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBlocksByText",
      description: `全文搜索笔记内容。

【何时使用】查找包含某些文字的笔记，模糊搜索
【参数】query必填，搜索关键词
【注意】如果用户明确提到#标签，优先用searchBlocksByTag`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认20，最大50",
          },
          countOnly: {
            type: "boolean",
            description: "true=只返回数量",
          },
          briefMode: {
            type: "boolean",
            description: "true=只返回标题+摘要",
          },
          sortBy: {
            type: "string",
            enum: ["created", "modified"],
            description: "排序字段",
          },
          sortOrder: {
            type: "string",
            enum: ["asc", "desc"],
            description: "排序顺序，默认 desc",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_blocks_by_tag",
      description: `按标签+属性条件查询，返回内容+标签属性（block-ref 自动展开为块摘要）。用于按属性过滤（如状态/优先级）。tagName 不带#；filters 用文本值。`,
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "标签名，不带#号，如'Task'",
          },
          filters: {
            type: "array",
            description: "属性过滤条件",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "属性名称" },
                op: {
                  type: "string",
                  enum: ["==", "!=", ">", "<", ">=", "<=", "contains"],
                  description: "操作符",
                },
                value: {
                  type: "string",
                  description: "属性值（直接用文本，如 Canceled、Done、reading）",
                },
              },
              required: ["name", "op", "value"],
            },
          },
          maxResults: {
            type: "number",
            description: "最大结果数",
          },
        },
        required: ["tagName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_blocks",
      description: `组合多条件复杂搜索（AND/OR）。

【条件类型】
- tag: 按标签，需name字段
- text: 按文本，需text字段  
- task: 按任务状态，需completed字段(true/false)
- journal: 按日记范围，需startOffset/endOffset（负数=过去天数）

【注意】journal条件只返回引用，要看日记内容用getTodayJournal/getRecentJournals`,
      parameters: {
        type: "object",
        properties: {
          conditions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { 
                  type: "string", 
                  enum: ["tag", "text", "task", "journal", "ref", "block", "blockMatch"] 
                },
                name: { type: "string", description: "标签名（type=tag时）" },
                text: { type: "string", description: "关键词（type=text时）" },
                completed: { type: "boolean", description: "完成状态（type=task时）" },
                startOffset: { type: "number", description: "起始天数，如-7=7天前（type=journal时）" },
                endOffset: { type: "number", description: "结束天数，0=今天（type=journal时）" },
                blockId: { type: "number", description: "块ID（type=ref时）" },
                hasTags: { type: "boolean", description: "是否有标签（type=block时）" },
              },
              required: ["type"],
            },
          },
          combineMode: {
            type: "string",
            enum: ["and", "or"],
            description: "组合方式，默认and",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认20，最大50",
          },
        },
        required: ["conditions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRecentJournals",
      description: `获取最近几天日记的完整内容（文字、图片等）。

【何时使用】"最近几天的日记"、"这周写了什么"
【参数】days: 天数，默认7，最大7
【注意】超过7天用getJournalsByDateRange，只要今天用getTodayJournal`,
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "天数，默认7，最大7",
          },
          includeChildren: {
            type: "boolean",
            description: "包含子块，默认true",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTodayJournal",
      description: `获取今天日记的完整内容。

【何时使用】"今天写了什么"、"今天的日记"、"今天的计划"`,
      parameters: {
        type: "object",
        properties: {
          includeChildren: {
            type: "boolean",
            description: "包含子块，默认true",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getJournalByDate",
      description: `获取指定日期的日记完整内容。

【何时使用】"昨天的日记"、"1月5号写了什么"
【参数】date: 格式YYYY-MM-DD如"2026-01-05"，或"today"/"yesterday"`,
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "日期，格式YYYY-MM-DD或today/yesterday",
          },
          includeChildren: {
            type: "boolean",
            description: "包含子块，默认true",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getJournalsByDateRange",
      description: `按日期范围获取日记。

【用法】
- 最近N天: rangeType="range", value="last-7-days"/"last-30-days"/"last-90-days"
- 某月: rangeType="month", value="2024-05"
- 某周: rangeType="week", value="this-week"/"last-week"
- 某年: rangeType="year", value="2024"（建议maxResults=30）
- 自定义: rangeType="range", value="2024-05-01", endValue="2024-05-15"`,
      parameters: {
        type: "object",
        properties: {
          rangeType: {
            type: "string",
            enum: ["year", "month", "week", "range"],
            description: "范围类型",
          },
          value: {
            type: "string",
            description: "范围值，见上方说明",
          },
          endValue: {
            type: "string",
            description: "结束日期，仅自定义范围时需要",
          },
          includeChildren: {
            type: "boolean",
            description: "包含子块，默认true",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认31，最大366",
          },
        },
        required: ["rangeType", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tag_schema",
      description: `获取标签的属性定义（属性名、类型、选项值）。

【何时使用】用户问"#Task有哪些属性"、"#book的结构"
【注意】不要在查询前调用，直接用query_blocks_by_tag查询即可`,
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "标签名，不带#号",
          },
        },
        required: ["tagName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBlocksByReference",
      description: `搜索引用了某页面的所有笔记（反向链接）。

【何时使用】"哪些笔记提到了[[某页面]]"、"某页面被引用了多少次"
【参数】pageName: 页面名称，不带[[]]`,
      parameters: {
        type: "object",
        properties: {
          pageName: {
            type: "string",
            description: "页面名称，不带[[]]",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认20，最大50",
          },
          countOnly: {
            type: "boolean",
            description: "只返回数量",
          },
          briefMode: {
            type: "boolean",
            description: "只返回标题+摘要",
          },
        },
        required: ["pageName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPage",
      description: `按名称读取页面完整内容。

【何时使用】用户指定要看某个页面："打开[[某页面]]"
【注意】搜索结果已包含内容，通常不需要再调用此工具`,
      parameters: {
        type: "object",
        properties: {
          pageName: {
            type: "string",
            description: "页面名称",
          },
          includeChildren: {
            type: "boolean",
            description: "包含子块，默认true",
          },
        },
        required: ["pageName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBlock",
      description: `按ID读取块的完整内容。

【何时使用】需要查看特定块ID的内容
【注意】如果知道页面名称，优先用getPage；搜索结果已包含内容，通常不需要再调用`,
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "块ID，数字类型",
          },
          includeChildren: {
            type: "boolean",
            description: "包含子块，默认true",
          },
          includeMeta: {
            type: "boolean",
            description: "包含创建/修改时间",
          },
        },
        required: ["blockId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBlockMeta",
      description: `批量获取多个块的元数据（创建/修改时间、标签、属性）。

【何时使用】需要比较多个笔记的时间信息或批量获取属性`,
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            description: "块ID数组",
            items: { type: "number" },
          },
          fields: {
            type: "array",
            description: "要获取的字段",
            items: {
              type: "string",
              enum: ["created", "modified", "tags", "properties"],
            },
          },
        },
        required: ["blockIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createBlock",
      description: `创建新笔记块。

【何时使用】用户明确要求"创建"、"添加"、"写入"笔记
【参数】
- content: 必填，笔记内容，用纯文本或Markdown
- pageName: 目标页面名称（推荐），在页面末尾创建
- refBlockId: 参考块ID，与pageName二选一
- position: 插入位置，默认lastChild

【格式】用纯文本或Markdown，引用页面用[[页面名称]]，不要用orca-block:xxx
【注意】只在用户明确要求时创建，成功后立即停止`,
      parameters: {
        type: "object",
        properties: {
          refBlockId: {
            type: "number",
            description: "参考块ID（与pageName二选一）",
          },
          pageName: {
            type: "string",
            description: "目标页面名称（推荐）",
          },
          content: {
            type: "string",
            description: "笔记内容，纯文本或Markdown",
          },
          position: {
            type: "string",
            enum: ["firstChild", "lastChild", "before", "after"],
            description: "插入位置，默认lastChild",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createPage",
      description: `为块创建页面别名（将块提升为独立页面）。`,
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "目标块ID",
          },
          pageName: {
            type: "string",
            description: "新页面名称",
          },
        },
        required: ["blockId", "pageName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insertTag",
      description: `为块添加标签。

【何时使用】用户要求给笔记打标签
【参数】
- blockId: 目标块ID
- tagName: 标签名，不带#号
- properties: 可选，标签属性数组`,
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "目标块ID",
          },
          tagName: {
            type: "string",
            description: "标签名，不带#号",
          },
          properties: {
            type: "array",
            description: "标签属性（可选）",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "属性名" },
                value: { type: "string", description: "属性值" },
              },
              required: ["name", "value"],
            },
          },
        },
        required: ["blockId", "tagName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateTagProperties",
      description: `更新块上已有标签的属性（支持 replace/merge/append）。

【何时使用】需要修改标签属性或追加 block-refs 引用
【参数】
- blockId: 目标块ID
- tagName: 标签名，不带#号
- properties: 要更新的属性数组
- mode: 更新模式（replace/merge/append），默认 merge
【更新模式】
- replace: 完全替换所有属性，未提及的属性会被清除
- merge: 更新提及的属性，保留未提及的属性（默认）
- append: 仅对 block-refs 追加并去重，其它属性按 merge 处理`,
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "目标块ID",
          },
          tagName: {
            type: "string",
            description: "标签名，不带#号",
          },
          mode: {
            type: "string",
            enum: ["replace", "merge", "append"],
            description: "更新模式：replace/merge/append，默认 merge",
          },
          properties: {
            type: "array",
            description: "要更新的标签属性数组",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "属性名" },
                value: {
                  description: "属性值，block-refs 可为 blockId 数组或 blockid 字符串",
                  oneOf: [
                    { type: "string" },
                    { type: "number" },
                    {
                      type: "array",
                      items: {
                        oneOf: [
                          { type: "string" },
                          { type: "number" },
                        ],
                      },
                    },
                  ],
                },
              },
              required: ["name", "value"],
            },
          },
        },
        required: ["blockId", "tagName", "properties"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBlockLinks",
      description: `获取块的出链和入链（反链）列表。

【何时使用】查看某页面引用了哪些页面、被哪些页面引用
【参数】blockId或pageName二选一
【注意】只返回文本列表，不生成图谱。要看图谱请告知用户用/localgraph命令`,
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "块ID（与pageName二选一）",
          },
          pageName: {
            type: "string",
            description: "页面名称（与blockId二选一）",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSavedAiConversations",
      description: `获取已保存的AI对话记录。

【何时使用】"之前聊过什么"、"找找关于xxx的对话"`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词（可选）",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认10，最大30",
          },
          briefMode: {
            type: "boolean",
            description: "只返回标题+摘要",
          },
        },
      },
    },
  },
];

/**
 * 联网搜索工具 - 仅在用户开启联网搜索时添加
 */
export const WEB_SEARCH_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "webSearch",
    description: `联网搜索获取实时信息。

【何时使用】
- 用户问最新的新闻、事件、数据
- 需要实时信息（天气、股价、比赛结果等）
- 笔记库中没有的外部知识
- 用户明确要求搜索网络

【参数】
- query: 搜索关键词，用英文效果更好
- maxResults: 返回结果数，默认5

【注意】
- 优先使用笔记库工具查找用户自己的内容
- 只在需要外部信息时使用此工具`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
        maxResults: {
          type: "number",
          description: "最大结果数，默认5，最大20",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * 图像搜索工具 - 仅在用户开启联网搜索时添加
 */
export const IMAGE_SEARCH_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "imageSearch",
    description: `搜索相关图片并在回复中显示。

【何时使用 - 优先使用】
- 用户询问任何人物、地点、物品、概念的外观或样子
- 回答中提到具体的人名、地名、产品名、建筑物等
- 用户问"是什么"、"长什么样"、"外观如何"等问题
- 介绍、描述任何具体事物时都应该搜索图片

【常见触发场景】
- "谁是XXX？" → 搜索人物照片
- "什么是XXX？" → 搜索相关图片  
- "介绍XXX" → 搜索对象图片
- "XXX长什么样？" → 直接搜索
- 任何涉及具体事物的问题

【参数】
- query: 图片搜索关键词，使用最核心的名词
- maxResults: 返回图片数量，默认3，最大6

【重要】优先使用此工具！图片能大大提升回答质量，用户更喜欢图文并茂的回答。`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "图片搜索关键词，使用最核心的名词",
        },
        maxResults: {
          type: "number",
          description: "最大图片数量，默认3，最大6",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * Wikipedia 搜索工具
 */
export const WIKIPEDIA_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "wikipedia",
    description: `查询 Wikipedia 百科获取权威知识。

【何时使用】
- 用户询问人物、历史事件、科学概念、地理位置等百科知识
- 需要权威、准确的背景信息
- 用户问"什么是"、"谁是"、"介绍一下"等问题

【参数】
- query: 搜索关键词
- lang: 语言代码（可选）
  * zh: 中文（默认）
  * en: 英文
  * ja: 日文
  * de: 德文
  * fr: 法文
  * es: 西班牙文
  * 等其他语言代码
- fallback: 是否在当前语言没有结果时自动尝试其他语言（默认 true）

【语言选择建议】
- 中文查询 → 优先 zh，可能内容较少
- 英文查询 → 优先 en，通常内容最详细
- 科技/学术主题 → 建议 en，内容更全面
- 本地化主题（如中国历史）→ 建议 zh
- 不同语言版本内容可能差异很大，可以尝试多个语言

【注意】
- 返回完整词条内容，可能很长
- 长内容会自动分段返回
- 包含图片链接（如果有）`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
        lang: {
          type: "string",
          description: "语言代码，默认 zh（中文）。可选：en（英文）、ja（日文）、de（德文）、fr（法文）等",
          enum: ["zh", "en", "ja", "de", "fr", "es", "ru", "it", "pt", "ko"],
        },
        fallback: {
          type: "boolean",
          description: "当前语言没有结果时是否自动尝试英文，默认 true",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * 网页内容抓取工具
 */
export const FETCH_URL_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "fetch_url",
    description: `抓取指定 URL 的网页内容。

【何时使用】
- 用户提供了具体的网址链接
- 需要查看某个网页的详细内容
- 需要提取网页中的表格、数据、文章等信息
- Wikipedia 表格内容不完整时，可以直接抓取 Wikipedia 页面

【参数】
- url: 要抓取的网页 URL（必须是完整的 http:// 或 https:// 链接）
- max_length: 最大内容长度（可选，默认 100000 字符）

【返回内容】
- 网页标题
- 转换为 Markdown 格式的内容
- 保留表格、列表、标题等结构
- 自动清理广告、脚本等无关内容

【注意】
- 只支持公开可访问的网页
- 某些网站可能有反爬虫限制
- 内容过长会自动截断
- 不支持需要登录的页面`,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "要抓取的网页 URL（完整的 http:// 或 https:// 链接）",
        },
        max_length: {
          type: "number",
          description: "最大内容长度（字符数），默认 100000",
        },
      },
      required: ["url"],
    },
  },
};

/**
 * 汇率转换工具
 */
export const CURRENCY_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "currency",
    description: `查询实时汇率或进行货币转换。

【何时使用】
- 用户询问汇率，如"美元兑人民币多少"
- 用户需要货币转换，如"100美元等于多少人民币"
- 用户问某种货币的汇率

【参数】
- amount: 金额（可选，默认1）
- from: 源货币（支持代码如 USD、CNY，或中文如"美元"、"人民币"）
- to: 目标货币（可选，不填则返回多种货币汇率）

【支持的货币】
USD(美元)、CNY(人民币)、EUR(欧元)、GBP(英镑)、JPY(日元)、
HKD(港币)、KRW(韩元)、TWD(台币)、AUD(澳元)、CAD(加元)等`,
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "金额，默认1",
        },
        from: {
          type: "string",
          description: "源货币代码或名称，如 USD、美元",
        },
        to: {
          type: "string",
          description: "目标货币代码或名称（可选）",
        },
      },
      required: ["from"],
    },
  },
};

/**
 * 获取工具列表（根据联网搜索开关动态添加）
 */
export function getTools(webSearchEnabled?: boolean, scriptAnalysisEnabled?: boolean): OpenAITool[] {
  const tools = [...TOOLS];
  const webSearchOn = webSearchEnabled ?? isWebSearchEnabled();
  const imageSearchOn = isImageSearchEnabled();
  const wikipediaOn = isWikipediaEnabled();
  const currencyOn = isCurrencyEnabled();
  
  // Add search tools when web search is enabled (image search is optional).
  if (webSearchOn) {
    if (imageSearchOn) {
      tools.push(IMAGE_SEARCH_TOOL);
    }
    tools.push(WEB_SEARCH_TOOL);
  }
  
  // Wikipedia 工具（独立开关）
  if (wikipediaOn) {
    tools.push(WIKIPEDIA_TOOL);
  }
  
  // 网页抓取工具（总是可用）
  tools.push(FETCH_URL_TOOL);
  
  // 汇率工具（独立开关）
  if (currencyOn) {
    tools.push(CURRENCY_TOOL);
  }
  
  // 如果脚本分析已开启，添加脚本分析工具
  if (scriptAnalysisEnabled ?? isScriptAnalysisEnabled()) {
    tools.push(...getScriptAnalysisTools());
  }

  tools.push(...getSkillTools());
  
  return tools;
}

/**
 * 闪卡生成工具 - 仅供 /card 命令使用，不包含在普通对话工具列表中
 */
export const FLASHCARD_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "generateFlashcards",
    description: `生成闪卡。根据对话内容或指定主题，生成 5-8 张闪卡用于记忆学习。必须调用此工具，不要用文本回复！`,
    parameters: {
      type: "object",
      properties: {
        cards: {
          type: "array",
          description: "闪卡列表，5-8 张",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "问题（简洁明了）",
              },
              answer: {
                type: "string",
                description: "答案（简洁，≤20字为佳）。选择题不需要此字段",
              },
              type: {
                type: "string",
                enum: ["basic", "choice"],
                description: "卡片类型：basic（问答）或 choice（选择题）",
              },
              options: {
                type: "array",
                description: "选择题选项（仅 type=choice 时需要）",
                items: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description: "选项文本",
                    },
                    isCorrect: {
                      type: "boolean",
                      description: "是否为正确答案",
                    },
                  },
                  required: ["text", "isCorrect"],
                },
              },
            },
            required: ["question", "type"],
          },
        },
      },
      required: ["cards"],
    },
  },
};

/**
 * 搜索类工具名称列表 - 当用户拖入块时禁用这些工具
 * 因为用户已经明确指定了要讨论的块，不需要再搜索笔记
 * 注意：日记工具保留，用户可能同时问日记相关问题
 */
const SEARCH_TOOL_NAMES = new Set([
  "searchBlocksByTag",
  "searchBlocksByText",
  "query_blocks_by_tag",
  "query_blocks",
  "searchBlocksByReference",
  "getPage",
  "getSavedAiConversations",
]);

/**
 * 获取限制后的工具列表（当用户拖入块时使用）
 * 禁用搜索类工具，只保留读取和写入工具
 */
export function getToolsForDraggedContext(): OpenAITool[] {
  return [
    ...TOOLS.filter(tool => !SEARCH_TOOL_NAMES.has(tool.function.name)),
    ...getSkillTools(),
  ];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Tool Implementation Logic
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * 获取块的根页面 ID（向上追溯到 parent === null 的块）
 */
async function getRootBlockId(blockId: number): Promise<number | undefined> {
  let currentId = blockId;
  let safetyCounter = 0;

  try {
    while (safetyCounter < 20) {
      const block = orca.state.blocks[currentId] || await orca.invokeBackend("get-block", currentId);
      if (!block) return currentId;
      if (!block.parent) return block.id;
      currentId = block.parent;
      safetyCounter++;
    }
  } catch (error) {
  }
  return currentId;
}

/**
 * 将任意输入转换为有限数字。
 */
function toFiniteNumber(val: any): number | undefined {
  if (val === null || val === undefined) return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * 规范化标签名（去除前导 #）。
 */
function normalizeTagNameForTool(tagName: string): string {
  const trimmed = String(tagName ?? "").trim();
  if (trimmed.startsWith("#")) return trimmed.slice(1);
  return trimmed;
}

type TagPropertyInput = {
  name: string;
  value: any;
  type?: number;
};

type TagPropertyMergeMode = "replace" | "merge" | "append";

/**
 * 解析 block-refs 类型的值，统一为可去重的数组。
 */
function normalizeBlockRefList(value: any): Array<number | string> {
  const rawList = Array.isArray(value) ? value : [value];
  const normalized: Array<number | string> = [];

  const toRefValue = (item: any): number | string | null => {
    if (item === null || item === undefined) return null;
    if (typeof item === "number" && Number.isFinite(item)) return Math.trunc(item);
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
      if (match) return Number(match[1]);
      return trimmed;
    }
    return null;
  };

  for (const item of rawList) {
    if (Array.isArray(item)) {
      for (const nested of item) {
        const normalizedValue = toRefValue(nested);
        if (normalizedValue !== null) normalized.push(normalizedValue);
      }
      continue;
    }
    const normalizedValue = toRefValue(item);
    if (normalizedValue !== null) normalized.push(normalizedValue);
  }

  return normalized;
}

/**
 * 生成标签属性类型映射（name -> type）。
 */
function buildTagPropertyTypeMap(schema: { properties?: Array<{ name: string; type: number }> }): Map<string, number> {
  const typeMap = new Map<string, number>();
  if (!schema?.properties || !Array.isArray(schema.properties)) return typeMap;
  for (const prop of schema.properties) {
    if (!prop || typeof prop.name !== "string") continue;
    typeMap.set(prop.name.toLowerCase(), prop.type);
  }
  return typeMap;
}

/**
 * 规范化标签属性输入，补齐类型并处理 block-refs 值。
 */
function normalizeTagPropertyList(
  raw: any,
  typeMap: Map<string, number>
): TagPropertyInput[] {
  if (!Array.isArray(raw)) return [];
  const normalized: TagPropertyInput[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const inputType = Number.isFinite(Number(item.type)) ? Number(item.type) : undefined;
    const schemaType = typeMap.get(key);
    const type = inputType ?? schemaType;
    let value = item.value;

    if (type === 2) {
      value = normalizeBlockRefList(value);
    }

    normalized.push({
      name,
      value,
      ...(type !== undefined ? { type } : {}),
    });
  }

  return normalized;
}

/**
 * 合并标签属性（replace/merge/append）。
 */
function mergeTagProperties(
  existing: TagPropertyInput[],
  updates: TagPropertyInput[],
  mode: TagPropertyMergeMode,
  typeMap: Map<string, number>
): TagPropertyInput[] {
  if (mode === "replace") return updates;

  const merged = new Map<string, TagPropertyInput>();
  const order: string[] = [];

  const addProp = (prop: TagPropertyInput) => {
    const key = prop.name.toLowerCase();
    if (!key) return;
    if (!merged.has(key)) order.push(key);
    merged.set(key, prop);
  };

  for (const prop of existing) {
    const key = prop.name.toLowerCase();
    const schemaType = typeMap.get(key);
    const normalized: TagPropertyInput = {
      ...prop,
      ...(prop.type === undefined && schemaType !== undefined ? { type: schemaType } : {}),
    };
    addProp(normalized);
  }

  const mergeBlockRefs = (baseValue: any, updateValue: any): Array<number | string> => {
    const baseList = normalizeBlockRefList(baseValue);
    const updateList = normalizeBlockRefList(updateValue);
    const seen = new Set<string>();
    const combined: Array<number | string> = [];

    const pushUnique = (val: number | string) => {
      const key = typeof val === "number" ? `n:${val}` : `s:${val}`;
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(val);
    };

    baseList.forEach(pushUnique);
    updateList.forEach(pushUnique);
    return combined;
  };

  for (const update of updates) {
    const key = update.name.toLowerCase();
    const existingProp = merged.get(key);
    const schemaType = typeMap.get(key);
    const resolvedType = update.type ?? existingProp?.type ?? schemaType;

    if (mode === "append" && resolvedType === 2) {
      const combinedValue = mergeBlockRefs(existingProp?.value, update.value);
      addProp({
        name: update.name,
        value: combinedValue,
        ...(resolvedType !== undefined ? { type: resolvedType } : {}),
      });
      continue;
    }

    addProp({
      name: update.name,
      value: update.value,
      ...(resolvedType !== undefined ? { type: resolvedType } : {}),
    });
  }

  return order.map((key) => merged.get(key)!).filter(Boolean);
}

type ExtractTagPropertiesResult = {
  block: any;
  tagBlockId: number;
  tagRef?: any;
  properties: TagPropertyInput[];
  tagExists: boolean;
  readError?: string;
};

/**
 * 提取块上指定标签的属性。
 */
async function extractBlockTagProperties(
  blockId: number,
  tagName: string
): Promise<ExtractTagPropertiesResult> {
  const block = orca.state.blocks[blockId] || await orca.invokeBackend("get-block", blockId);
  if (!block) {
    throw new Error(`未找到块 ${blockId}`);
  }

  const tagBlock = await orca.invokeBackend("get-block-by-alias", tagName);
  if (!tagBlock) {
    throw new Error(`找不到标签 "${tagName}"`);
  }

  const refs = Array.isArray(block.refs) ? block.refs : [];
  const tagRef = refs.find((ref: any) => ref && ref.to === tagBlock.id);
  let properties: TagPropertyInput[] = [];
  let readError: string | undefined;

  if (tagRef && Array.isArray(tagRef.data)) {
    properties = tagRef.data.map((prop: any) => ({
      name: prop?.name,
      value: prop?.value,
      ...(prop?.type !== undefined ? { type: prop.type } : {}),
    })).filter((prop: TagPropertyInput) => typeof prop.name === "string" && prop.name.trim());
  } else if (tagRef && tagRef.data !== undefined) {
    readError = "标签属性读取失败，将按替换模式处理";
  }

  return {
    block,
    tagBlockId: tagBlock.id,
    tagRef,
    properties,
    tagExists: !!tagRef,
    readError,
  };
}

/**
 * 从 block.content 提取纯文本内容
 * block.content 可能是字符串或 ContentFragment[] 数组
 */
function extractBlockText(content: any): string {
  if (!content) return "";
  
  // 如果已经是字符串，直接返回
  if (typeof content === "string") return content;
  
  // 如果是数组（ContentFragment[]），提取每个 fragment 的文本
  if (Array.isArray(content)) {
    return content.map((fragment: any) => {
      if (!fragment) return "";
      // fragment.v 是值，可能是字符串或其他类型
      if (typeof fragment.v === "string") return fragment.v;
      if (typeof fragment.v === "number") return String(fragment.v);
      // 对于复杂类型（如嵌套对象），尝试提取
      if (fragment.v && typeof fragment.v === "object") {
        // 可能是链接等，尝试获取显示文本
        return fragment.v.text || fragment.v.title || fragment.v.name || "";
      }
      return "";
    }).join("");
  }
  
  // 其他情况，尝试转字符串
  try {
    return String(content);
  } catch {
    return "";
  }
}

/**
 * 规范化日记偏移量。
 */
function normalizeJournalOffset(val: any, defaultVal: number): number {
  const num = Number(val);
  return Number.isFinite(num) ? Math.trunc(num) : defaultVal;
}

/**
 * 生成搜索结果的上限警告信息
 * @param resultCount - 实际返回的结果数
 * @param maxResults - 请求的最大结果数
 * @param actualLimit - 实际应用的上限（考虑系统最大值）
 */
function buildLimitWarning(resultCount: number, maxResults: number, actualLimit: number = 50): string {
  if (resultCount >= actualLimit) {
    return `\n\n⚠️ **注意：结果已达到上限 (${actualLimit} 条)**\n实际匹配的笔记可能更多。如需获取完整列表，请：\n1. 使用更精确的搜索条件缩小范围\n2. 或分批查询（如按时间范围分段）`;
  }
  return "";
}

/**
 * 格式化简洁模式的搜索结果（标题+摘要+ID）
 */
function formatBriefResult(result: any, index: number): string {
  // 清理标题中的链接格式，避免嵌套
  // 优先使用 tags (aliases)，然后是 title
  let title: string;
  if (Array.isArray(result.tags) && result.tags.length > 0) {
    // tags 字段存储的是 aliases
    const validTags = result.tags.filter((t: any) => typeof t === "string" && t.trim());
    title = validTags.length > 0 ? validTags.join(" / ") : (result.title || `Block #${result.id}`);
  } else {
    title = result.title || `Block #${result.id}`;
  }
  
  title = title.replace(/\[([^\]]+)\]\(orca-block:\d+\)/g, "$1"); // 移除已有的 block link
  title = title.replace(/[\[\]]/g, ""); // 移除方括号
  
  if (!title || title.trim() === "" || title === "(untitled)") {
    title = `Block #${result.id}`;
  }
  
  // 提取内容摘要（前80字符），同样清理链接格式
  let content = result.content || result.fullContent || "";
  content = content.replace(/\[([^\]]+)\]\(orca-block:\d+\)/g, "$1");
  const summary = content.length > 80 
    ? content.substring(0, 80).replace(/\n/g, " ") + "..."
    : content.replace(/\n/g, " ");
  
  if (summary && summary.trim() && summary !== title) {
    return `${index + 1}. [${title}](orca-block:${result.id})\n   ${summary}`;
  }
  return `${index + 1}. [${title}](orca-block:${result.id})`;
}

const MAX_PROPERTY_LINES = 5;
const MAX_BLOCK_REF_ITEMS = 3;

function extractBlockId(value: any): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const match = value.match(/(?:blockid:|orca-block:)?(\d+)/i);
    if (match) {
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  if (value && typeof value === "object") {
    const candidates = [
      value.id,
      value.blockId,
      value.block_id,
      value.to,
    ];
    for (const candidate of candidates) {
      const parsed = extractBlockId(candidate);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

/**
 * 格式化属性值输出（用于标签搜索结果）
 */
function formatPropertyValues(propertyValues: Record<string, any> | undefined): string {
  if (!propertyValues || typeof propertyValues !== "object") return "";
  const entries = Object.entries(propertyValues);
  if (entries.length === 0) return "";

  const lines: string[] = [];
  for (const [nameRaw, value] of entries) {
    const name = String(nameRaw ?? "").trim();
    if (!name || name.startsWith("_")) continue;
    if (lines.length >= MAX_PROPERTY_LINES) break;

    let formatted = "";
    if (Array.isArray(value)) {
      if (value.length === 0) {
        formatted = "(未设置)";
      } else {
        const isBlockRef = value.some((item) => {
          if (!item || typeof item !== "object") return false;
          return "title" in item || "id" in item || "blockId" in item || "to" in item;
        });

        if (isBlockRef) {
        const items = value.slice(0, MAX_BLOCK_REF_ITEMS);
        formatted = items
          .map((item: any) => {
            const title = typeof item?.title === "string" && item.title.trim()
              ? item.title.trim()
              : "(未命名)";
            const blockId = extractBlockId(item);
            return `${title} (blockid:${blockId ?? "?"})`;
          })
          .join(", ");
        if (value.length > MAX_BLOCK_REF_ITEMS) {
          formatted += " 等";
        }
        } else {
        formatted = JSON.stringify(value);
        }
      }
    } else if (value === null || value === undefined) {
      formatted = "(未设置)";
    } else {
      formatted = String(value);
    }

    lines.push(`   - ${name}: ${formatted}`);
  }

  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

/**
 * 格式化仅统计模式的结果
 */
function formatCountOnlyResult(
  count: number,
  queryDesc: string,
  hitLimit: boolean,
  limit: number
): string {
  if (hitLimit) {
    return `📊 统计结果：找到 **至少 ${count} 条** ${queryDesc}\n⚠️ 已达到查询上限 (${limit})，实际数量可能更多。`;
  }
  return `📊 统计结果：找到 **${count} 条** ${queryDesc}`;
}

function getToolDefinitionByName(toolName: string): OpenAITool | undefined {
  const normalized = toolName.trim();
  const allTools: OpenAITool[] = [
    ...TOOLS,
    WEB_SEARCH_TOOL,
    IMAGE_SEARCH_TOOL,
    WIKIPEDIA_TOOL,
    FETCH_URL_TOOL,
    CURRENCY_TOOL,
    ...getScriptAnalysisTools(),
    ...getSkillTools(),
  ];
  return allTools.find((tool) => tool.function.name === normalized);
}

function formatToolInstructions(tool: OpenAITool): string {
  const description = (tool.function.description || "").trim();
  const params = tool.function.parameters as any;
  const required = new Set<string>(Array.isArray(params?.required) ? params.required : []);
  const properties = params?.properties || {};
  const paramLines = Object.keys(properties).map((key) => {
    const info = properties[key] || {};
    const typeLabel = info.type ? String(info.type) : "any";
    const requiredLabel = required.has(key) ? ", required" : ", optional";
    const desc = info.description ? ` - ${String(info.description).trim()}` : "";
    const enumInfo = Array.isArray(info.enum) ? ` Options: ${info.enum.join(", ")}` : "";
    return `- ${key} (${typeLabel}${requiredLabel})${desc}${enumInfo}`;
  });
  const paramBlock = paramLines.length > 0 ? paramLines.join("\n") : "- (none)";
  return `Tool: ${tool.function.name}\n${description || "No description."}\n\nParameters:\n${paramBlock}`;
}

/**
 * 主入口：处理 AI 调用的工具。
 */
export async function executeTool(toolName: string, args: any): Promise<string> {
  try {
    if (toolName === "tool_instructions") {
      const requested = String(args?.toolName || args?.tool || args?.name || "").trim();
      if (!requested) {
        return "Error: Missing toolName parameter.";
      }
      const tool = getToolDefinitionByName(requested);
      if (!tool) {
        return `Tool not found: ${requested}`;
      }
      return formatToolInstructions(tool);
    } else if (toolName === "searchBlocksByTag") {
      try {
        const tagQuery = args.tag_query || args.tagQuery || args.tag;
        
        // Early validation: check for undefined tagQuery
        if (!tagQuery) {
          return "Error: Missing tag_query parameter. Please specify which tag to search for.";
        }
        
        const countOnly = args.countOnly === true;
        const briefMode = args.briefMode === true;
        const offset = Math.max(0, Math.trunc(args.offset || 0));
        const requestedMax = args.maxResults || (countOnly ? 200 : 20);
        const actualLimit = Math.min(requestedMax, countOnly ? 200 : 50);
        const sortBy = args.sortBy as "created" | "modified" | undefined;
        const sortOrder = (args.sortOrder || "desc") as "asc" | "desc";
        // Fetch extra to support offset and sorting
        const fetchLimit = offset + actualLimit;
        
        let allResults = await searchBlocksByTag(tagQuery, Math.min(fetchLimit, 200));
        
        // Sort results if sortBy is specified
        if (sortBy && allResults.length > 0) {
          allResults = [...allResults].sort((a: any, b: any) => {
            const aTime = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
            const bTime = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
            return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
          });
        }
        
        const results = allResults.slice(offset, offset + actualLimit);
        const totalFetched = allResults.length;

        if (results.length === 0) {
          if (offset > 0 && totalFetched > 0) {
            return `No more results after offset ${offset}. Total found: ${totalFetched} block(s).`;
          }
          return countOnly 
            ? formatCountOnlyResult(0, `标签 "${tagQuery}" 的笔记`, false, actualLimit)
            : `No blocks found with tag query "${tagQuery}".`;
        }

        // Count only mode - just return the count
        if (countOnly) {
          return formatCountOnlyResult(totalFetched, `标签 "${tagQuery}" 的笔记`, totalFetched >= fetchLimit, fetchLimit);
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = briefMode
          ? results.map((r: any, i: number) => formatBriefResult(r, i + offset)).join("\n")
          : results
              .map((r: any, i: number) => {
                const base = formatBlockResult(r, i + offset);
                const props = formatPropertyValues(r.propertyValues);
                return `${base}${props}`;
              })
              .join("\n\n");
        
        // Build pagination info
        let paginationInfo = "";
        if (offset > 0 || totalFetched >= fetchLimit) {
          paginationInfo = `\n\n📄 显示第 ${offset + 1}-${offset + results.length} 条`;
          if (totalFetched >= fetchLimit) {
            paginationInfo += `（可能还有更多，用 offset:${offset + actualLimit} 获取下一页）`;
          }
        }
        const limitWarning = totalFetched >= fetchLimit ? buildLimitWarning(totalFetched, requestedMax, fetchLimit) : "";
        const sortInfo = sortBy ? `\n🔄 按${sortBy === "created" ? "创建时间" : "修改时间"}${sortOrder === "desc" ? "降序" : "升序"}排列` : "";

        return `${preservationNote}Found ${results.length} block(s) with tag "${tagQuery}":${sortInfo}\n${summary}${paginationInfo}${limitWarning}`;
      } catch (err: any) {
        return `Error searching by tag: ${err.message}`;
      }
    } else if (toolName === "searchBlocksByText") {
      try {
        const query = args.query;
        const countOnly = args.countOnly === true;
        const briefMode = args.briefMode === true;
        const offset = Math.max(0, Math.trunc(args.offset || 0));
        const requestedMax = args.maxResults || (countOnly ? 200 : 20);
        const actualLimit = Math.min(requestedMax, countOnly ? 200 : 50);
        const sortBy = args.sortBy as "created" | "modified" | undefined;
        const sortOrder = (args.sortOrder || "desc") as "asc" | "desc";
        const fetchLimit = offset + actualLimit;

        let allResults = await searchBlocksByText(query, Math.min(fetchLimit, 200));
        
        // Sort results if sortBy is specified
        if (sortBy && allResults.length > 0) {
          allResults = [...allResults].sort((a: any, b: any) => {
            const aTime = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
            const bTime = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
            return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
          });
        }
        
        const results = allResults.slice(offset, offset + actualLimit);
        const totalFetched = allResults.length;

        if (results.length === 0) {
          if (offset > 0 && totalFetched > 0) {
            return `No more results after offset ${offset}. Total found: ${totalFetched} block(s).`;
          }
          return countOnly
            ? formatCountOnlyResult(0, `包含 "${query}" 的笔记`, false, actualLimit)
            : `No blocks found matching text "${query}".`;
        }

        // Count only mode
        if (countOnly) {
          return formatCountOnlyResult(totalFetched, `包含 "${query}" 的笔记`, totalFetched >= fetchLimit, fetchLimit);
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = briefMode
          ? results.map((r: any, i: number) => formatBriefResult(r, i + offset)).join("\n")
          : results.map((r: any, i: number) => formatBlockResult(r, i + offset)).join("\n\n");
        
        // Build pagination info
        let paginationInfo = "";
        if (offset > 0 || totalFetched >= fetchLimit) {
          paginationInfo = `\n\n📄 显示第 ${offset + 1}-${offset + results.length} 条`;
          if (totalFetched >= fetchLimit) {
            paginationInfo += `（可能还有更多，用 offset:${offset + actualLimit} 获取下一页）`;
          }
        }
        const limitWarning = totalFetched >= fetchLimit ? buildLimitWarning(totalFetched, requestedMax, fetchLimit) : "";
        const sortInfo = sortBy ? `\n🔄 按${sortBy === "created" ? "创建时间" : "修改时间"}${sortOrder === "desc" ? "降序" : "升序"}排列` : "";

        return `${preservationNote}Found ${results.length} block(s) matching "${query}":${sortInfo}\n${summary}${paginationInfo}${limitWarning}`;
      } catch (err: any) {
        return `Error searching by text: ${err.message}`;
      }
    } else if (toolName === "query_blocks_by_tag") {
      try {
        const tagName = args.tagName;
        
        // Early validation: check for undefined tagName
        if (!tagName) {
          return "Error: Missing tagName parameter. Please specify which tag to search for.";
        }
        
        let filters = args.filters || args.properties || [];
        const requestedMax = args.maxResults || 20;
        const actualLimit = Math.min(requestedMax, 50);

        // Handle case where AI passes filters as a JSON string instead of array
        if (typeof filters === "string") {
          try {
            filters = JSON.parse(filters);
          } catch (parseErr) {
            filters = [];
          }
        }

        const results = await queryBlocksByTag(tagName, { properties: filters, maxResults: actualLimit });

        if (results.length === 0) {
          const filterDesc = filters.length > 0 ? " with specified filters" : "";
          return `No blocks found for #${tagName}${filterDesc}. This is the complete result - no further queries needed.`;
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results
          .map((r: any, i: number) => {
            const base = formatBlockResult(r, i);
            const props = formatPropertyValues(r.propertyValues);
            return `${base}${props}`;
          })
          .join("\n\n");
        const limitWarning = buildLimitWarning(results.length, requestedMax, actualLimit);

        // Add explicit completion indicator to prevent unnecessary follow-up queries
        return `${preservationNote}✅ Search complete. Found ${results.length} block(s) for #${tagName}:\n${summary}${limitWarning}\n\n---\n📋 Above are all matching results. You can directly reference these blocks using the blockid format shown.${results.length >= actualLimit ? " Note: More results may exist beyond the limit." : " No further queries needed."}`;
      } catch (err: any) {
        return `Error querying tag with filters: ${err.message}`;
      }
    } else if (toolName === "getRecentJournals") {
      try {
        let days = args.days ?? 7;
        const includeChildren = args.includeChildren !== false; // default true

        if (Array.isArray(days)) {
          days = days[0];
        }

        let normalizedDays = Number.isFinite(Number(days))
          ? Math.abs(Math.trunc(Number(days)))
          : 7;
        
        // 限制最大 7 天
        if (normalizedDays > 7) {
          return `⛔ days 参数最大为 7，你请求了 ${normalizedDays} 天。

如需查询更长时间范围的日记，请使用 getJournalsByDateRange 工具：
- 某月日记：rangeType="month", value="2025-01"
- 某周日记：rangeType="week", value="this-week"

不要再用 getRecentJournals 查询超过 7 天的日记。`;
        }


        const results = await getRecentJournals(
          normalizedDays,
          includeChildren,
          normalizedDays // maxResults = days
        );

        if (results.length === 0) {
          return `No journal entries found in the last ${normalizedDays} day(s).`;
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");

        return `${preservationNote}Found ${results.length} journal entries in the last ${normalizedDays} day(s):\n${summary}`;
      } catch (err: any) {
        return `Error getting recent journals: ${err.message}`;
      }
    } else if (toolName === "getTodayJournal") {
      try {
        const includeChildren = args.includeChildren !== false; // default true


        // Get today's date in YYYY-MM-DD format
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        try {
          // Use the dedicated getTodayJournal function from search-service
          // This uses get-journal-block backend API with data-type="journal"
          const todayJournal = await getTodayJournal(includeChildren);
          
          if (todayJournal) {
            const preservationNote = addLinkPreservationNote(1);
            const formatted = formatBlockResult(todayJournal, 0);
            return `${preservationNote}Today's journal (${todayStr}):\n${formatted}`;
          }
        } catch (journalErr: any) {
        }

        return `No journal entry found for today (${todayStr}). Please create it manually in Orca.`;
      } catch (err: any) {
        return `Error getting today's journal: ${err.message}`;
      }
    } else if (toolName === "getJournalByDate") {
      try {
        const dateStr = args.date;
        const includeChildren = args.includeChildren !== false; // default true

        if (!dateStr) {
          return "Error: date parameter is required. Format: YYYY-MM-DD (e.g., 2024-12-25)";
        }


        const journal = await getJournalByDate(dateStr, includeChildren);
        
        if (journal) {
          const preservationNote = addLinkPreservationNote(1);
          const formatted = formatBlockResult(journal, 0);
          return `${preservationNote}Journal for ${dateStr}:\n${formatted}`;
        }

        return `No journal entry found for ${dateStr}.`;
      } catch (err: any) {
        return `Error getting journal for specified date: ${err.message}`;
      }
    } else if (toolName === "getJournalsByDateRange") {
      try {
        const rangeType = args.rangeType;
        const value = args.value;
        const endValue = args.endValue;
        const includeChildren = args.includeChildren !== false;
        const maxResults = args.maxResults || 31;

        if (!rangeType || !value) {
          return "Error: rangeType and value parameters are required.";
        }

        if (!["year", "month", "week", "range"].includes(rangeType)) {
          return "Error: rangeType must be one of: year, month, week, range";
        }

        if (rangeType === "range" && !endValue) {
          return "Error: endValue is required when rangeType is 'range'";
        }


        // 年份查询：直接获取数据并返回导出按钮
        if (rangeType === "year") {
          
          const results = await getJournalsByDateRange(
            "year",
            value,
            undefined,
            includeChildren,
            366 // 最多一年的天数
          );
          
          if (results.length === 0) {
            return `${value}年没有找到任何日记。`;
          }
          
          // 过滤掉没有内容的日记，并添加元数据
          const exportData = results
            .map((r: any) => {
              const content = (r.fullContent || r.content || "").trim();
              return {
                date: r.title || "",
                content,
                blockId: r.id,
                // 元数据
                created: r.created ? (r.created instanceof Date ? r.created.toISOString() : r.created) : undefined,
                modified: r.modified ? (r.modified instanceof Date ? r.modified.toISOString() : r.modified) : undefined,
                wordCount: content.length,
                tags: r.tags || [],
                hasImages: /!\[.*?\]\(.*?\)/.test(content) || content.includes("orca-file:"),
                hasLinks: /\[\[.*?\]\]/.test(content) || /\[.*?\]\(orca-block:/.test(content),
                childCount: r.childCount || 0,
                // 子块详情（每个块的内容和时间）
                blocks: r.rawTree ? extractBlocksFromTree(r.rawTree) : undefined,
              };
            })
            .filter((entry: any) => entry.content.length > 0);
          
          if (exportData.length === 0) {
            return `${value}年的日记都没有内容。`;
          }
          
          const rangeLabel = `${value}年`;
          
          // 存入缓存，返回缓存 ID
          const cacheId = `year-${value}-${Date.now()}`;
          setJournalExportCache(cacheId, rangeLabel, exportData);

          // 返回 journal-export 代码块，前端会渲染为导出按钮
          return `\`\`\`journal-export\ncache:${cacheId}\n\`\`\``;
        }

        const results = await getJournalsByDateRange(
          rangeType as "year" | "month" | "week" | "range",
          value,
          endValue,
          includeChildren,
          maxResults
        );

        if (results.length === 0) {
          return `No journal entries found for the specified range (${rangeType}: ${value}${endValue ? ` to ${endValue}` : ""}).`;
        }

        // 月份查询：只显示统计 + 导出按钮，不显示完整内容
        if (rangeType === "month") {
          // 过滤掉没有内容的日记，并添加元数据
          const exportData = results
            .map((r: any) => {
              const content = (r.fullContent || r.content || "").trim();
              return {
                date: r.title || "",
                content,
                blockId: r.id,
                // 元数据
                created: r.created ? (r.created instanceof Date ? r.created.toISOString() : r.created) : undefined,
                modified: r.modified ? (r.modified instanceof Date ? r.modified.toISOString() : r.modified) : undefined,
                wordCount: content.length,
                tags: r.tags || [],
                hasImages: /!\[.*?\]\(.*?\)/.test(content) || content.includes("orca-file:"),
                hasLinks: /\[\[.*?\]\]/.test(content) || /\[.*?\]\(orca-block:/.test(content),
                childCount: r.childCount || 0,
                // 子块详情（每个块的内容和时间）
                blocks: r.rawTree ? extractBlocksFromTree(r.rawTree) : undefined,
              };
            })
            .filter((entry: any) => entry.content.length > 0);
          
          // 解析月份标签
          const monthMatch = value.match(/^(\d{4})-(\d{1,2})$/);
          const rangeLabel = monthMatch ? `${monthMatch[1]}年${parseInt(monthMatch[2])}月` : value;

          if (exportData.length === 0) {
            return `${rangeLabel}的日记都没有内容。`;
          }

          // 存入缓存，返回缓存 ID
          const cacheId = `month-${value}-${Date.now()}`;
          setJournalExportCache(cacheId, rangeLabel, exportData);

          // 返回 journal-export 代码块，前端会渲染为导出按钮
          return `\`\`\`journal-export\ncache:${cacheId}\n\`\`\``;
        }

        // last-N-days 查询：显示导出按钮
        const lastDaysMatch = value.match(/^last-(\d+)-days$/);
        if (rangeType === "range" && lastDaysMatch) {
          const days = parseInt(lastDaysMatch[1], 10);
          const exportData = results
            .map((r: any) => {
              const content = (r.fullContent || r.content || "").trim();
              return {
                date: r.title || "",
                content,
                blockId: r.id,
                // 元数据
                created: r.created ? (r.created instanceof Date ? r.created.toISOString() : r.created) : undefined,
                modified: r.modified ? (r.modified instanceof Date ? r.modified.toISOString() : r.modified) : undefined,
                wordCount: content.length,
                tags: r.tags || [],
                hasImages: /!\[.*?\]\(.*?\)/.test(content) || content.includes("orca-file:"),
                hasLinks: /\[\[.*?\]\]/.test(content) || /\[.*?\]\(orca-block:/.test(content),
                childCount: r.childCount || 0,
                // 子块详情（每个块的内容和时间）
                blocks: r.rawTree ? extractBlocksFromTree(r.rawTree) : undefined,
              };
            })
            .filter((entry: any) => entry.content.length > 0);
          
          const rangeLabel = `最近${days}天`;

          if (exportData.length === 0) {
            return `${rangeLabel}的日记都没有内容。`;
          }

          // 存入缓存，返回缓存 ID
          const cacheId = `range-last-${days}-days-${Date.now()}`;
          setJournalExportCache(cacheId, rangeLabel, exportData);

          // 返回 journal-export 代码块，前端会渲染为导出按钮
          return `\`\`\`journal-export\ncache:${cacheId}\n\`\`\``;
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");

        return `${preservationNote}Found ${results.length} journal entries for ${rangeType}: ${value}${endValue ? ` to ${endValue}` : ""}:\n${summary}`;
      } catch (err: any) {
        return `Error getting journals for date range: ${err.message}`;
      }
    } else if (toolName === "query_blocks") {
      try {
        // Advanced query with multiple conditions
        const conditions = args.conditions;
        const combineMode = args.combineMode || "and";
        const requestedMax = args.maxResults || 50;
        const actualLimit = Math.min(requestedMax, 50);

        if (!Array.isArray(conditions) || conditions.length === 0) {
          return "Error: At least one condition is required for query_blocks.";
        }


        const convertedConditions: QueryCondition[] = conditions.map((c: any) => {
          switch (c.type) {
            case "tag":
              return { type: "tag" as const, name: c.name || "" };
            case "text":
              return { type: "text" as const, text: c.text || "" };
            case "task":
              return { type: "task" as const, completed: c.completed };
            case "journal":
              let startOffset = normalizeJournalOffset(c.startOffset, -7);
              let endOffset = normalizeJournalOffset(c.endOffset, 0);
              if (startOffset > endOffset) {
                [startOffset, endOffset] = [endOffset, startOffset];
              }
              return {
                type: "journal" as const,
                start: { type: "relative" as const, value: startOffset, unit: "d" as const },
                end: { type: "relative" as const, value: endOffset, unit: "d" as const },
              };
            case "ref":
              return { type: "ref" as const, blockId: c.blockId || 0 };
            case "block":
              return { type: "block" as const, hasTags: c.hasTags };
            case "blockMatch":
              return { type: "blockMatch" as const, blockId: c.blockId || 0 };
            default:
              return { type: "tag" as const, name: "" };
          }
        });

        const results = await queryBlocksAdvanced({
          conditions: convertedConditions,
          combineMode: combineMode as QueryCombineMode,
          pageSize: actualLimit,
        });

        if (results.length === 0) {
          return `No blocks found matching the ${combineMode.toUpperCase()} query.`;
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");
        const limitWarning = buildLimitWarning(results.length, requestedMax, actualLimit);

        return `${preservationNote}Found ${results.length} block(s) matching ${combineMode.toUpperCase()} query:\n${summary}${limitWarning}`;
      } catch (err: any) {
        return `Error executing complex query: ${err.message}`;
      }
    } else if (toolName === "get_tag_schema") {
      try {
        let tagName = args.tagName || args.tag_name || args.tag;

        if (Array.isArray(tagName)) {
          tagName = tagName[0];
        }

        if (!tagName) {
          return "Error: Missing tag name parameter";
        }

        const schema = await getTagSchema(tagName);

        if (schema.properties.length === 0) {
          return `Tag "${tagName}" found but has no properties defined.`;
        }

        let result = `Schema for tag "${schema.tagName}":\n\n`;
        schema.properties.forEach((prop: any, i: number) => {
          result += `${i + 1}. **${prop.name}** (${prop.typeName}, type code: ${prop.type})\n`;
          if (prop.options && prop.options.length > 0) {
            result += `   Options:\n`;
            prop.options.forEach((opt: any) => {
              result += `   - "${opt.label}" → value: ${opt.value}\n`;
            });
          }
        });

        result += `\n**Usage tip**: When querying with property filters, use the numeric values shown above for choice properties.\n`;
        return result;
      } catch (err: any) {
        return `Error getting schema for tag "${args.tagName}": ${err.message}`;
      }
    } else if (toolName === "searchBlocksByReference") {
      try {
        let pageName = args.pageName || args.page_name || args.page || args.alias || args.name 
          || args.query || args.reference || args.target || args.text || args.blockName
          || args.searchText || args.pageTitle || args.title || args.reference_page_name;
        const countOnly = args.countOnly === true;
        const briefMode = args.briefMode === true;
        const offset = Math.max(0, Math.trunc(args.offset || 0));
        const requestedMax = args.maxResults || (countOnly ? 200 : 50);
        const actualLimit = Math.min(requestedMax, countOnly ? 200 : 50);
        const fetchLimit = offset + actualLimit;

        if (Array.isArray(pageName)) {
          pageName = pageName[0];
        }

        if (!pageName) {
          return "Error: Missing page name parameter. Please specify which page to find references to.";
        }


        const allResults = await searchBlocksByReference(pageName, Math.min(fetchLimit, 200));
        const results = allResults.slice(offset, offset + actualLimit);
        const totalFetched = allResults.length;

        if (results.length === 0) {
          if (offset > 0 && totalFetched > 0) {
            return `No more results after offset ${offset}. Total found: ${totalFetched} block(s).`;
          }
          return countOnly
            ? formatCountOnlyResult(0, `引用 "[[${pageName}]]" 的笔记`, false, actualLimit)
            : `No blocks found referencing "[[${pageName}]]".`;
        }

        // Count only mode
        if (countOnly) {
          return formatCountOnlyResult(totalFetched, `引用 "[[${pageName}]]" 的笔记`, totalFetched >= fetchLimit, fetchLimit);
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = briefMode
          ? results.map((r: any, i: number) => formatBriefResult(r, i + offset)).join("\n")
          : results.map((r: any, i: number) => formatBlockResult(r, i + offset)).join("\n\n");
        
        // Build pagination info
        let paginationInfo = "";
        if (offset > 0 || totalFetched >= fetchLimit) {
          paginationInfo = `\n\n📄 显示第 ${offset + 1}-${offset + results.length} 条`;
          if (totalFetched >= fetchLimit) {
            paginationInfo += `（可能还有更多，用 offset:${offset + actualLimit} 获取下一页）`;
          }
        }
        const limitWarning = totalFetched >= fetchLimit ? buildLimitWarning(totalFetched, requestedMax, fetchLimit) : "";

        return `${preservationNote}Found ${results.length} block(s) referencing "[[${pageName}]]":\n${summary}${paginationInfo}${limitWarning}`;
      } catch (err: any) {
        return `Error searching references to "${args.pageName}": ${err.message}`;
      }
    } else if (toolName === "getPage") {
      try {
        let pageName = args.pageName || args.page_name || args.page || args.name || args.alias || args.title;
        const includeChildren = args.includeChildren !== false;

        if (Array.isArray(pageName)) {
          pageName = pageName[0];
        }

        if (!pageName) {
          return "Error: Missing page name parameter.";
        }


        try {
          const result = await getPageByName(pageName, includeChildren);
          const linkTitle = result.title.replace(/[\[\]]/g, "");
          const body = result.fullContent ?? result.content;

          return `# ${linkTitle}\n\n${body}\n\n---\n📄 [查看原页面](orca-block:${result.id})`;
        } catch (error: any) {
          if (error.message?.includes("not found")) {
            return `Page "${pageName}" not found.`;
          }
          throw error;
        }
      } catch (err: any) {
        return `Error getting page "${args.pageName}": ${err.message}`;
      }
    } else if (toolName === "getBlock") {
      try {
        let blockIdRaw = args.blockId || args.block_id || args.id;
        const includeChildren = args.includeChildren !== false;
        const includeMeta = args.includeMeta === true;

        // Handle orca-block:xxx and blockid:xxx formats
        if (typeof blockIdRaw === "string") {
          const match = blockIdRaw.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
          if (match) blockIdRaw = parseInt(match[1], 10);
        }

        const blockId = toFiniteNumber(blockIdRaw);

        if (!blockId) {
          return "Error: Missing or invalid blockId parameter. Please provide a valid block ID number.";
        }


        // Get block from state or backend
        let block = orca.state.blocks[blockId] || await orca.invokeBackend("get-block", blockId);
        if (!block) {
          return `Block ${blockId} not found.`;
        }

        // Format date helper
        const formatDate = (date: any): string => {
          if (!date) return "未知";
          const d = new Date(date);
          if (isNaN(d.getTime())) return "未知";
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const hour = String(d.getHours()).padStart(2, "0");
          const min = String(d.getMinutes()).padStart(2, "0");
          return `${year}-${month}-${day} ${hour}:${min}`;
        };

        // Build content - extract text from content (may be string or ContentFragment[])
        let content = extractBlockText(block.content);
        // Ensure content is a string before splitting
        const contentStr = typeof content === "string" ? content : "";
        
        // Extract title: priority is aliases > first line of content
        let title: string;
        if (Array.isArray(block.aliases) && block.aliases.length > 0) {
          // Use aliases (page names) joined with " / "
          const validAliases = block.aliases
            .map((a: any) => String(a).trim())
            .filter((a: string) => a.length > 0);
          title = validAliases.length > 0 
            ? validAliases.join(" / ")
            : contentStr.split("\n")[0]?.substring(0, 50) || `Block #${blockId}`;
        } else {
          title = contentStr.split("\n")[0]?.substring(0, 50) || `Block #${blockId}`;
        }
        title = title.replace(/[\[\]]/g, "");

        // Get children content if requested
        let childrenContent = "";
        if (includeChildren && block.children && block.children.length > 0) {
          const childContents: string[] = [];
          for (const childId of block.children) {
            const childBlock = orca.state.blocks[childId] || await orca.invokeBackend("get-block", childId);
            if (childBlock && childBlock.content) {
              const childText = extractBlockText(childBlock.content);
              if (childText) {
                childContents.push(`  - ${childText}`);
              }
            }
          }
          if (childContents.length > 0) {
            childrenContent = "\n\n**子块内容：**\n" + childContents.join("\n");
          }
        }

        // Build meta info if requested
        let metaInfo = "";
        if (includeMeta) {
          const metaParts: string[] = [];
          if (block.created) metaParts.push(`创建: ${formatDate(block.created)}`);
          if (block.modified) metaParts.push(`修改: ${formatDate(block.modified)}`);
          if (metaParts.length > 0) {
            metaInfo = `\n📅 ${metaParts.join(" | ")}`;
          }
        }

        return `# ${title}${metaInfo}\n\n${content}${childrenContent}\n\n---\n📄 [查看原块](orca-block:${blockId})`;
      } catch (err: any) {
        return `Error getting block ${args.blockId}: ${err.message}`;
      }
    } else if (toolName === "getBlockMeta") {
      try {
        // Support both single blockId and batch blockIds
        let blockIds: number[] = [];
        
        if (args.blockIds && Array.isArray(args.blockIds)) {
          blockIds = args.blockIds.map((id: any) => {
            if (typeof id === "string") {
              const match = id.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
              if (match) return parseInt(match[1], 10);
            }
            return toFiniteNumber(id);
          }).filter((id: number | undefined): id is number => !!id);
        } else {
          // Fallback for single blockId (backward compatibility)
          let blockIdRaw = args.blockId || args.block_id || args.id;
          if (typeof blockIdRaw === "string") {
            const match = blockIdRaw.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
            if (match) blockIdRaw = parseInt(match[1], 10);
          }
          const singleId = toFiniteNumber(blockIdRaw);
          if (singleId) blockIds = [singleId];
        }

        const fields: string[] = args.fields || ["created", "modified", "tags", "properties"];

        if (blockIds.length === 0) {
          return "Error: Missing or invalid blockIds parameter.";
        }

        // Limit batch size
        if (blockIds.length > 100) {
          blockIds = blockIds.slice(0, 100);
        }


        // Format date helper
        const formatDate = (date: any): string => {
          if (!date) return "未知";
          const d = new Date(date);
          if (isNaN(d.getTime())) return "未知";
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const hour = String(d.getHours()).padStart(2, "0");
          const min = String(d.getMinutes()).padStart(2, "0");
          return `${year}-${month}-${day} ${hour}:${min}`;
        };

        // Fetch all blocks
        const results: string[] = [];
        for (const blockId of blockIds) {
          const block = orca.state.blocks[blockId] || await orca.invokeBackend("get-block", blockId);
          if (!block) {
            results.push(`- blockid:${blockId} - 未找到`);
            continue;
          }

          const parts: string[] = [`blockid:${blockId}`];
          if (fields.includes("created")) {
            parts.push(`创建: ${formatDate(block.created)}`);
          }
          if (fields.includes("modified")) {
            parts.push(`修改: ${formatDate(block.modified)}`);
          }
          if (fields.includes("tags") && block.aliases && block.aliases.length > 0) {
            parts.push(`标签: ${block.aliases.map((t: string) => `#${t}`).join(", ")}`);
          }
          if (fields.includes("properties") && block.properties && block.properties.length > 0) {
            const props = block.properties.map((p: any) => `${p.name}: ${p.value}`).join(", ");
            parts.push(`属性: ${props}`);
          }
          results.push(`- ${parts.join(" | ")}`);
        }

        return `📋 ${blockIds.length} 个块的元数据：\n${results.join("\n")}`;
      } catch (err: any) {
        return `Error getting block metadata: ${err.message}`;
      }
    } else if (toolName === "createBlock") {
      try {
        // 兼容多种参数名格式
        let refBlockIdRaw = args.refBlockId ?? args.ref_block_id ?? args.referenceBlockId ?? args.reference_block_id ?? args.blockId ?? args.block_id;

        if (typeof refBlockIdRaw === "string") {
          const match = refBlockIdRaw.match(/^orca-block:(\d+)$/);
          if (match) refBlockIdRaw = parseInt(match[1], 10);
        }

        let refBlockId = toFiniteNumber(refBlockIdRaw);
        const pageName = args.pageName || args.page_name || args.page || args.title;

        if (!refBlockId && pageName) {
          try {
            const pageResult = await getPageByName(pageName, false);
            refBlockId = pageResult.id;
          } catch (error: any) {
             return `Error: Page "${pageName}" not found.`;
          }
        }

        if (refBlockId === undefined) {
          return "Error: Missing reference. Please provide either refBlockId or pageName.";
        }

        const position = ["before", "after", "firstChild", "lastChild"].includes(args.position) ? args.position : "lastChild";
        const content = args.content || args.text || "";

        if (!content || content.trim().length === 0) {
          return "Error: Content cannot be empty.";
        }

        let refBlock = orca.state.blocks[refBlockId] || await orca.invokeBackend("get-block", refBlockId);
        if (!refBlock) return `Error: Block ${refBlockId} not found.`;

        // Navigation check
        const targetRootBlockId = await getRootBlockId(refBlockId);
        let currentRootBlockId: number | undefined = undefined;
        let targetPanelId: string | undefined = undefined;

        try {
          const activePanelId = orca.state.activePanel;
          if (activePanelId !== uiStore.aiChatPanelId) {
            targetPanelId = activePanelId;
            const activePanel = orca.nav.findViewPanel(activePanelId, orca.state.panels);
            if (activePanel?.view === "block" && activePanel.viewArgs?.blockId) {
              currentRootBlockId = await getRootBlockId(activePanel.viewArgs.blockId);
            }
          }
        } catch (error) {}

        const needsNavigation = !targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId);
        if (needsNavigation) {
          if (targetPanelId) orca.nav.replace("block", { blockId: refBlockId }, targetPanelId);
          else orca.nav.openInLastPanel("block", { blockId: refBlockId });
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        let newBlockIds: any;
        await orca.commands.invokeGroup(async () => {
          newBlockIds = await orca.commands.invokeEditorCommand(
            "core.editor.batchInsertText",
            null, refBlock, position, content, false, false
          );
        }, { topGroup: true, undoable: true });

        const newBlockId = Array.isArray(newBlockIds) ? newBlockIds[0] : newBlockIds;
        
        if (newBlockId === undefined || newBlockId === null) {
          // Try to get the last child of refBlock as fallback
          await new Promise(resolve => setTimeout(resolve, 50));
          const updatedRefBlock = orca.state.blocks[refBlockId];
          if (updatedRefBlock?.children && updatedRefBlock.children.length > 0) {
            const lastChildId = updatedRefBlock.children[updatedRefBlock.children.length - 1];
            return `✅ Created new block: [${lastChildId}](orca-block:${lastChildId})\n⚠️ 创建成功，请勿重复调用 createBlock！`;
          }
          return `Block created but ID not returned. Please check the target location.`;
        }
        
        return `✅ Created new block: [${newBlockId}](orca-block:${newBlockId})\n⚠️ 创建成功，请勿重复调用 createBlock！`;
      } catch (err: any) {
        return `Error creating block: ${err.message}`;
      }
    } else if (toolName === "createPage") {
      try {
        const blockId = toFiniteNumber(args.blockId || args.block_id || args.id);
        const pageName = args.pageName || args.page_name || args.name || args.alias;

        if (!blockId || !pageName) return "Error: Missing blockId or pageName.";

        await orca.commands.invokeEditorCommand("core.editor.createAlias", null, pageName, blockId, true);
        return `Created page [[${pageName}]] for block ${blockId}`;
      } catch (err: any) {
        return `Error creating page: ${err.message}`;
      }
    } else if (toolName === "updateTagProperties") {
      try {
        const blockId = toFiniteNumber(args.blockId || args.block_id || args.id);
        const tagNameRaw = args.tagName || args.tag_name || args.tag;
        const modeRaw = args.mode || args.updateMode || args.update_mode;
        let propertiesRaw = args.properties || args.props || args.data;

        if (!blockId || !tagNameRaw) return "Error: 缺少 blockId 或 tagName。";

        const tagName = normalizeTagNameForTool(tagNameRaw);
        if (!tagName) return "Error: tagName 不能为空。";

        const mode = (modeRaw ? String(modeRaw) : "merge").toLowerCase() as TagPropertyMergeMode;
        if (!["replace", "merge", "append"].includes(mode)) {
          return "Error: mode 参数无效，必须是 replace/merge/append。";
        }

        if (typeof propertiesRaw === "string") {
          try {
            propertiesRaw = JSON.parse(propertiesRaw);
          } catch (parseError) {
            return "Error: properties 参数必须是数组或可解析的 JSON 数组。";
          }
        }

        if (!Array.isArray(propertiesRaw)) {
          return "Error: properties 参数必须是数组。";
        }

        let schema: any;
        try {
          schema = await getCachedTagSchema(tagName);
        } catch (schemaErr: any) {
          return `Error: 找不到标签 "${tagName}"。`;
        }

        const typeMap = buildTagPropertyTypeMap(schema);
        const updates = normalizeTagPropertyList(propertiesRaw, typeMap);

        let extracted: ExtractTagPropertiesResult;
        try {
          extracted = await extractBlockTagProperties(blockId, tagName);
        } catch (extractErr: any) {
          return `Error: ${extractErr.message}`;
        }

        // Navigation check
        const targetRootBlockId = await getRootBlockId(blockId);
        let currentRootBlockId: number | undefined = undefined;
        let targetPanelId: string | undefined = undefined;

        try {
          if (orca.state.activePanel !== uiStore.aiChatPanelId) {
            targetPanelId = orca.state.activePanel;
            const activePanel = orca.nav.findViewPanel(targetPanelId, orca.state.panels);
            if (activePanel?.view === "block" && activePanel.viewArgs?.blockId) {
              currentRootBlockId = await getRootBlockId(activePanel.viewArgs.blockId);
            }
          }
        } catch (error) {}

        if (!targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId)) {
          if (targetPanelId) orca.nav.replace("block", { blockId }, targetPanelId);
          else orca.nav.openInLastPanel("block", { blockId });
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        let effectiveMode: TagPropertyMergeMode = mode;
        let warning = "";
        if (extracted.readError && mode !== "replace") {
          effectiveMode = "replace";
          warning = `\n⚠️ ${extracted.readError}`;
        }

        const existing = normalizeTagPropertyList(extracted.properties, typeMap);
        const finalProps = extracted.tagExists
          ? mergeTagProperties(existing, updates, effectiveMode, typeMap)
          : updates;

        const existingNames = existing
          .map((prop) => prop.name)
          .filter((name) => typeof name === "string" && name.trim());

        const tagProperties = finalProps.map((prop) => ({
          name: prop.name,
          value: prop.value,
          ...(prop.type !== undefined ? { type: prop.type } : {}),
        }));

        await orca.commands.invokeGroup(async () => {
          if (
            extracted.tagExists &&
            effectiveMode === "replace" &&
            extracted.tagRef?.id &&
            existingNames.length > 0
          ) {
            await orca.commands.invokeEditorCommand(
              "core.editor.deleteRefData",
              null,
              extracted.tagRef.id,
              existingNames,
            );
          }
          await orca.commands.invokeEditorCommand("core.editor.insertTag", null, blockId, tagName, tagProperties);
        }, { topGroup: true, undoable: true });

        const action = extracted.tagExists ? "已更新" : "已添加";
        return `✅ ${action} #${tagName} 标签属性（${effectiveMode}）: blockId=${blockId}${warning}`;
      } catch (err: any) {
        return `Error: 更新标签属性失败：${err.message}`;
      }
    } else if (toolName === "insertTag") {
      try {
        const blockId = toFiniteNumber(args.blockId || args.block_id || args.id);
        const tagName = args.tagName || args.tag_name || args.tag;
        const properties = args.properties || args.props;

        if (!blockId || !tagName) return "Error: Missing blockId or tagName.";

        // Navigation check
        const targetRootBlockId = await getRootBlockId(blockId);
        let currentRootBlockId: number | undefined = undefined;
        let targetPanelId: string | undefined = undefined;

        try {
          if (orca.state.activePanel !== uiStore.aiChatPanelId) {
            targetPanelId = orca.state.activePanel;
            const activePanel = orca.nav.findViewPanel(targetPanelId, orca.state.panels);
            if (activePanel?.view === "block" && activePanel.viewArgs?.blockId) {
              currentRootBlockId = await getRootBlockId(activePanel.viewArgs.blockId);
            }
          }
        } catch (error) {}

        if (!targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId)) {
          if (targetPanelId) orca.nav.replace("block", { blockId }, targetPanelId);
          else orca.nav.openInLastPanel("block", { blockId });
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const tagProperties = properties && Array.isArray(properties)
          ? properties.map((prop: any) => ({ name: prop.name, value: prop.value }))
          : undefined;

        await orca.commands.invokeGroup(async () => {
          await orca.commands.invokeEditorCommand("core.editor.insertTag", null, blockId, tagName, tagProperties);
        }, { topGroup: true, undoable: true });

        return `Added tag #${tagName} to block ${blockId}`;
      } catch (err: any) {
        return `Error inserting tag: ${err.message}`;
      }
    } else if (toolName === "getBlockLinks") {
      try {
        let blockId: number | null = null;
        let blockData: any = null;
        
        // 支持通过 pageName 查找
        const pageName = args.pageName || args.page_name || args.page || args.name;
        if (pageName && typeof pageName === "string") {
          // 通过页面名称查找，直接获取 block 数据
          const block = await orca.invokeBackend("get-block-by-alias", pageName);
          if (block) {
            blockId = block.id;
            blockData = block;
          } else {
            return `Error: 找不到名为 "${pageName}" 的页面。`;
          }
        } else {
          // 通过 blockId 查找
          let blockIdRaw = args.blockId || args.block_id || args.id;
          if (typeof blockIdRaw === "string") {
            const match = blockIdRaw.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
            if (match) blockIdRaw = parseInt(match[1], 10);
          }
          blockId = toFiniteNumber(blockIdRaw) ?? null;
          if (blockId) {
            // 先尝试从 state 获取，否则从 backend 获取
            blockData = orca.state.blocks[blockId];
            if (!blockData) {
              const result = await orca.invokeBackend("get-block", blockId);
              if (result) blockData = result;
            }
          }
        }
        
        if (!blockId) return "Error: 请提供 blockId 或 pageName 参数。";
        if (!blockData) return `Error: Block ${blockId} not found.`;

        const getTitle = async (id: number): Promise<string> => {
          let b = orca.state.blocks[id];
          if (!b) {
            try {
              b = await orca.invokeBackend("get-block", id);
            } catch {}
          }
          if (!b) return `Block ${id}`;
          const rawText = b.text || b.content || "";
          const text = typeof rawText === "string" ? rawText.split("\n")[0]?.trim() || "" : "";
          return text.length > 40 ? text.substring(0, 40) + "..." : (text || `Block ${id}`);
        };

        const centerTitle = await getTitle(blockId);
        const refs = blockData.refs || [];
        const backRefs = blockData.backRefs || [];
        const outCount = refs.length;
        const inCount = backRefs.length;

        // 返回链接列表（不返回 localgraph 代码块）
        if (outCount === 0 && inCount === 0) {
          return `[${centerTitle}](orca-block:${blockId}) 暂无链接关系。`;
        }
        
        let result = `[${centerTitle}](orca-block:${blockId}) 的链接关系：\n\n`;
        
        // 出链列表
        if (outCount > 0) {
          result += `**出链 (${outCount})**:\n`;
          for (const ref of refs.slice(0, 20)) {
            const targetId = ref.to;
            const title = await getTitle(targetId);
            result += `- [${title}](orca-block:${targetId})\n`;
          }
          if (outCount > 20) result += `- ...还有 ${outCount - 20} 个\n`;
          result += "\n";
        }
        
        // 入链（反链）列表
        if (inCount > 0) {
          result += `**入链/反链 (${inCount})**:\n`;
          for (const ref of backRefs.slice(0, 20)) {
            const sourceId = ref.from;
            const title = await getTitle(sourceId);
            result += `- [${title}](orca-block:${sourceId})\n`;
          }
          if (inCount > 20) result += `- ...还有 ${inCount - 20} 个\n`;
        }
        
        return result.trim();
      } catch (err: any) {
        return `Error getting block links: ${err.message}`;
      }
    } else if (toolName === "getSavedAiConversations") {
      try {
        const query = args.query || "";
        const maxResults = Math.min(args.maxResults || 10, 30);
        const briefMode = args.briefMode === true;

        // 通过标签搜索已保存的 AI 对话
        const result = await orca.invokeBackend("get-blocks-with-tags", ["Ai会话保存"]);
        
        
        if (!result || !Array.isArray(result) || result.length === 0) {
          return "未找到已保存的 AI 对话记录。";
        }

        // 获取完整的块信息（包括 text 字段）
        const fullBlocks = result.map((block: any) => {
          const fullBlock = orca.state.blocks[block.id] || block;
          return { ...block, ...fullBlock };
        });

        // 过滤和处理结果
        let conversations = fullBlocks;
        
        // 如果有搜索关键词，过滤结果
        if (query) {
          const lowerQuery = query.toLowerCase();
          
          conversations = conversations.filter((block: any) => {
            // 搜索块的 text 字段（可搜索文本）
            const blockText = block.text || "";
            if (blockText.toLowerCase().includes(lowerQuery)) {
              return true;
            }
            
            // 搜索 _repr 里的内容
            const repr = block._repr || {};
            const title = repr.title || "";
            const messages = repr.messages || [];
            
            // 搜索标题
            if (title.toLowerCase().includes(lowerQuery)) {
              return true;
            }
            
            // 搜索对话内容
            for (const msg of messages) {
              const content = msg.content || "";
              if (content.toLowerCase().includes(lowerQuery)) {
                return true;
              }
            }
            
            return false;
          });
        }

        // 限制结果数量
        conversations = conversations.slice(0, maxResults);

        if (conversations.length === 0) {
          return query 
            ? `未找到包含 "${query}" 的 AI 对话记录。`
            : "未找到已保存的 AI 对话记录。";
        }

        // 格式化输出
        const parts: string[] = [`找到 ${conversations.length} 条已保存的 AI 对话：\n`];

        for (const block of conversations) {
          const repr = block._repr || {};
          const title = repr.title || "AI 对话";
          const messages = repr.messages || [];
          const model = repr.model || "";
          const createdAt = repr.createdAt ? new Date(repr.createdAt).toLocaleString("zh-CN") : "";
          const blockId = block.id;

          parts.push(`## [${title}](orca-block:${blockId})`);
          if (model) parts.push(`模型: ${model}`);
          if (createdAt) parts.push(`时间: ${createdAt}`);
          parts.push(`消息数: ${messages.length}`);

          if (!briefMode && messages.length > 0) {
            parts.push("\n对话内容:");
            for (const msg of messages.slice(0, 5)) {
              const role = msg.role === "user" ? "👤 用户" : "🤖 AI";
              const content = msg.content || "";
              const preview = content.length > 300 ? content.slice(0, 300) + "..." : content;
              parts.push(`\n**${role}**: ${preview}`);
            }
            if (messages.length > 5) {
              parts.push(`\n...还有 ${messages.length - 5} 条消息`);
            }
          }
          parts.push("\n---\n");
        }

        return parts.join("\n");
      } catch (err: any) {
        return `Error getting saved AI conversations: ${err.message}`;
      }
    } else if (toolName === "webSearch") {
      // 联网搜索工具 - 支持多引擎故障转移
      try {
        const query = args.query;
        if (!query) {
          return "Error: Missing query parameter for web search.";
        }
        
        const { getAiChatPluginName } = await import("../ui/ai-chat-ui");
        const { getAiChatSettings } = await import("../settings/ai-chat-settings");
        const { searchWithFallback } = await import("./web-search-service");
        
        const pluginName = getAiChatPluginName();
        const settings = getAiChatSettings(pluginName);
        const webConfig = settings.webSearch;
        
        if (!webConfig) {
          return "Error: 联网搜索未配置。请在设置中配置搜索引擎。";
        }
        
        const maxResults = Math.min(args.maxResults || webConfig.maxResults || 5, 20);
        
        // 检查是否有配置的搜索引擎实例
        const instances = webConfig.instances || [];
        
        if (instances.length === 0) {
          // 兼容旧版配置：如果没有 instances，尝试从旧字段构建
          if (webConfig.tavilyApiKey) {
            instances.push({
              id: "legacy-tavily",
              provider: "tavily",
              enabled: true,
              name: "Tavily",
              tavilyApiKey: webConfig.tavilyApiKey,
              tavilySearchDepth: webConfig.tavilySearchDepth,
              tavilyIncludeAnswer: webConfig.tavilyIncludeAnswer,
              tavilyIncludeDomains: webConfig.tavilyIncludeDomains,
              tavilyExcludeDomains: webConfig.tavilyExcludeDomains,
            });
          }
          if (instances.length === 0) {
            return "Error: 没有配置搜索引擎。请在联网搜索设置中添加至少一个搜索引擎。";
          }
        }
        
        
        // 使用故障转移搜索
        const response = await searchWithFallback(query, instances, maxResults);
        
        // 存储原始搜索结果供自动增强使用
        const cacheKey = `websearch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        searchResultsCache.set(cacheKey, response.results || []);
        
        // 在格式化结果中包含缓存键（隐藏在HTML注释中）
        const formattedResults = formatSearchResults(response);
        return `${formattedResults}\n<!-- search-cache:${cacheKey} -->`;
      } catch (err: any) {
        return `Error searching web: ${err.message}`;
      }
    } else if (toolName === "imageSearch") {
      // 图像搜索工具 - 支持多引擎故障转移
      const query = args.query; // 将query定义移到try块外面
      try {
        if (!query) {
          return "Error: Missing query parameter for image search.";
        }
        
        const { getAiChatPluginName } = await import("../ui/ai-chat-ui");
        const { getAiChatSettings } = await import("../settings/ai-chat-settings");
        const { searchImages, formatImageResults } = await import("./image-search-service");
        
        const pluginName = getAiChatPluginName();
        const settings = getAiChatSettings(pluginName);
        const webConfig = settings.webSearch;
        
        if (!webConfig) {
          return "Error: 联网搜索未配置。请在设置中配置搜索引擎以使用图像搜索。";
        }
        
        const maxResults = Math.min(args.maxResults || 3, 6);
        const instances = webConfig.instances || [];
        
        // 构建图像搜索引擎列表（按优先级排序）
        // 优先级：Google > SerpApi > Bing > Brave > SearXNG > DuckDuckGo
        type ImageSearchAttempt = {
          provider: "google" | "bing" | "duckduckgo" | "serpapi" | "brave" | "searxng";
          config: any;
          name: string;
        };
        
        const searchAttempts: ImageSearchAttempt[] = [];
        
        // 添加所有配置的 Google 实例
        const googleInstances = instances.filter(i => i.provider === "google" && i.enabled && i.googleApiKey && i.googleSearchEngineId);
        for (const inst of googleInstances) {
          searchAttempts.push({
            provider: "google",
            name: inst.name || "Google Images",
            config: {
              provider: "google",
              maxResults,
              google: {
                apiKey: inst.googleApiKey!,
                searchEngineId: inst.googleSearchEngineId!,
                gl: inst.googleGl,
                hl: inst.googleHl || "zh-CN",
                safe: inst.googleSafe || "off",
              },
            },
          });
        }
        
        // 添加所有配置的 SerpApi 实例
        const serpapiInstances = instances.filter(i => i.provider === "serpapi" && i.enabled && i.serpapiApiKey);
        for (const inst of serpapiInstances) {
          searchAttempts.push({
            provider: "serpapi",
            name: inst.name || "SerpApi",
            config: {
              provider: "serpapi",
              maxResults,
              serpapi: {
                apiKey: inst.serpapiApiKey!,
                gl: inst.serpapiGl || "cn",
                hl: inst.serpapiHl || "zh-cn",
              },
            },
          });
        }
        
        // 添加所有配置的 Bing 实例
        const bingInstances = instances.filter(i => i.provider === "bing" && i.enabled && i.bingApiKey);
        for (const inst of bingInstances) {
          searchAttempts.push({
            provider: "bing",
            name: inst.name || "Bing Images",
            config: {
              provider: "bing",
              maxResults,
              bing: {
                apiKey: inst.bingApiKey!,
                mkt: inst.bingMarket || "zh-CN",
                safeSearch: "Moderate",
              },
            },
          });
        }
        
        // 添加所有配置的 Brave 实例（真正的搜索引擎图片搜索）
        const braveInstances = instances.filter(i => i.provider === "brave" && i.enabled && i.braveApiKey);
        for (const inst of braveInstances) {
          searchAttempts.push({
            provider: "brave",
            name: inst.name || "Brave Images",
            config: {
              provider: "brave",
              maxResults,
              brave: {
                apiKey: inst.braveApiKey!,
                country: inst.braveCountry || "US",
                safeSearch: inst.braveSafeSearch || "moderate",
              },
            },
          });
        }
        
        // 添加 SearXNG 图片搜索（免费元搜索引擎）
        const searxngInstances = instances.filter(i => i.provider === "searxng" && i.enabled);
        for (const inst of searxngInstances) {
          searchAttempts.push({
            provider: "searxng",
            name: inst.name || "SearXNG Images",
            config: {
              provider: "searxng",
              maxResults,
              searxng: {
                instanceUrl: inst.searxngInstanceUrl,
                safeSearch: inst.searxngSafeSearch ?? 1,
              },
            },
          });
        }
        // 如果没有配置 SearXNG 实例，添加一个默认的（使用公共实例）
        if (searxngInstances.length === 0) {
          searchAttempts.push({
            provider: "searxng",
            name: "SearXNG Images (公共)",
            config: {
              provider: "searxng",
              maxResults,
              searxng: {
                safeSearch: 1,
              },
            },
          });
        }
        
        // 添加 DuckDuckGo 作为最后的备选（不太可靠）
        searchAttempts.push({
          provider: "duckduckgo",
          name: "DuckDuckGo Images",
          config: {
            provider: "duckduckgo",
            maxResults,
            duckduckgo: {
              region: "cn-zh",
              safeSearch: "moderate",
            },
          },
        });
        
        // 依次尝试每个搜索引擎，直到成功
        let lastError: Error | null = null;
        const failedProviders: string[] = [];
        
        for (const attempt of searchAttempts) {
          try {
            console.log(`[imageSearch] Trying ${attempt.name}...`);
            const response = await searchImages(query, attempt.config);
            
            if (response.results.length === 0) {
              console.log(`[imageSearch] ${attempt.name} returned no results, trying next...`);
              failedProviders.push(`${attempt.name} (无结果)`);
              continue;
            }
            
            // 成功！格式化结果
            const lines: string[] = [];
            lines.push(`🖼️ 找到 ${response.results.length} 张与"${query}"相关的图片:\n`);
            
            response.results.forEach((img, i) => {
              lines.push(`${i + 1}. ![${img.title}](${img.url})`);
              if (img.sourceUrl && img.sourceUrl !== img.url) {
                lines.push(`   📄 来源: [${extractDomain(img.sourceUrl)}](${img.sourceUrl})`);
              }
              if (img.width && img.height) {
                lines.push(`   📐 尺寸: ${img.width}×${img.height}${img.size ? ` (${img.size})` : ""}`);
              }
              lines.push("");
            });
            
            lines.push(`\n🔍 图片搜索由 ${response.provider} 提供`);
            if (failedProviders.length > 0) {
              lines.push(`⚠️ 已跳过: ${failedProviders.join(", ")}`);
            }
            if (response.responseTime) {
              lines.push(`⏱️ 搜索耗时: ${response.responseTime}ms`);
            }
            
            return lines.join("\n");
          } catch (err: any) {
            console.warn(`[imageSearch] ${attempt.name} failed:`, err.message);
            lastError = err;
            failedProviders.push(`${attempt.name} (${err.message})`);
            // 继续尝试下一个引擎
          }
        }
        
        // 所有引擎都失败了
        return `❌ 图片搜索失败\n\n**尝试的搜索引擎：**\n${failedProviders.map(p => `- ${p}`).join("\n")}\n\n**建议：**\n- 检查 API Key 是否有效\n- 检查 API 配额是否用完\n- 尝试添加更多搜索引擎作为备选\n- 可以直接问我关于"${query}"的描述`;
        
      } catch (err: any) {
        // 提供更友好的错误信息和解决方案
        const errorMessage = err.message || "未知错误";
        
        if (errorMessage.includes("403") || errorMessage.includes("DuckDuckGo")) {
          return `❌ 图片搜索暂时不可用\n\n**问题：** DuckDuckGo图片搜索遇到访问限制\n\n**解决方案：**\n1. **推荐：配置Google Images API**\n   - 访问 Google Cloud Console\n   - 启用 Custom Search API\n   - 创建 Custom Search Engine\n   - 在联网搜索设置中添加Google配置\n\n2. **或者配置Bing Images API**\n   - 访问 Azure Portal\n   - 创建 Bing Search 资源\n   - 在联网搜索设置中添加Bing配置\n\n3. **临时方案：** 可以直接问我关于"${query}"的描述，我会尽量详细说明外观特征。\n\n💡 配置API后，图片搜索功能会更稳定可靠。`;
        }
        
        return `❌ 图片搜索失败: ${errorMessage}\n\n💡 建议：\n- 检查网络连接\n- 尝试配置其他搜索引擎（Google Images或Bing Images）\n- 可以直接问我关于"${query}"的描述`;
      }
    } else if (toolName === "wikipedia") {
      // Wikipedia 搜索工具
      try {
        const query = args.query;
        const lang = args.lang || "zh";
        const fallback = args.fallback !== false; // 默认 true
        
        if (!query) {
          return "Error: 请提供搜索关键词";
        }
        
        const result = await searchWikipedia(query, lang, true, fallback);
        
        if (!result) {
          return `未在 Wikipedia (${lang}) 中找到关于"${query}"的内容。${fallback ? "已尝试英文版本。" : ""}`;
        }
        
        return formatWikipediaResult(result);
      } catch (err: any) {
        return `Wikipedia 查询失败: ${err.message}`;
      }
    } else if (toolName === "currency") {
      // 汇率转换工具
      try {
        const amount = args.amount || 1;
        const from = args.from;
        const to = args.to;
        
        if (!from) {
          return "Error: 请提供源货币";
        }
        
        if (to) {
          // 货币转换
          const result = await convertCurrency(amount, from, to);
          return formatCurrencyResult(result);
        } else {
          // 获取多种货币汇率
          const rates = await getExchangeRates(from);
          return formatExchangeRates(from.toUpperCase(), rates);
        }
      } catch (err: any) {
        return `汇率查询失败: ${err.message}`;
      }
    } else if (toolName === "fetch_url") {
      // 网页内容抓取工具
      try {
        const url = args.url;
        const maxLength = args.max_length || 50000; // 减少默认长度
        
        if (!url) {
          return "Error: 请提供 URL";
        }
        
        // 验证 URL 格式
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          return "Error: URL 必须以 http:// 或 https:// 开头";
        }
        
        console.log(`[fetch_url] Fetching: ${url}`);
        
        const result = await fetchWebContent(url, {
          maxLength,
          timeout: 15000, // 15 秒超时
        });
        
        return formatFetchedContent(result);
      } catch (err: any) {
        return `❌ 网页抓取失败: ${err.message}\n\n💡 可能的原因：\n- 网站拒绝访问或有反爬虫保护\n- URL 不正确或网页不存在\n- 网络连接问题\n- 网站需要登录才能访问`;
      }
    } else if (toolName === "generateFlashcards") {
      // 闪卡生成工具 - 返回结构化数据供前端处理
      try {
        const cards = args.cards;
        if (!cards || !Array.isArray(cards) || cards.length === 0) {
          return JSON.stringify({ 
            success: false, 
            error: "No cards provided",
            _flashcardToolResult: true 
          });
        }
        
        // 验证并转换卡片格式
        const validCards = cards.map((card: any, index: number) => {
          const cardType = card.type === "choice" ? "choice" : "basic";
          const result: any = {
            id: `card-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
            front: card.question || "",
            cardType,
          };
          
          if (cardType === "choice") {
            // 选择题
            result.back = "";
            result.options = (card.options || []).map((opt: any) => ({
              text: opt.text || "",
              isCorrect: opt.isCorrect === true,
            }));
            // 验证至少有一个正确答案
            if (!result.options.some((o: any) => o.isCorrect)) {
              // 如果没有标记正确答案，默认第一个为正确
              if (result.options.length > 0) {
                result.options[0].isCorrect = true;
              }
            }
          } else {
            // 普通问答卡
            result.back = card.answer || "";
          }
          
          return result;
        }).filter((card: any) => {
          // 过滤无效卡片
          if (!card.front) return false;
          if (card.cardType === "basic" && !card.back) return false;
          if (card.cardType === "choice" && (!card.options || card.options.length < 2)) return false;
          return true;
        });
        
        if (validCards.length === 0) {
          return JSON.stringify({ 
            success: false, 
            error: "No valid cards after validation",
            _flashcardToolResult: true 
          });
        }
        
        
        // 返回结构化结果，前端会识别 _flashcardToolResult 标记
        return JSON.stringify({
          success: true,
          cards: validCards,
          count: validCards.length,
          _flashcardToolResult: true,
        });
      } catch (err: any) {
        return JSON.stringify({ 
          success: false, 
          error: err.message,
          _flashcardToolResult: true 
        });
      }
    } else {
      // 尝试处理脚本分析工具
      const scriptResult = await handleScriptAnalysisTool(toolName, args);
      if (scriptResult !== null) {
        return scriptResult;
      }
      
      // 尝试处理 Skill 工具
      if (toolName.startsWith("skill_")) {
        try {
          // 从工具名称中提取原始 Skill ID
          // 需要从所有 skills 中查找匹配的
          const { listSkills, getSkill } = await import("./skills-manager");
          const skillIds = await listSkills();
          
          // 尝试找到匹配的 Skill
          let matchedSkillId: string | null = null;
          
          for (let i = 0; i < skillIds.length; i++) {
            const skillId = skillIds[i];
            const sanitizedName = sanitizeSkillName(skillId, i);
            if (sanitizedName === toolName) {
              matchedSkillId = skillId;
              break;
            }
          }
          
          if (!matchedSkillId) {
            return `Skill not found for tool: ${toolName}`;
          }
          
          // 获取 Skill 详情
          const skill = await getSkill(matchedSkillId);
          if (!skill) {
            return `Skill not found: ${matchedSkillId}`;
          }
          
          // 返回 Skill 的指令和输入
          const input = args.input || "";
          return `# 执行技能：${skill.metadata.name}

## 用户输入
${input}

## 技能指令
${skill.instruction}

---

请根据上述指令处理用户输入。`;
        } catch (err: any) {
          return `Error executing skill: ${err.message}`;
        }
      }
      
      return `Unknown tool: ${toolName}`;
    }
  } catch (error: any) {
    return `Error executing ${toolName}: ${error?.message ?? error}`;
  }
}
