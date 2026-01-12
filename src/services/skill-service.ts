import type { OpenAITool } from "./openai-client";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { skillStore, setSkillError, setSkillLoading, setSkills } from "../store/skill-store";
import type { SkillMetadata, SkillDefinition as NewSkillDefinition, SkillValidationResult } from "../types/skill";
import { validateSkillMetadata, SKILL_NAME_MAX_LENGTH, SKILL_DESCRIPTION_MAX_LENGTH } from "../types/skill";
import {
  buildSkillPath,
  clearDisabledSkillFolders,
  disableSkillFolder,
  exists,
  getDisabledSkillFolders,
  getSkillsRootPath,
  listDir,
  mkdirs,
  readBinaryFile,
  readTextFile,
  removeSkillFile,
  writeTextFile,
} from "./skill-fs";
import { runPythonStep, type PythonFilePayload } from "./python-runtime";
import {
  saveSkill as saveSkillToDb,
  getSkill as getSkillFromDb,
  getAllSkills as getAllSkillsFromDb,
  deleteSkill as deleteSkillFromDb,
  skillExists,
} from "./skill-storage";

export type SkillInput = {
  name: string;
  type?: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
  default?: any;
  enum?: string[];
};

export type SkillToolStep = {
  type: "tool";
  tool: string;
  args?: Record<string, any>;
};

export type SkillPythonStep = {
  type: "python";
  code?: string;
  file?: string;
  packages?: string[];
  input?: any;
  files?: string[];
};

export type SkillStep = SkillToolStep | SkillPythonStep;

/**
 * Legacy skill definition type - used for file-system based skills
 * @deprecated Use SkillDefinition from types/skill.ts for new code
 */
export type LegacySkillDefinition = {
  id: string;
  name: string;
  description?: string;
  inputs: SkillInput[];
  steps: SkillStep[];
  source: "built-in" | "user";
  folderName: string;
};

// Re-export the new SkillDefinition type for convenience
export type { SkillDefinition } from "../types/skill";

export type SkillDraftSaveResult = {
  folderName: string;
  definition: LegacySkillDefinition;
  content: string;
};

export type SkillExecutionOverrides = {
  toolExecutor?: (toolName: string, args: any) => Promise<string>;
  pythonExecutor?: (options: {
    code: string;
    packages?: string[];
    input?: any;
    files?: PythonFilePayload[];
  }) => Promise<{ output: string; runtime: "backend" | "pyodide" }>;
  instructionProvider?: (skill: LegacySkillDefinition) => Promise<string>;
};

const SKILL_TOOL_PREFIX = "skill_";

const DEFAULT_SKILL_TEMPLATES = [
  {
    folderName: "今日回顾",
    content: `---
id: daily-review
name: 今日回顾
description: 汇总近期日记，整理重点、完成事项和待办。
inputs:
  - name: days
    type: number
    description: 回顾的天数（默认3）
    default: 3
steps:
  - type: tool
    tool: getRecentJournals
    args:
      days: "{{days}}"
      includeChildren: true
---
请基于获取的日记内容，输出今日回顾：
- 重点事件（3-5条）
- 完成事项
- 未完成/待办
- 明日关注
`,
  },
  {
    folderName: "知识卡片",
    content: `---
id: knowledge-cards
name: 知识卡片
description: 从近期日记中提炼知识点并生成卡片。
inputs:
  - name: days
    type: number
    description: 回顾的天数（默认3）
    default: 3
steps:
  - type: tool
    tool: getRecentJournals
    args:
      days: "{{days}}"
      includeChildren: true
---
请从日记中提取关键知识点，并生成 5-8 张卡片。调用 generateFlashcards 工具返回卡片。
`,
  },
  {
    folderName: "周报聚合",
    content: `---
id: weekly-digest
name: 周报聚合
description: 汇总最近几天的日记与未完成任务，生成周报草稿。
inputs:
  - name: days
    type: number
    description: 回顾的天数（默认7）
    default: 7
steps:
  - type: tool
    tool: getRecentJournals
    args:
      days: "{{days}}"
      includeChildren: true
  - type: tool
    tool: query_blocks
    args:
      conditions:
        - type: task
          completed: false
      maxResults: 50
---
请根据最近日记与未完成任务整理周报：本周亮点、重要进展、未完成事项与下周关注。
`,
  },
  {
    folderName: "标签筛选复盘",
    content: `---
id: tag-review
name: 标签筛选复盘
description: 先汇总指定标签，再根据属性筛选结果做复盘。
inputs:
  - name: tagName
    type: string
    description: 标签名（不带#）
    required: true
  - name: status
    type: string
    description: 需要过滤的状态值（如 Done）
    required: true
steps:
  - type: tool
    tool: searchBlocksByTag
    args:
      tag_query: "#{{tagName}}"
      maxResults: 50
  - type: tool
    tool: query_blocks_by_tag
    args:
      tagName: "{{tagName}}"
      filters:
        - name: "Status"
          op: "=="
          value: "{{status}}"
      maxResults: 50
---
请对标签整体与筛选结果做对比，总结数量、代表性条目与改进建议。
`,
  },
  {
    folderName: "页面检索概览",
    content: `---
id: page-scan
name: 页面检索概览
description: 读取页面内容并检索关键词，生成结构概览。
inputs:
  - name: pageName
    type: string
    description: 页面名称
    required: true
  - name: keyword
    type: string
    description: 需要检索的关键词
    required: true
steps:
  - type: tool
    tool: getPage
    args:
      pageName: "{{pageName}}"
      includeChildren: true
  - type: tool
    tool: searchBlocksByText
    args:
      query: "{{keyword}}"
      maxResults: 50
---
请概述页面结构，并结合关键词检索结果输出相关要点。
`,
  },
];

/**
 * Built-in skill templates in the new SKILL.md format (Codex-style)
 * These are initialized when no skills exist in IndexedDB
 * 
 * Description format follows Codex template:
 * [功能描述]. Use when [触发场景] or when the user mentions [关键词].
 */
const BUILTIN_SKILL_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  instruction: string;
}> = [
  {
    id: "daily-review",
    name: "今日回顾",
    description: "汇总近期日记内容，整理重点事件、完成事项和待办任务。Use when reviewing daily progress, summarizing journal entries, or when the user mentions 日记, 回顾, 总结, 今日, daily review.",
    instruction: `# 今日回顾

## 快速开始

调用 getRecentJournals 工具获取最近日记，然后生成结构化回顾。

## 功能特性

- **重点事件**：提取 3-5 条关键事件
- **完成事项**：列出已完成的任务
- **未完成/待办**：整理未完成的事项
- **明日关注**：建议明天需要关注的内容

## 使用场景

1. 每日工作结束时回顾当天进展
2. 整理近期日记内容
3. 生成日报或工作总结

## 触发工具

- \`getRecentJournals\`: 获取最近日记内容（默认 3 天）`,
  },
  {
    id: "knowledge-cards",
    name: "知识卡片",
    description: "从近期日记中提炼知识点并生成闪卡用于复习。Use when creating flashcards, extracting knowledge points, or when the user mentions 卡片, 知识点, 复习, 闪卡, flashcard.",
    instruction: `# 知识卡片

## 快速开始

从日记中提取关键知识点，生成 5-8 张闪卡。

## 功能特性

- **知识提取**：自动识别日记中的关键概念
- **卡片生成**：创建问答式闪卡
- **复习优化**：适合间隔重复学习

## 使用场景

1. 学习笔记整理后生成复习卡片
2. 从阅读记录中提取要点
3. 准备考试或知识回顾

## 触发工具

1. \`getRecentJournals\`: 获取日记内容
2. \`generateFlashcards\`: 生成闪卡`,
  },
  {
    id: "weekly-digest",
    name: "周报聚合",
    description: "汇总最近一周的日记与未完成任务，生成周报草稿。Use when creating weekly reports, summarizing weekly progress, or when the user mentions 周报, 本周, 汇总, 一周, weekly report.",
    instruction: `# 周报聚合

## 快速开始

获取最近 7 天日记和未完成任务，生成结构化周报。

## 功能特性

- **本周亮点**：提取重要成就和进展
- **重要进展**：详细列出关键工作内容
- **未完成事项**：整理待处理任务
- **下周关注**：规划下周重点

## 使用场景

1. 每周工作总结
2. 团队周报准备
3. 项目进度汇报

## 触发工具

1. \`getRecentJournals\`: 获取最近 7 天日记
2. \`query_blocks\`: 查询未完成任务`,
  },
  {
    id: "tag-review",
    name: "标签筛选复盘",
    description: "汇总指定标签的内容，根据属性筛选并进行复盘分析。Use when reviewing tagged content, filtering by status, or when the user mentions 标签, 复盘, 筛选, tag, filter.",
    instruction: `# 标签筛选复盘

## 快速开始

指定标签名和状态值，获取相关内容并进行对比分析。

## 功能特性

- **标签汇总**：收集指定标签下的所有内容
- **属性筛选**：按状态或其他属性过滤
- **对比分析**：整体与筛选结果对比
- **改进建议**：基于分析提供优化建议

## 使用场景

1. 项目标签复盘（如 #project/xxx）
2. 按状态筛选任务（如 Done, In Progress）
3. 主题内容整理和分析

## 输入参数

- \`tagName\`: 标签名（不带 #）
- \`status\`: 需要过滤的状态值

## 触发工具

1. \`searchBlocksByTag\`: 搜索标签内容
2. \`query_blocks_by_tag\`: 按属性筛选`,
  },
  {
    id: "page-scan",
    name: "页面检索概览",
    description: "读取指定页面内容并检索关键词，生成结构化概览。Use when scanning page content, searching keywords, or when the user mentions 页面, 检索, 概览, 关键词, page, search.",
    instruction: `# 页面检索概览

## 快速开始

指定页面名称和关键词，获取页面结构和相关内容。

## 功能特性

- **页面读取**：获取完整页面内容
- **关键词检索**：在内容中搜索匹配项
- **结构概述**：分析页面组织结构
- **要点提取**：整理与关键词相关的要点

## 使用场景

1. 快速了解某个页面的内容结构
2. 在长文档中定位特定信息
3. 生成页面内容摘要

## 输入参数

- \`pageName\`: 页面名称
- \`keyword\`: 需要检索的关键词

## 触发工具

1. \`getPage\`: 获取页面内容
2. \`searchBlocksByText\`: 关键词检索`,
  },
];

type ParsedSkillFile = {
  metadata: Record<string, any>;
  instruction: string;
};

function sanitizeSkillFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function parseSkillFile(content: string): ParsedSkillFile {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { metadata: {}, instruction: normalized.trim() };
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return { metadata: {}, instruction: normalized.trim() };
  }

  const yamlBlock = lines.slice(1, endIndex).join("\n");
  const metadata = (parseYaml(yamlBlock) as Record<string, any>) || {};
  const instruction = lines.slice(endIndex + 1).join("\n").trim();

  return { metadata, instruction };
}

/**
 * Parse result for SKILL.md format
 */
export type ParseSkillMdResult = {
  metadata: SkillMetadata;
  instruction: string;
};

/**
 * Parse SKILL.md content to extract metadata and instruction.
 * 
 * SKILL.md format:
 * ```
 * ---
 * name: Skill Name
 * description: Skill description text.
 * ---
 * 
 * # Instruction content here
 * ```
 * 
 * @param content - The raw SKILL.md file content
 * @returns Parsed metadata and instruction
 * @throws Error if frontmatter is missing or invalid
 * 
 * Requirements: 1.3
 */
export function parseSkillMd(content: string): ParseSkillMdResult {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  
  // Check for frontmatter start
  if (lines[0]?.trim() !== "---") {
    throw new Error("Invalid SKILL.md format: missing frontmatter start delimiter");
  }

  // Find frontmatter end
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error("Invalid SKILL.md format: missing frontmatter end delimiter");
  }

  // Parse YAML frontmatter
  const yamlBlock = lines.slice(1, endIndex).join("\n");
  let parsed: Record<string, any>;
  try {
    parsed = (parseYaml(yamlBlock) as Record<string, any>) || {};
  } catch (e) {
    throw new Error(`Invalid SKILL.md format: YAML parse error - ${(e as Error).message}`);
  }

  // Extract and validate name
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (!name) {
    throw new Error("Invalid SKILL.md format: name is required in frontmatter");
  }

  // Extract description (default to empty string)
  const description = typeof parsed.description === "string" ? parsed.description : "";

  // Extract instruction (markdown body after frontmatter)
  const instruction = lines.slice(endIndex + 1).join("\n").trim();

  return {
    metadata: { name, description },
    instruction,
  };
}

/**
 * Serialize skill metadata and instruction to SKILL.md format.
 * 
 * Output format:
 * ```
 * ---
 * name: Skill Name
 * description: Skill description text.
 * ---
 * 
 * # Instruction content here
 * ```
 * 
 * @param metadata - The skill metadata (name and description)
 * @param instruction - The instruction markdown content
 * @returns Serialized SKILL.md content string
 * 
 * Requirements: 1.4
 */
export function serializeSkillMd(metadata: SkillMetadata, instruction: string): string {
  // Build frontmatter object with only name and description
  const frontmatter: Record<string, string> = {
    name: metadata.name,
    description: metadata.description,
  };

  // Serialize to YAML (without document markers)
  const yamlContent = stringifyYaml(frontmatter, { lineWidth: 0 }).trim();

  // Combine frontmatter and instruction
  const parts = [
    "---",
    yamlContent,
    "---",
  ];

  // Add instruction with a blank line separator if present
  if (instruction) {
    parts.push("");
    parts.push(instruction);
  }

  return parts.join("\n");
}

export function extractSkillMarkdown(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("---")) return trimmed;

  const fenceRegex = /```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/g;
  const matches = Array.from(trimmed.matchAll(fenceRegex));
  for (const match of matches) {
    const candidate = (match[1] || "").trim();
    if (candidate.startsWith("---")) {
      return candidate;
    }
  }

  return trimmed;
}

function normalizeSkillId(rawId: string, fallback: string): string {
  const base = rawId || fallback;
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug) return slug;

  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  const encoded = Math.abs(hash).toString(36);
  return `skill-${encoded}`;
}

function normalizeInputs(rawInputs: any): SkillInput[] {
  if (!Array.isArray(rawInputs)) return [];

  return rawInputs
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name ?? "").trim();
      if (!name) return null;
      const input: SkillInput = {
        name,
        type: item.type,
        description: item.description,
        required: Boolean(item.required),
        default: item.default,
        enum: Array.isArray(item.enum) ? item.enum.map(String) : undefined,
      };
      return input;
    })
    .filter(Boolean) as SkillInput[];
}

function normalizeSteps(rawSteps: any): SkillStep[] {
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps
    .map((step) => {
      if (!step || typeof step !== "object") return null;
      const type = String(step.type ?? "").toLowerCase();

      if (type === "tool" && step.tool) {
        return {
          type: "tool",
          tool: String(step.tool),
          args: typeof step.args === "object" && step.args ? step.args : undefined,
        } as SkillToolStep;
      }

      if (type === "python") {
        return {
          type: "python",
          code: typeof step.code === "string" ? step.code : undefined,
          file: typeof step.file === "string" ? step.file : undefined,
          packages: Array.isArray(step.packages) ? step.packages.map(String) : undefined,
          input: step.input,
          files: Array.isArray(step.files) ? step.files.map(String) : undefined,
        } as SkillPythonStep;
      }

      return null;
    })
    .filter(Boolean) as SkillStep[];
}

function buildSkillDefinition(
  metadata: Record<string, any>,
  folderName: string,
  source: "built-in" | "user",
): LegacySkillDefinition | null {
  const name = String(metadata.name ?? "").trim();
  if (!name) return null;

  const steps = normalizeSteps(metadata.steps);
  console.log(`[Skill] Building skill "${name}" with ${steps.length} steps from metadata:`, metadata.steps);
  if (steps.length === 0) return null;

  const inputs = normalizeInputs(metadata.inputs);
  const id = normalizeSkillId(String(metadata.id ?? ""), folderName);

  return {
    id,
    name,
    description: metadata.description ? String(metadata.description) : undefined,
    inputs,
    steps,
    source,
    folderName,
  };
}

export function parseSkillDefinitionFromContent(
  content: string,
  folderName: string,
  source: "built-in" | "user",
): LegacySkillDefinition | null {
  const { metadata } = parseSkillFile(content);
  return buildSkillDefinition(metadata, folderName, source);
}

function applyInputDefaults(inputs: SkillInput[], provided: Record<string, any>): Record<string, any> {
  const merged: Record<string, any> = { ...provided };
  for (const input of inputs) {
    if (merged[input.name] === undefined && input.default !== undefined) {
      merged[input.name] = input.default;
    }
  }
  return merged;
}

function resolveTemplateValue(value: any, inputs: Record<string, any>): any {
  if (typeof value === "string") {
    const exact = value.match(/^{{\s*([\w-]+)\s*}}$/);
    if (exact) {
      return inputs[exact[1]];
    }

    return value.replace(/{{\s*([\w-]+)\s*}}/g, (_match, key) => {
      const replacement = inputs[key];
      return replacement === undefined || replacement === null ? "" : String(replacement);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, inputs));
  }

  if (value && typeof value === "object") {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      const resolved = resolveTemplateValue(val, inputs);
      if (resolved !== undefined) {
        result[key] = resolved;
      }
    }
    return result;
  }

  return value;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getPythonCodePath(step: SkillPythonStep): string | null {
  if (!step.file) return null;
  const normalized = step.file.replace(/\\/g, "/");
  if (normalized.startsWith("Script/") || normalized.startsWith("Data/")) {
    return normalized;
  }
  return `Script/${normalized}`;
}

function getResourcePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("Script/") || normalized.startsWith("Data/")) {
    return normalized;
  }
  return `Data/${normalized}`;
}

async function readSkillFile(folderName: string): Promise<string | null> {
  const primary = buildSkillPath(folderName, "skills.md");
  let content = await readTextFile(primary);
  if (content !== null) return content;

  const fallback = buildSkillPath(folderName, "Skills.md");
  if (fallback !== primary) {
    content = await readTextFile(fallback);
  }

  return content;
}

async function skillFileExists(folderName: string): Promise<boolean> {
  return (await readSkillFile(folderName)) !== null;
}

export async function getSkillContent(skill: LegacySkillDefinition): Promise<string> {
  const content = await readSkillFile(skill.folderName);
  if (content === null) {
    throw new Error("技能内容不存在");
  }
  return content;
}

async function ensureDefaultSkills(): Promise<void> {
  const root = getSkillsRootPath();
  await mkdirs(root);
  const disabled = new Set(await getDisabledSkillFolders());

  for (const skill of DEFAULT_SKILL_TEMPLATES) {
    if (disabled.has(skill.folderName)) continue;
    const folderPath = buildSkillPath(skill.folderName);
    const filePath = buildSkillPath(skill.folderName, "skills.md");
    const existsSkill = await exists(filePath);
    if (!existsSkill) {
      await mkdirs(folderPath);
      await writeTextFile(filePath, skill.content);
    }
  }
}

async function restoreDefaultSkills(): Promise<void> {
  const root = getSkillsRootPath();
  await mkdirs(root);

  for (const skill of DEFAULT_SKILL_TEMPLATES) {
    const folderPath = buildSkillPath(skill.folderName);
    const filePath = buildSkillPath(skill.folderName, "skills.md");
    await mkdirs(folderPath);
    await writeTextFile(filePath, skill.content);
  }
}

function isDefaultSkill(folderName: string): boolean {
  return DEFAULT_SKILL_TEMPLATES.some((skill) => skill.folderName === folderName);
}

export function isSkillToolName(toolName: string): boolean {
  return toolName.startsWith(SKILL_TOOL_PREFIX);
}

export function getSkillToolName(skill: NewSkillDefinition | LegacySkillDefinition): string {
  return `${SKILL_TOOL_PREFIX}${skill.id}`;
}

export function getSkillDisplayName(toolName: string): string {
  if (!isSkillToolName(toolName)) return toolName;
  const skill = getSkillByToolName(toolName);
  if (!skill) return toolName;
  return skill.metadata.name;
}

export function getSkillByToolName(toolName: string): NewSkillDefinition | undefined {
  if (!isSkillToolName(toolName)) return undefined;
  const id = toolName.slice(SKILL_TOOL_PREFIX.length);
  return skillStore.skills.find((skill) => skill.id === id);
}

/**
 * Gets OpenAI tool definitions for all skills in the store.
 * For the new Codex-style skills, we create simple tools with no parameters
 * since the skill instruction is loaded on demand.
 */
export function getSkillTools(): OpenAITool[] {
  return skillStore.skills.map((skill) => {
    return {
      type: "function",
      function: {
        name: getSkillToolName(skill),
        description: skill.metadata.description || `Skill: ${skill.metadata.name}`,
        parameters: {
          type: "object",
          properties: {},
        },
      },
    } satisfies OpenAITool;
  });
}

/**
 * Generates a unique ID for a new skill.
 * Uses timestamp + random suffix for uniqueness.
 */
function generateSkillId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `skill-${timestamp}-${random}`;
}

/**
 * Initializes built-in skills if they don't exist in IndexedDB.
 * This is called during loadSkillRegistry to ensure default skills are available.
 * 
 * Requirements: 1.2
 */
async function ensureBuiltInSkills(): Promise<void> {
  for (const template of BUILTIN_SKILL_TEMPLATES) {
    const existing = await getSkillFromDb(template.id);
    if (!existing) {
      const now = Date.now();
      const skill: NewSkillDefinition = {
        id: template.id,
        metadata: {
          name: template.name,
          description: template.description,
        },
        instruction: template.instruction,
        source: "built-in",
        createdAt: now,
        updatedAt: now,
      };
      await saveSkillToDb(skill);
    }
  }
}

/**
 * Loads all skills from IndexedDB into the skill store.
 * Initializes built-in skills if they don't exist.
 * 
 * Requirements: 1.2
 */
export async function loadSkillRegistry(): Promise<void> {
  setSkillLoading(true);
  setSkillError(undefined);

  try {
    // Initialize built-in skills if needed
    await ensureBuiltInSkills();
    
    // Load all skills from IndexedDB
    const skills = await getAllSkillsFromDb();
    
    // Update the store with loaded skills
    setSkills(skills);
  } catch (err: any) {
    setSkillError(err?.message ?? String(err));
    setSkills([]);
  } finally {
    setSkillLoading(false);
  }
}

/**
 * Creates a new skill and saves it to IndexedDB.
 * Validates metadata field lengths before saving.
 * 
 * @param name - Skill name (max 64 chars)
 * @param description - Skill description (max 1024 chars)
 * @param instruction - Skill instruction content
 * @returns The created skill definition
 * @throws Error if validation fails
 * 
 * Requirements: 1.1, 2.1
 */
export async function createSkill(
  name: string,
  description: string,
  instruction: string,
): Promise<NewSkillDefinition> {
  // Validate metadata
  const metadata: SkillMetadata = { name: name.trim(), description };
  const validation = validateSkillMetadata(metadata);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Generate unique ID
  const id = generateSkillId();
  const now = Date.now();

  // Create skill definition
  const skill: NewSkillDefinition = {
    id,
    metadata,
    instruction,
    source: "user",
    createdAt: now,
    updatedAt: now,
  };

  // Save to IndexedDB
  await saveSkillToDb(skill);

  // Reload skills to update store
  await loadSkillRegistry();

  return skill;
}

/**
 * Updates an existing skill in IndexedDB.
 * Validates metadata field lengths before saving.
 * 
 * @param id - The skill ID to update
 * @param metadata - Updated metadata (name and description)
 * @param instruction - Updated instruction content
 * @returns The updated skill definition
 * @throws Error if skill not found or validation fails
 * 
 * Requirements: 1.4
 */
export async function updateSkill(
  id: string,
  metadata: SkillMetadata,
  instruction: string,
): Promise<NewSkillDefinition> {
  // Get existing skill
  const existing = await getSkillFromDb(id);
  if (!existing) {
    throw new Error(`Skill not found: ${id}`);
  }

  // Validate metadata
  const validation = validateSkillMetadata(metadata);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Update skill definition
  const skill: NewSkillDefinition = {
    ...existing,
    metadata: {
      name: metadata.name.trim(),
      description: metadata.description,
    },
    instruction,
    updatedAt: Date.now(),
  };

  // Save to IndexedDB
  await saveSkillToDb(skill);

  // Reload skills to update store
  await loadSkillRegistry();

  return skill;
}

/**
 * Deletes a skill from IndexedDB by ID.
 * 
 * @param id - The skill ID to delete
 * @throws Error if deletion fails
 * 
 * Requirements: 1.1
 */
export async function deleteSkillById(id: string): Promise<void> {
  await deleteSkillFromDb(id);
  
  // Reload skills to update store
  await loadSkillRegistry();
}

/**
 * Searches skills by matching query against name and description.
 * Case-insensitive substring matching.
 * 
 * @param query - Search query string
 * @returns Array of matching skills
 * 
 * Requirements: 5.2
 */
export function searchSkills(query: string): NewSkillDefinition[] {
  if (!query || !query.trim()) {
    return skillStore.skills;
  }

  const lowerQuery = query.toLowerCase().trim();
  return skillStore.skills.filter((skill) => {
    const name = skill.metadata.name.toLowerCase();
    const description = skill.metadata.description.toLowerCase();
    return name.includes(lowerQuery) || description.includes(lowerQuery);
  });
}

/**
 * Exports a skill to SKILL.md format string.
 * 
 * @param skill - The skill to export
 * @returns SKILL.md formatted string
 * 
 * Requirements: 1.4
 */
export function exportSkill(skill: NewSkillDefinition): string {
  return serializeSkillMd(skill.metadata, skill.instruction);
}

/**
 * Imports a skill from SKILL.md content and saves to IndexedDB.
 * 
 * @param content - SKILL.md formatted content
 * @returns The imported skill definition
 * @throws Error if parsing or validation fails
 * 
 * Requirements: 1.3
 */
export async function importSkill(content: string): Promise<NewSkillDefinition> {
  // Parse SKILL.md content
  const { metadata, instruction } = parseSkillMd(content);

  // Create skill using createSkill (handles validation and ID generation)
  return createSkill(metadata.name, metadata.description, instruction);
}

/**
 * Legacy loadSkillRegistry that loads from file system.
 * Kept for backward compatibility during migration.
 */
export async function loadSkillRegistryFromFileSystem(): Promise<void> {
  setSkillLoading(true);
  setSkillError(undefined);

  try {
    await ensureDefaultSkills();
    const root = getSkillsRootPath();
    const entries = await listDir(root);
    const folders = entries.filter((entry) => entry.isDir).map((entry) => entry.name);

    const skills: LegacySkillDefinition[] = [];
    const usedIds = new Set<string>();

    for (const folder of folders) {
      const content = await readSkillFile(folder);
      if (!content) continue;

      const { metadata } = parseSkillFile(content);
      const source = isDefaultSkill(folder) ? "built-in" : "user";
      const skill = buildSkillDefinition(metadata, folder, source);
      if (!skill) continue;

      let uniqueId = skill.id;
      let suffix = 2;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${skill.id}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(uniqueId);
      skills.push({ ...skill, id: uniqueId });
    }

    setSkills([]); // Legacy function - does not populate new store
  } catch (err: any) {
    setSkillError(err?.message ?? String(err));
    setSkills([]);
  } finally {
    setSkillLoading(false);
  }
}

/**
 * Restores built-in skills to IndexedDB.
 */
export async function restoreBuiltInSkills(): Promise<void> {
  // Delete all built-in skills from IndexedDB
  const allSkills = await getAllSkillsFromDb();
  for (const skill of allSkills) {
    if (skill.source === "built-in") {
      await deleteSkillFromDb(skill.id);
    }
  }
  // Re-initialize built-in skills
  await loadSkillRegistry();
}

async function loadSkillInstruction(skill: LegacySkillDefinition): Promise<string> {
  const content = await readSkillFile(skill.folderName);
  if (!content) return "";
  return parseSkillFile(content).instruction;
}

async function resolvePythonFiles(skill: LegacySkillDefinition, step: SkillPythonStep): Promise<PythonFilePayload[]> {
  const files: PythonFilePayload[] = [];
  const fileList = step.files ?? [];

  for (const filePath of fileList) {
    const resolved = buildSkillPath(skill.folderName, getResourcePath(filePath));
    const bytes = await readBinaryFile(resolved);
    if (!bytes) continue;
    files.push({
      path: getResourcePath(filePath),
      base64: toBase64(bytes),
    });
  }

  const codePath = getPythonCodePath(step);
  if (codePath) {
    const resolved = buildSkillPath(skill.folderName, codePath);
    const bytes = await readBinaryFile(resolved);
    if (bytes) {
      files.push({
        path: codePath,
        base64: toBase64(bytes),
      });
    }
  }

  return files;
}

async function resolvePythonCode(skill: LegacySkillDefinition, step: SkillPythonStep): Promise<string> {
  if (step.code) return step.code;
  const codePath = getPythonCodePath(step);
  if (!codePath) return "";

  const resolved = buildSkillPath(skill.folderName, codePath);
  const content = await readTextFile(resolved);
  return content ?? "";
}

function formatStepResult(index: number, label: string, content: string): string {
  const header = `Step ${index + 1}: ${label}`;
  if (!content) return header;
  return `${header}\n${content}`;
}

/**
 * Executes a skill by tool name.
 * For new Codex-style skills, returns the instruction content.
 * 
 * @param toolName - The skill tool name (skill_xxx)
 * @param args - Arguments passed to the skill (unused for new skills)
 * @param overrides - Optional execution overrides
 * @returns The skill execution result
 */
export async function executeSkill(
  toolName: string,
  args: any,
  overrides?: SkillExecutionOverrides,
): Promise<string> {
  const skill = getSkillByToolName(toolName);
  if (!skill) {
    return `Error: Unknown skill ${toolName}`;
  }

  // New Codex-style skill - just return the instruction
  console.log(`[Skill] Executing Codex-style skill: ${skill.metadata.name}`);
  
  const parts = [
    `Skill: ${skill.metadata.name}`,
    skill.metadata.description ? `Description: ${skill.metadata.description}` : "",
    skill.instruction ? `Instruction:\n${skill.instruction}` : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

export async function createSkillTemplate(skillName: string): Promise<void> {
  const trimmed = skillName.trim();
  if (!trimmed) return;

  const folderName = sanitizeSkillFolderName(trimmed);
  const folderPath = buildSkillPath(folderName);
  const filePath = buildSkillPath(folderName, "skills.md");

  if (await skillFileExists(folderName)) return;

  const template = `---\nid: ${normalizeSkillId("", folderName)}\nname: ${trimmed}\ndescription: Describe this skill.\ninputs:\n  - name: query\n    type: string\n    description: Input for this skill.\nsteps:\n  - type: tool\n    tool: searchBlocksByText\n    args:\n      query: "{{query}}"\n---\nAdd instructions for the assistant here.\n`;

  await mkdirs(folderPath);
  await writeTextFile(filePath, template);
}

export async function saveSkillDraft(rawContent: string): Promise<SkillDraftSaveResult> {
  const content = extractSkillMarkdown(rawContent);
  const { metadata } = parseSkillFile(content);
  const name = String(metadata.name ?? "").trim();
  if (!name) {
    throw new Error("技能草稿缺少 name");
  }

  const baseFolder = sanitizeSkillFolderName(name);
  if (!baseFolder) {
    throw new Error("技能名称无效");
  }

  let folderName = baseFolder;
  let index = 2;
  while (await skillFileExists(folderName)) {
    folderName = `${baseFolder}-${index}`;
    index += 1;
  }

  const definition = parseSkillDefinitionFromContent(content, folderName, "user");
  if (!definition) {
    throw new Error("技能草稿格式不完整");
  }

  await mkdirs(buildSkillPath(folderName));
  await writeTextFile(buildSkillPath(folderName, "skills.md"), content);

  return { folderName, definition, content };
}

export async function updateSkillContent(
  skill: LegacySkillDefinition,
  rawContent: string,
): Promise<LegacySkillDefinition> {
  const content = extractSkillMarkdown(rawContent);
  const { metadata } = parseSkillFile(content);
  const name = String(metadata.name ?? "").trim();
  if (!name) {
    throw new Error("技能内容缺少 name");
  }

  const folderName = sanitizeSkillFolderName(name);
  if (!folderName) {
    throw new Error("技能名称无效");
  }

  const source: "built-in" | "user" = isDefaultSkill(folderName) ? "built-in" : "user";
  const definition = buildSkillDefinition(metadata, folderName, source);
  if (!definition) {
    throw new Error("技能内容格式不完整");
  }

  if (folderName !== skill.folderName) {
    const existing = await readSkillFile(folderName);
    if (existing !== null) {
      throw new Error("技能名称已存在");
    }
    const targetPath = buildSkillPath(folderName, "skills.md");
    await mkdirs(buildSkillPath(folderName));
    await writeTextFile(targetPath, content);
    await removeSkillFile(skill.folderName);
    if (isDefaultSkill(skill.folderName)) {
      await disableSkillFolder(skill.folderName);
    }
  } else {
    await writeTextFile(buildSkillPath(folderName, "skills.md"), content);
  }

  return { ...definition, folderName, source };
}

/**
 * Legacy deleteSkill for file-system based skills
 * @deprecated Use deleteSkillById for new IndexedDB-based skills
 */
export async function deleteLegacySkill(skill: LegacySkillDefinition): Promise<void> {
  if (isDefaultSkill(skill.folderName)) {
    await disableSkillFolder(skill.folderName);
  }
  await removeSkillFile(skill.folderName);
}
