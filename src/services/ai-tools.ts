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

// ─────────────────────────────────────────────────────────────────────────────
// Skill Tool Name Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 生成稳定、可复现且符合 OpenAI 规范的 Skill 工具名。
 *
 * 约束：工具名称只能包含字母、数字、下划线、连字符。
 *
 * 设计目标：
 * - 对中文/特殊字符友好（不会被清空成同一个名字）
 * - 名称稳定（不依赖数组 index，避免列表变化导致映射错乱）
 * - 尽量避免重复（使用 64-bit FNV-1a hash 作为稳定后缀）
 */
function fnv1a64Hex(input: string): string {
  // 64-bit FNV-1a
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function skillIdToSlug(skillId: string): string {
  // 1) 把空白变成下划线
  // 2) 移除非 [a-zA-Z0-9_-] 字符
  // 3) 合并多余下划线
  const slug = skillId
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  // 过长的函数名可能被模型/SDK 拒绝；这里保守截断 slug。
  const capped = (slug || "s").slice(0, 24);
  return capped || "s";
}

/**
 * Exported: other modules (precheck / tool execution) must use the same naming.
 */
export function getSkillToolName(skillId: string): string {
  const slug = skillIdToSlug(skillId);
  const hash = fnv1a64Hex(skillId);
  // Always starts with "skill_" (letter), and only contains allowed chars.
  return `skill_${slug}_${hash}`;
}

/**
 * In-memory cache for displaying and resolving skill tool names.
 *
 * NOTE: Tool names are generated deterministically from skillId, so this cache is only
 * a convenience for sync lookups (UI display). It is populated when skill tools are loaded.
 */
export const skillToolNameToSkillIdCache = new Map<string, string>();

export async function resolveSkillIdFromToolName(toolName: string): Promise<{ id: string; isGlobal: boolean } | null> {
  if (!toolName.startsWith("skill_")) return null;
  try {
    const { listSkills } = await import("./skills-manager");
    const skillRefs = await listSkills();
    for (const ref of skillRefs) {
      if (getSkillToolName(ref.id) === toolName) {
        return ref;
      }
    }
    return null;
  } catch (err) {
    console.warn("[SkillTools] Failed to resolve skill ID from tool name:", err);
    return null;
  }
}

/**
 * Level 1: 获取 Skill 元数据列表（轻量级）
 * 用于 AI 发现可用的 Skills，成本极低
 */
export async function getSkillMetadataAsync(): Promise<OpenAITool[]> {
  try {
    const { listSkills, getSkill } = await import("./skills-manager");
    const skillRefs = await listSkills();
    const tools: OpenAITool[] = [];

    // Reset cache to avoid stale entries when skills list changes
    skillToolNameToSkillIdCache.clear();
    
    for (let i = 0; i < skillRefs.length; i++) {
      const ref = skillRefs[i];
      try {
        const skill = await getSkill(ref.id, ref.isGlobal);
        if (!skill) continue;
        
        // 生成符合 OpenAI 规范的工具名称（稳定映射）
        const toolName = getSkillToolName(ref.id);
        
        // 验证工具名称是否符合规范
        if (!/^[a-zA-Z0-9_-]+$/.test(toolName)) {
          console.error(`[SkillTools] Generated invalid tool name: "${toolName}" from skillId: "${ref.id}"`);
          continue; // 跳过无效的工具
        }
        
        console.log(`[SkillTools] Skill "${ref.id}" (${ref.isGlobal ? 'global' : 'local'}) → tool name "${toolName}"`);
        
        // Level 1: 只返回元数据，不包含详细指令
        // 在 description 中包含原始 Skill ID，以便后续查找
        // Populate cache for UI display
        skillToolNameToSkillIdCache.set(toolName, ref.id);

        tools.push({
          type: "function",
          function: {
            name: toolName,
            description: `[Skill: ${ref.id}] ${skill.metadata.description || skill.metadata.name || ref.id}`,
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
        console.warn(`[SkillTools] Failed to load skill metadata ${ref.id}:`, err);
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
 * @param skillRef Skill 引用（包含 id 和 isGlobal）
 */
export async function getSkillInstructionsAsync(skillRef: { id: string; isGlobal: boolean }): Promise<string | null> {
  try {
    const { getSkill } = await import("./skills-manager");
    const skill = await getSkill(skillRef.id, skillRef.isGlobal);
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
    console.error(`[SkillTools] Failed to get skill instructions for ${skillRef.id}:`, err);
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
      name: "searchNotes",
      description: `全文搜索笔记内容。

【示例】query="会议记录"`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认20",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPage",
      description: `按名称获取页面内容（包含所有子块）。

【示例】pageName="项目A" 或 pageName="2024-01-15"`,
      parameters: {
        type: "object",
        properties: {
          pageName: {
            type: "string",
            description: "页面名称或别名",
          },
        },
        required: ["pageName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBlocksText",
      description: `按ID获取块的文本内容（包含所有子块）。

【示例】blockIds=[123, 456]`,
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            items: { type: "number" },
            description: "块ID数组",
          },
        },
        required: ["blockIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "queryByTagProperty",
      description: `按标签属性过滤查询。用于查找特定状态/优先级的笔记。

【示例】
- 查找已完成任务：tagName="Task", property="状态", value="Done"
- 查找高优先级：tagName="Task", property="优先级", value="高"
- 查找正在读的书：tagName="book", property="状态", value="reading"`,
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "标签名，不带#号",
          },
          property: {
            type: "string",
            description: "属性名称",
          },
          value: {
            type: "string",
            description: "属性值",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认20",
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
      description: `Execute complex queries against an Orca note repository using the advanced QueryDescription2 format.

QUERY STRUCTURE:
The query system uses a hierarchical structure with groups and conditions:

1. QUERY GROUPS (kind values):
   - 100: SELF_AND - All conditions must match
   - 101: SELF_OR - At least one condition must match
   - 106: CHAIN_AND - All conditions must match in either the ancestors (inside) or descendants (outside) or itself

2. CONDITION TYPES (kind values):
   - 3: Journal query - Match journal blocks in date ranges
   - 4: Tag query - Match blocks with specific tags and their properties
   - 6: Reference query - Match blocks referencing other blocks
   - 8: Text query - Match blocks containing specific text
   - 9: Block query - Match blocks by their properties (type, parent, children, etc.)
   - 11: Task query - Match task blocks with completion status
   - 12: Block match query - Match specific blocks by ID

The root group must be 100 (SELF_AND).

CONDITIONS ARRAY:
When using groups (kind 100, 101, 106), the 'conditions' array can contain:
- Individual query conditions (objects with kind 3,4,6,8,9,11,12)
- Nested groups (objects with kind 100, 101, 106 and their own conditions array)
- Each condition object must have a 'kind' field to identify its type

DATE SPECIFICATIONS:
- Relative dates: {"t": 1, "v": -7, "u": "d"} (7 days ago)
- Absolute dates: {"t": 2, "v": 1640995200000} (timestamp)
- Units: s=seconds, m=minutes, h=hours, d=days, w=weeks, M=months, y=years

OPERATIONS for tag properties:
- 1: equals, 2: not equals, 3: includes, 4: not includes
- 5: has, 6: not has, 7: greater than, 8: less than
- 9: greater or equal, 10: less or equal, 11: is null, 12: not null

SORTING & PAGINATION:
- sort: [["_created", "DESC"], ["_text", "ASC"]]
- Built-in fields: _created, _modified, _text, _journal and _refcount
- page: 1 (starting from 1), pageSize: 50 (default)

COMMON QUERY PATTERNS:

1. Find blocks below or above of other blocks (chain AND):
{"q": {"kind": 100, "conditions": [{"kind": 106, "conditions": [{"kind": 8, "text": "project"}]}, {"kind": 8, "text": "deadline"}]}}

2. AND query (multiple conditions must match):
{"q": {"kind": 100, "conditions": [{"kind": 4, "name": "project"}, {"kind": 8, "text": "deadline"}]}}

3. OR query (any condition matches, used for merging queries together):
{"q": {"kind": 100, "conditions": [{"kind": 101, "conditions": [{"kind": 4, "name": "urgent"}, {"kind": 4, "name": "important"}]}]}}

4. Journal blocks in date range:
{"q": {"kind": 100, "conditions": [{"kind": 3, "start": {"t": 2, "v": 1640995200000}, "end": {"t": 2, "v": 1641081600000}}]}}

5. Blocks with tag properties:
{"q": {"kind": 100, "conditions": [{"kind": 4, "name": "task", "properties": [{"name": "priority", "op": 1, "value": "high"}]}]}}

6. Find all incomplete tasks:
{"q": {"kind": 100, "conditions": [{"kind": 11, "completed": false}]}}`,
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "object",
            description: "Query description object with kind and conditions",
          },
          sort: {
            type: "array",
            description: "Sort order, e.g. [[\"_created\", \"DESC\"]]",
          },
          pageSize: {
            type: "number",
            description: "Number of results, default 20, max 50",
          },
        },
        required: ["q"],
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
【参数】date: 格式YYYY-MM-DD如"2026-01-05"，或"yesterday"`,
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "日期，格式YYYY-MM-DD或yesterday",
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
      name: "getJournals",
      description: `获取日记（范围查询）。

【用法】优先级：days > month > week > startDate/endDate
- 最近N天：days=7（最近7天）、days=30（最近30天）
- 某月：month="2024-05"
- 某周：week="this"（本周）或 week="last"（上周）
- 自定义范围：startDate="2024-05-01", endDate="2024-05-15"`,
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "最近N天，如7表示最近7天",
          },
          month: {
            type: "string",
            description: "某月，格式YYYY-MM如2024-05",
          },
          week: {
            type: "string",
            enum: ["this", "last"],
            description: "本周或上周",
          },
          startDate: {
            type: "string",
            description: "自定义起始日期YYYY-MM-DD",
          },
          endDate: {
            type: "string",
            description: "自定义结束日期YYYY-MM-DD",
          },
          includeChildren: {
            type: "boolean",
            description: "包含子块，默认true",
          },
          maxResults: {
            type: "number",
            description: "最大结果数，默认31",
          },
        },
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
      description: `修改标签属性值。

【示例】把 #book 的 status 改为 "已读"：
{"blockId": 123, "tagName": "book", "properties": [{"name": "status", "value": "已读"}]}`,
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "目标块ID",
          },
          tagName: {
            type: "string",
            description: "标签名，不带#",
          },
          properties: {
            type: "array",
            description: "要更新的属性",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "属性名" },
                value: { type: "string", description: "新值" },
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
 * 工具类别定义
 */
export type ToolCategory = 
  | "core"       // 核心工具（tool_instructions）
  | "search"     // 笔记搜索
  | "journal"    // 日记
  | "read"       // 读取
  | "write"      // 写入
  | "web"        // 联网搜索
  | "code"       // 代码执行
  | "file"       // 本地文件
  | "analysis"   // 统计分析
  | "skill";     // 技能

/**
 * 工具名称到类别的映射
 */
const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // 搜索
  "searchNotes": "search",
  "queryByTagProperty": "search",
  "query_blocks": "search",
  "searchBlocksByReference": "search",
  "getSavedAiConversations": "search",
  // 日记
  "getTodayJournal": "journal",
  "getJournalByDate": "journal",
  "getJournals": "journal",
  // 读取
  "getPage": "read",
  "getBlocksText": "read",
  "getBlockMeta": "read",
  "getBlockLinks": "read",
  // 写入
  "createBlock": "write",
  "createPage": "write",
  "insertTag": "write",
  "updateTagProperties": "write",
  // 联网
  "webSearch": "web",
  "imageSearch": "web",
  "wikipedia": "web",
  "fetch_url": "web",
  "currency": "web",
  // 代码
  "runCode": "code",
  "runPythonCode": "code",
  "runLocalPythonScript": "code",
  // 文件
  "readLocalFile": "file",
  "writeLocalFile": "file",
  "deleteLocalFile": "file",
  "listLocalDir": "file",
  // 分析
  "analyzeNotesStats": "analysis",
  "searchKeywordOccurrences": "analysis",
  "analyzeWordFrequency": "analysis",
  "executeCustomAnalysis": "analysis",
};

/**
 * 根据用户输入检测需要的工具类别
 */
export function detectToolCategories(userInput: string): Set<ToolCategory> {
  const categories = new Set<ToolCategory>();
  const input = userInput.toLowerCase();
  
  // 搜索类关键词
  if (/#\w|#\u4e00-\u9fff|查找|搜索|笔记|有哪些|找一下|找到|search|find|\[\[/.test(input)) {
    categories.add("search");
    categories.add("read");
  }
  
  // 日记类关键词
  if (/日记|今天|昨天|最近|这周|上周|本月|上个月|journal|总结一下|回顾/.test(input)) {
    categories.add("journal");
  }
  
  // 写入类关键词
  if (/创建|添加|写入|新建|记录|保存|打标签|create|add|write|save/.test(input)) {
    categories.add("write");
    categories.add("read");
  }
  
  // 联网类关键词
  if (/联网|搜索|查一下|百科|网上|实时|最新|新闻|天气|股票|汇率|图片|web|wiki|google|search online|http/.test(input)) {
    categories.add("web");
  }
  
  // 代码类关键词
  if (/计算|代码|运行|执行|python|javascript|code|run|execute|公式/.test(input)) {
    categories.add("code");
  }
  
  // 文件类关键词
  if (/本地文件|读取文件|写入文件|删除文件|文件列表|目录|local file|read file|write file/.test(input)) {
    categories.add("file");
  }
  
  // 分析类关键词
  if (/统计|分析|词频|有多少|出现次数|stats|analyze|frequency/.test(input)) {
    categories.add("analysis");
  }
  
  // 技能类关键词（查番剧、周报等）
  if (/番剧|动漫|周报|总结今天|回顾今天|anime|skill/.test(input)) {
    categories.add("skill");
    categories.add("web"); // 技能可能需要联网
  }
  
  return categories;
}

/**
 * 根据类别获取工具列表
 */
export function getToolsByCategories(categories: Set<ToolCategory>): OpenAITool[] {
  const tools: OpenAITool[] = [];
  
  // 始终包含核心工具
  categories.add("core");
  
  // 从 TOOLS 数组中筛选
  for (const tool of TOOLS) {
    const category = TOOL_CATEGORIES[tool.function.name];
    if (category && categories.has(category)) {
      tools.push(tool);
    }
  }
  
  // 联网工具（需要额外检查开关）
  if (categories.has("web")) {
    if (isWebSearchEnabled()) {
      if (isImageSearchEnabled()) {
        tools.push(IMAGE_SEARCH_TOOL);
      }
      tools.push(WEB_SEARCH_TOOL);
    }
    if (isWikipediaEnabled()) {
      tools.push(WIKIPEDIA_TOOL);
    }
    tools.push(FETCH_URL_TOOL);
    if (isCurrencyEnabled()) {
      tools.push(CURRENCY_TOOL);
    }
  }
  
  // 代码/文件/分析工具
  if (categories.has("code") || categories.has("file") || categories.has("analysis")) {
    if (isScriptAnalysisEnabled()) {
      tools.push(...getScriptAnalysisTools());
    }
  }
  
  // 技能工具
  if (categories.has("skill")) {
    tools.push(...getSkillTools());
  }
  
  return tools;
}

/**
 * 获取工具列表（根据联网搜索开关动态添加）
 * @deprecated 建议使用 getToolsByCategories 按需加载
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

type TagPropertyMergeMode = "replace" | "merge";

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
 * 合并标签属性（replace/merge）。
 * merge 模式对 block-refs 类型自动追加去重。
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

    // block-refs 类型 (type=2) 自动追加去重
    if (resolvedType === 2) {
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
    // searchNotes - 全文搜索
    if (toolName === "searchNotes") {
      try {
        const query = String(args.query || "").trim();
        if (!query) {
          return "Error: 请提供搜索关键词 (query)。";
        }
        
        const maxResults = Math.min(args.maxResults || 20, 50);
        const results = await searchBlocksByText(query, maxResults);
        
        if (results.length === 0) {
          return `未找到包含 "${query}" 的笔记。`;
        }
        
        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");
        
        return `${preservationNote}✅ 找到 ${results.length} 条笔记：\n${summary}`;
      } catch (err: any) {
        return `搜索出错: ${err.message}`;
      }
    }
    
    // getPage - 按名称获取页面内容
    else if (toolName === "getPage") {
      try {
        const pageName = String(args.pageName || "").trim();
        if (!pageName) {
          return "Error: 请提供页面名称 (pageName)。";
        }
        
        const result = await getPageByName(pageName, true);
        const linkTitle = result.title.replace(/[\[\]]/g, "");
        const body = result.fullContent ?? result.content;
        
        return `# ${linkTitle}\n\n${body}\n\n---\n📄 [查看原页面](orca-block:${result.id})`;
      } catch (err: any) {
        if (err.message?.includes("not found")) {
          return `未找到页面 "${args.pageName}"。`;
        }
        return `获取页面出错: ${err.message}`;
      }
    }
    
    // getBlocksText - 按ID获取块文本内容
    else if (toolName === "getBlocksText") {
      try {
        let blockIds = args.blockIds;
        if (!Array.isArray(blockIds) || blockIds.length === 0) {
          return "Error: 请提供块ID数组 (blockIds)。";
        }
        
        // 解析块ID（支持 orca-block:xxx 格式）
        const parsedIds = blockIds.map((id: any) => {
          if (typeof id === "string") {
            const match = id.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
            if (match) return parseInt(match[1], 10);
          }
          return typeof id === "number" ? id : null;
        }).filter((id: number | null) => id !== null);
        
        if (parsedIds.length === 0) {
          return "Error: 无效的块ID。";
        }
        
        const results: string[] = [];
        for (const blockId of parsedIds) {
          const block = orca.state.blocks[blockId] || await orca.invokeBackend("get-block", blockId);
          if (!block) {
            results.push(`块 ${blockId}: 未找到`);
            continue;
          }
          
          // 获取块树
          let fullContent = extractBlockText(block.content);
          try {
            const treeResult = await orca.invokeBackend("get-block-tree", blockId);
            if (treeResult) {
              const blocks = extractBlocksFromTree(treeResult, 0, 100);
              if (blocks.length > 1) {
                fullContent = blocks.map(b => "  ".repeat(b.depth) + b.content).join("\n");
              }
            }
          } catch {}
          
          const title = (block.aliases?.[0] || fullContent.split("\n")[0]?.substring(0, 50) || `块 #${blockId}`).replace(/[\[\]]/g, "");
          results.push(`## ${title}\nblockId: ${blockId}\n\n${fullContent}`);
        }
        
        return results.join("\n\n---\n\n");
      } catch (err: any) {
        return `获取块内容出错: ${err.message}`;
      }
    }
    
    // 新简化工具：queryByTagProperty - 按标签属性过滤
    else if (toolName === "queryByTagProperty") {
      try {
        const tagName = String(args.tagName || "").trim().replace(/^#/, "");
        if (!tagName) {
          return "Error: 请提供标签名 (tagName)。";
        }
        
        const maxResults = Math.min(args.maxResults || 20, 50);
        const property = args.property;
        const value = args.value;
        
        // 构建过滤条件
        const filters = property && value ? [{ name: property, op: "==" as const, value }] : [];
        
        const results = await queryBlocksByTag(tagName, { properties: filters, maxResults });
        
        if (results.length === 0) {
          const filterDesc = property ? ` (${property}=${value})` : "";
          return `未找到 #${tagName}${filterDesc} 的笔记。`;
        }
        
        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results.map((r: any, i: number) => {
          const base = formatBlockResult(r, i);
          const props = formatPropertyValues(r.propertyValues);
          return `${base}${props}`;
        }).join("\n\n");
        
        return `${preservationNote}✅ 找到 ${results.length} 条 #${tagName} 笔记：\n${summary}`;
      } catch (err: any) {
        return `查询出错: ${err.message}`;
      }
    }
    
    // query_blocks - 高级组合查询 (QueryDescription2 格式)
    else if (toolName === "query_blocks") {
      try {
        const q = args.q;
        if (!q || typeof q !== "object") {
          return "Error: 请提供查询描述对象 (q)。";
        }
        
        const pageSize = Math.min(args.pageSize || 20, 50);
        const sort = args.sort || [["_modified", "DESC"]];
        
        // 直接使用 QueryDescription2 格式调用后端
        const description = {
          q,
          sort,
          pageSize,
        };
        
        const result = await orca.invokeBackend("query", description);
        const payload = result?.data ?? result;
        
        // 解析结果
        let blocks: any[] = [];
        if (Array.isArray(payload)) {
          blocks = payload;
        } else if (payload?.blocks && Array.isArray(payload.blocks)) {
          blocks = payload.blocks;
        } else if (payload?.results && Array.isArray(payload.results)) {
          blocks = payload.results;
        }
        
        if (blocks.length === 0) {
          return `未找到匹配的笔记。`;
        }
        
        // 格式化结果
        const results: string[] = [];
        for (let i = 0; i < Math.min(blocks.length, pageSize); i++) {
          const block = blocks[i];
          const blockId = block.id || block.blockId;
          const content = extractBlockText(block.content) || "";
          const title = (block.aliases?.[0] || content.split("\n")[0]?.substring(0, 50) || `块 #${blockId}`).replace(/[\[\]]/g, "");
          results.push(`### ${i + 1}. ${title}\nblockId: ${blockId}\n${content.substring(0, 500)}${content.length > 500 ? "..." : ""}`);
        }
        
        return `✅ 找到 ${blocks.length} 条笔记：\n\n${results.join("\n\n")}`;
      } catch (err: any) {
        return `查询出错: ${err.message}`;
      }
    }
    
    // 兼容旧工具名：searchBlocksByTag
    else if (toolName === "searchBlocksByTag") {
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
    // 新统一工具：getJournals - 范围查询日记
    } else if (toolName === "getJournals") {
      try {
        const includeChildren = args.includeChildren !== false;
        const maxResults = args.maxResults || 31;
        
        // 优先级: days > month > week > startDate/endDate
        if (args.days !== undefined) {
          // 最近N天
          const days = Math.abs(Math.trunc(Number(args.days))) || 7;
          
          if (days <= 7) {
            // 小范围：直接返回内容
            const results = await getRecentJournals(days, includeChildren, days);
            if (results.length === 0) {
              return `最近 ${days} 天没有日记。`;
            }
            const preservationNote = addLinkPreservationNote(results.length);
            const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");
            return `${preservationNote}最近 ${days} 天的日记（${results.length} 篇）：\n${summary}`;
          } else {
            // 大范围：返回导出按钮
            const results = await getJournalsByDateRange("range", `last-${days}-days`, undefined, includeChildren, Math.min(maxResults, 366));
            if (results.length === 0) {
              return `最近 ${days} 天没有日记。`;
            }
            const exportData = results.map((r: any) => {
              const content = (r.fullContent || r.content || "").trim();
              return {
                date: r.title || "",
                content,
                blockId: r.id,
                created: r.created ? (r.created instanceof Date ? r.created.toISOString() : r.created) : undefined,
                modified: r.modified ? (r.modified instanceof Date ? r.modified.toISOString() : r.modified) : undefined,
                wordCount: content.length,
                tags: r.tags || [],
                hasImages: /!\[.*?\]\(.*?\)/.test(content) || content.includes("orca-file:"),
                hasLinks: /\[\[.*?\]\]/.test(content) || /\[.*?\]\(orca-block:/.test(content),
                childCount: r.childCount || 0,
                blocks: r.rawTree ? extractBlocksFromTree(r.rawTree) : undefined,
              };
            }).filter((entry: any) => entry.content.length > 0);
            if (exportData.length === 0) {
              return `最近 ${days} 天的日记都没有内容。`;
            }
            const cacheId = `range-last-${days}-days-${Date.now()}`;
            setJournalExportCache(cacheId, `最近${days}天`, exportData);
            return `\`\`\`journal-export\ncache:${cacheId}\n\`\`\``;
          }
        } else if (args.month) {
          // 某月
          const results = await getJournalsByDateRange("month", args.month, undefined, includeChildren, Math.min(maxResults, 31));
          if (results.length === 0) {
            return `${args.month} 没有日记。`;
          }
          const exportData = results.map((r: any) => {
            const content = (r.fullContent || r.content || "").trim();
            return {
              date: r.title || "",
              content,
              blockId: r.id,
              created: r.created ? (r.created instanceof Date ? r.created.toISOString() : r.created) : undefined,
              modified: r.modified ? (r.modified instanceof Date ? r.modified.toISOString() : r.modified) : undefined,
              wordCount: content.length,
              tags: r.tags || [],
              hasImages: /!\[.*?\]\(.*?\)/.test(content) || content.includes("orca-file:"),
              hasLinks: /\[\[.*?\]\]/.test(content) || /\[.*?\]\(orca-block:/.test(content),
              childCount: r.childCount || 0,
              blocks: r.rawTree ? extractBlocksFromTree(r.rawTree) : undefined,
            };
          }).filter((entry: any) => entry.content.length > 0);
          if (exportData.length === 0) {
            return `${args.month} 的日记都没有内容。`;
          }
          const monthMatch = args.month.match(/^(\d{4})-(\d{1,2})$/);
          const rangeLabel = monthMatch ? `${monthMatch[1]}年${parseInt(monthMatch[2])}月` : args.month;
          const cacheId = `month-${args.month}-${Date.now()}`;
          setJournalExportCache(cacheId, rangeLabel, exportData);
          return `\`\`\`journal-export\ncache:${cacheId}\n\`\`\``;
        } else if (args.week) {
          // 本周/上周
          const weekValue = args.week === "last" ? "last-week" : "this-week";
          const results = await getJournalsByDateRange("week", weekValue, undefined, includeChildren, 7);
          if (results.length === 0) {
            return `${args.week === "last" ? "上周" : "本周"}没有日记。`;
          }
          const preservationNote = addLinkPreservationNote(results.length);
          const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");
          return `${preservationNote}${args.week === "last" ? "上周" : "本周"}的日记（${results.length} 篇）：\n${summary}`;
        } else if (args.startDate && args.endDate) {
          // 自定义范围
          const results = await getJournalsByDateRange("range", args.startDate, args.endDate, includeChildren, Math.min(maxResults, 366));
          if (results.length === 0) {
            return `${args.startDate} 至 ${args.endDate} 没有日记。`;
          }
          const preservationNote = addLinkPreservationNote(results.length);
          const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");
          return `${preservationNote}${args.startDate} 至 ${args.endDate} 的日记（${results.length} 篇）：\n${summary}`;
        } else {
          return "Error: 请提供查询参数（days/month/week/startDate+endDate）。";
        }
      } catch (err: any) {
        return `查询日记出错: ${err.message}`;
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

        // 兼容旧的 append 参数，统一转为 merge
        let mode: TagPropertyMergeMode = "merge";
        if (modeRaw) {
          const modeStr = String(modeRaw).toLowerCase();
          if (modeStr === "replace") mode = "replace";
          // append 已并入 merge，不再报错
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
        const errorMessage = err.message || "未知错误";
        const url = args.url || "";
        
        // 检测是否是 403 错误
        if (errorMessage.includes("403")) {
          // 针对知乎的特殊建议
          if (url.includes("zhihu.com")) {
            return `❌ 知乎反爬虫保护\n\n**问题：** 知乎检测到非浏览器访问，拒绝了请求 (403)\n\n**建议解决方案：**\n1. **总结一下这个问题/回答的关键信息**\n   - 我可以帮你分析问题、提供观点\n   \n2. **复制知乎内容粘贴给我**\n   - 手动打开链接，复制文字内容\n   - 我可以基于你的内容进行分析\n\n3. **使用浏览器插件**\n   - 安装类似 "Simple Allow Copy" 的插件\n   - 更方便地复制知乎内容\n\n💡 **技术原因：** 知乎有较强的反爬虫机制，会检测请求头、访问频率等，即使模拟浏览器也很难绕过。`;
          }
          
          // 其他网站的 403 错误
          return `❌ 网站拒绝访问 (403)\n\n**问题：** 该网站检测到非浏览器访问，拒绝了请求\n\n**建议解决方案：**\n1. **复制网页内容粘贴给我**\n   - 手动打开链接，复制文字内容\n   - 我可以基于你的内容进行分析\n   \n2. **直接描述问题**\n   - 告诉我你想了解什么\n   - 我会尽力帮你回答\n\n💡 **原因：** 该网站有反爬虫保护，会检测并阻止自动化访问。`;
        }
        
        // 超时错误
        if (errorMessage.includes("超时") || errorMessage.includes("timeout")) {
          return `❌ 网页请求超时\n\n**问题：** 网页加载时间过长，超过 15 秒限制\n\n**建议解决方案：**\n1. **检查网络连接**\n2. **尝试其他链接或网站**\n3. **复制网页内容粘贴给我**`;
        }
        
        // 默认错误消息
        return `❌ 网页抓取失败: ${errorMessage}\n\n💡 可能的原因：\n- 网站拒绝访问或有反爬虫保护\n- URL 不正确或网页不存在\n- 网络连接问题\n- 网站需要登录才能访问\n\n**建议：** 可以将网页内容复制粘贴给我，我来帮你分析。`;
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
          // 从工具名称反查 Skill ID
          const { listSkills, getSkill } = await import("./skills-manager");
          const skillRefs = await listSkills();
          
          let matchedSkillRef: { id: string; isGlobal: boolean } | null = null;
          for (const ref of skillRefs) {
            if (getSkillToolName(ref.id) === toolName) {
              matchedSkillRef = ref;
              break;
            }
          }
          
          if (!matchedSkillRef) {
            return `Skill not found for tool: ${toolName}`;
          }
          
          // 获取 Skill 详情
          const skill = await getSkill(matchedSkillRef.id, matchedSkillRef.isGlobal);
          if (!skill) {
            return `Skill not found: ${matchedSkillRef.id}`;
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
