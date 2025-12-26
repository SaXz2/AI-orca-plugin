/**
 * Skill Service - Skill 加载和解析服务
 * 从用户笔记中加载带 #skill 标签的块并解析为 Skill 定义
 */

import type { Skill, SkillType } from "../store/skill-store";
import {
  skillStore,
  setSkills,
  setSkillsLoading,
} from "../store/skill-store";
import { searchBlocksByTag } from "./search-service";
import { safeText } from "../utils/text-utils";
import { treeChildren, unwrapBackendResult, throwIfBackendError } from "../utils/block-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 关键字映射（中英文大小写不敏感）
 */
const KEYWORD_PATTERNS = {
  type: /^(类型|type)$/i,
  description: /^(描述|description|desc)$/i,
  prompt: /^(提示词|prompt|指令|instruction)$/i,
  tools: /^(工具|tools|tool)$/i,
  variables: /^(变量|variables|variable|vars|var)$/i,
};

/**
 * 分隔符正则（中英文冒号）
 */
const SEPARATOR_PATTERN = /[:：]/;

/**
 * 逗号分隔符正则（中英文逗号）
 */
const COMMA_PATTERN = /[,，]/;

/**
 * 工具名称别名映射（支持多种命名风格）
 */
const TOOL_ALIASES: Record<string, string> = {
  // camelCase -> actual name
  searchBlocksByTag: "searchBlocksByTag",
  searchBlocksByText: "searchBlocksByText",
  queryBlocksByTag: "queryBlocksByTag",
  searchTasks: "searchTasks",
  searchJournalEntries: "searchJournalEntries",
  getTodayJournal: "getTodayJournal",
  getRecentJournals: "getRecentJournals",
  queryBlocks: "query_blocks",
  query_blocks: "query_blocks",
  getTagSchema: "get_tag_schema",
  get_tag_schema: "get_tag_schema",
  searchBlocksByReference: "searchBlocksByReference",
  getPage: "getPage",
  createBlock: "createBlock",
  createPage: "createPage",
  insertTag: "insertTag",
  // snake_case aliases
  search_blocks_by_tag: "searchBlocksByTag",
  search_blocks_by_text: "searchBlocksByText",
  query_blocks_by_tag: "queryBlocksByTag",
  search_tasks: "searchTasks",
  search_journal_entries: "searchJournalEntries",
  get_today_journal: "getTodayJournal",
  get_recent_journals: "getRecentJournals",
  search_blocks_by_reference: "searchBlocksByReference",
  get_page: "getPage",
  create_block: "createBlock",
  create_page: "createPage",
  insert_tag: "insertTag",
};

// ─────────────────────────────────────────────────────────────────────────────
// Parsing Functions
// ─────────────────────────────────────────────────────────────────────────────

function getChildrenFromTree(tree: any): any[] {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree;
  if (Array.isArray(tree?.children)) return tree.children;
  return treeChildren(tree);
}

/**
 * 从块文本中提取键值对
 * 支持格式: "关键字: 值" 或 "关键字：值"
 */
function extractKeyValue(text: string): { key: string; value: string } | null {
  const parts = text.split(SEPARATOR_PATTERN);
  if (parts.length < 2) return null;

  const key = parts[0].trim();
  const value = parts.slice(1).join(":").trim(); // 保留值中可能存在的冒号
  return { key, value };
}

/**
 * 匹配关键字类型
 */
function matchKeyword(key: string): keyof typeof KEYWORD_PATTERNS | null {
  for (const [name, pattern] of Object.entries(KEYWORD_PATTERNS)) {
    if (pattern.test(key)) {
      return name as keyof typeof KEYWORD_PATTERNS;
    }
  }
  return null;
}

/**
 * 规范化工具名称
 */
export function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  return TOOL_ALIASES[trimmed] ?? trimmed;
}

/**
 * 从块树中解析单个 Skill
 * @param rootBlock - Skill 根块（带 #skill 标签的块）
 * @param tree - 块树（包含子块）
 * @returns 解析后的 Skill，如果解析失败返回 null
 */
export function parseSkillFromTree(rootBlock: any, tree: any): Skill | null {
  try {
    // 调试：打印块结构
    console.log("[skill-service] Parsing block:", {
      id: rootBlock?.id,
      text: rootBlock?.text,
      content: rootBlock?.content,
      tags: rootBlock?.tags,
    });

    // 1. 从根块提取 Skill 名称（块内容，不包含 #skill 标签文本）
    let rawName = safeText(rootBlock) || (typeof rootBlock?.title === "string" ? rootBlock.title : "");

    // 移除可能残留的 #skill 标签文本
    rawName = rawName.replace(/#skill\b/gi, "").trim();
    rawName = rawName.replace(/\[\[skill\]\]/gi, "").trim();
    // 移除可能的列表标记 (- 或 *)
    rawName = rawName.replace(/^[-*]\s*/, "").trim();

    console.log("[skill-service] Skill name:", rawName);

    if (!rawName) {
      console.warn("[skill-service] Empty skill name, skipping");
      return null;
    }

    // 2. 从 #skill 标签的 properties 读取类型
    let skillType: SkillType | null = null;
    let toolsList: string[] = [];

    const tags = rootBlock?.tags || rootBlock?.aliases || [];
    console.log("[skill-service] Block tags:", tags);

    // 优先从 SearchResult.propertyValues 读取（search-service 会把 tag properties 展平到这里）
    const propertyValues = rootBlock?.propertyValues;
    if (propertyValues && typeof propertyValues === "object") {
      const rawType = (propertyValues.type ?? propertyValues.Type ?? propertyValues.类型) as any;
      const rawTools = (propertyValues.tools ?? propertyValues.Tools ?? propertyValues.工具) as any;

      const typeValues = Array.isArray(rawType)
        ? rawType.map((v: any) => String(v).toLowerCase())
        : typeof rawType === "string"
          ? [rawType.toLowerCase()]
          : [];

      if (typeValues.includes("prompt") || typeValues.includes("提示词")) {
        skillType = "prompt";
      } else if (
        typeValues.includes("tool") ||
        typeValues.includes("tools") ||
        typeValues.includes("工具")
      ) {
        skillType = "tools";
      }

      if (Array.isArray(rawTools)) {
        toolsList = rawTools.map((t: any) => normalizeToolName(String(t))).filter((t: string) => t.length > 0);
      } else if (typeof rawTools === "string") {
        toolsList = rawTools
          .split(COMMA_PATTERN)
          .map((t) => normalizeToolName(t))
          .filter((t) => t.length > 0);
      }
    }

    for (const tag of tags) {
      // 检查是否是 skill 标签（支持多种命名）
      const tagName = typeof tag === "string" ? tag : (tag?.name || tag?.tag || "");
      if (!/^skill$/i.test(tagName)) continue;

      // 读取标签的 properties
      const properties = tag?.properties || [];
      console.log("[skill-service] Skill tag properties:", properties);

      for (const prop of properties) {
        const propName = (prop?.name || "").toLowerCase();
        const propValue = prop?.value;

        // 处理 TextChoices 类型（字符串数组）或普通字符串
        let values: string[] = [];
        if (Array.isArray(propValue)) {
          values = propValue.map((v: any) => String(v).toLowerCase());
        } else if (typeof propValue === "string") {
          values = [propValue.toLowerCase()];
        }

        console.log("[skill-service] Property:", propName, "=", values);

        // 检查类型属性（支持多种命名）
        if (/^(type|类型|kind)$/i.test(propName)) {
          if (values.includes("prompt") || values.includes("提示词")) {
            skillType = "prompt";
          } else if (values.includes("tool") || values.includes("tools") || values.includes("工具")) {
            skillType = "tools";
          }
        }

        // 检查工具列表属性
        if (/^(tools|tool|工具)$/i.test(propName) && Array.isArray(propValue)) {
          toolsList = propValue.map((t: any) => normalizeToolName(String(t)));
        }
      }
    }

    // 如果标签没有 properties，尝试从子块解析（向后兼容）
    const children = getChildrenFromTree(tree);

    // 3. 解析子块（向后兼容：用子块的“类型/描述/提示词/工具/变量”结构）
    const promptLines: string[] = [];
    let description = "";
    let variables: string[] = [];

    for (const child of children) {
      const childText = safeText(child) || "";
      if (!childText) continue;

      const kv = extractKeyValue(childText);
      const keyword = kv ? matchKeyword(kv.key) : null;

      if (keyword === "description") {
        description = kv!.value;
        continue;
      }

      if (keyword === "type" && !skillType) {
        const val = kv!.value.toLowerCase();
        if (val === "prompt" || val === "提示词") {
          skillType = "prompt";
        } else if (val === "tool" || val === "tools" || val === "工具") {
          skillType = "tools";
        }
        continue;
      }

      if (keyword === "tools" && toolsList.length === 0) {
        toolsList = kv!.value
          .split(COMMA_PATTERN)
          .map((t) => normalizeToolName(t))
          .filter((t) => t.length > 0);
        continue;
      }

      if (keyword === "variables" && variables.length === 0) {
        variables = kv!.value
          .split(COMMA_PATTERN)
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
        continue;
      }

      if (keyword === "prompt") {
        promptLines.push(kv!.value);
        continue;
      }

      // 其他内容作为 prompt（“实际格式”：子块内容直接作为 prompt 行）
      promptLines.push(childText);
    }

    // 默认为 prompt 类型
    if (!skillType) {
      console.log("[skill-service] No type found, defaulting to 'prompt'");
      skillType = "prompt";
    }

    const prompt = promptLines.join("\n").trim();

    console.log("[skill-service] Parsed skill:", {
      name: rawName,
      type: skillType,
      description,
      promptLength: prompt.length,
      tools: toolsList,
    });

    // 构建 Skill 对象
    const skill: Skill = {
      id: rootBlock.id,
      name: rawName,
      description,
      type: skillType,
      prompt,
    };

    if (skillType === "tools" && toolsList.length > 0) {
      skill.tools = toolsList;
    }

    if (variables.length > 0) {
      skill.variables = variables;
    }

    console.log(`[skill-service] Successfully parsed skill: "${skill.name}" (${skill.type})`);
    return skill;
  } catch (error) {
    console.warn("[skill-service] Failed to parse skill:", error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 加载所有 Skills
 * 从笔记中搜索带 #skill 标签的块并解析
 */
export async function loadAllSkills(): Promise<Skill[]> {
  // 防止重复加载
  if (skillStore.skillsLoading) {
    console.log("[skill-service] Already loading skills, skipping");
    return skillStore.skills;
  }

  setSkillsLoading(true);

  try {
    console.log("[skill-service] Loading skills...");

    // 搜索带 #skill 标签的块
    const blocks = await searchBlocksByTag("skill", 100);

    if (!Array.isArray(blocks) || blocks.length === 0) {
      console.log("[skill-service] No skill blocks found");
      setSkills([]);
      return [];
    }

    console.log(`[skill-service] Found ${blocks.length} skill block(s)`);

    // 解析每个 Skill
    const skills: Skill[] = [];

    for (const block of blocks) {
      try {
        // 获取块树以读取子块和完整的 tags 信息
        const treeResult = await orca.invokeBackend("get-block-tree", block.id);
        const tree = unwrapBackendResult<any>(treeResult);
        throwIfBackendError(tree, "get-block-tree");

        // 详细调试日志
        console.log("[skill-service] Full tree structure for", block.id, ":", JSON.stringify(tree, null, 2));

        const skill = parseSkillFromTree(block, tree);

        if (skill) {
          skills.push(skill);
        }
      } catch (err) {
        console.warn(`[skill-service] Failed to load skill block ${block.id}:`, err);
      }
    }

    // 按名称拼音排序
    skills.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    setSkills(skills);
    console.log(`[skill-service] Loaded ${skills.length} valid skill(s)`);
    return skills;
  } catch (error) {
    console.error("[skill-service] Failed to load skills:", error);
    setSkillsLoading(false);
    return [];
  }
}

/**
 * 刷新 Skills 列表
 */
export async function refreshSkills(): Promise<Skill[]> {
  skillStore.skillsLoaded = false;
  return loadAllSkills();
}

/**
 * 确保 Skills 已加载（懒加载）
 */
export async function ensureSkillsLoaded(): Promise<Skill[]> {
  if (skillStore.skillsLoaded) {
    return skillStore.skills;
  }
  return loadAllSkills();
}
