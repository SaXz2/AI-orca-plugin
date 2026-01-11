import type { OpenAITool } from "./openai-client";
import { parse as parseYaml } from "yaml";
import { skillStore, setSkillError, setSkillLoading, setSkills } from "../store/skill-store";
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

export type SkillDefinition = {
  id: string;
  name: string;
  description?: string;
  inputs: SkillInput[];
  steps: SkillStep[];
  source: "built-in" | "user";
  folderName: string;
};

export type SkillDraftSaveResult = {
  folderName: string;
  definition: SkillDefinition;
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
  instructionProvider?: (skill: SkillDefinition) => Promise<string>;
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
): SkillDefinition | null {
  const name = String(metadata.name ?? "").trim();
  if (!name) return null;

  const steps = normalizeSteps(metadata.steps);
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
): SkillDefinition | null {
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

export async function getSkillContent(skill: SkillDefinition): Promise<string> {
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

export function getSkillToolName(skill: SkillDefinition): string {
  return `${SKILL_TOOL_PREFIX}${skill.id}`;
}

export function getSkillDisplayName(toolName: string): string {
  if (!isSkillToolName(toolName)) return toolName;
  const skill = getSkillByToolName(toolName);
  return skill?.name ?? toolName;
}

export function getSkillByToolName(toolName: string): SkillDefinition | undefined {
  if (!isSkillToolName(toolName)) return undefined;
  const id = toolName.slice(SKILL_TOOL_PREFIX.length);
  return skillStore.skills.find((skill) => skill.id === id);
}

export function getSkillTools(): OpenAITool[] {
  return skillStore.skills.map((skill) => {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const input of skill.inputs) {
      if (!input.name) continue;
      properties[input.name] = {
        type: input.type ?? "string",
        description: input.description ?? "",
      };
      if (Array.isArray(input.enum)) {
        properties[input.name].enum = input.enum;
      }
      if (input.default !== undefined) {
        properties[input.name].default = input.default;
      }
      if (input.required) {
        required.push(input.name);
      }
    }

    const parameters: any = {
      type: "object",
      properties,
    };
    if (required.length > 0) {
      parameters.required = required;
    }

    return {
      type: "function",
      function: {
        name: getSkillToolName(skill),
        description: skill.description || `Skill: ${skill.name}`,
        parameters,
      },
    } satisfies OpenAITool;
  });
}

export async function loadSkillRegistry(): Promise<void> {
  setSkillLoading(true);
  setSkillError(undefined);

  try {
    await ensureDefaultSkills();
    const root = getSkillsRootPath();
    const entries = await listDir(root);
    const folders = entries.filter((entry) => entry.isDir).map((entry) => entry.name);

    const skills: SkillDefinition[] = [];
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

    setSkills(skills);
  } catch (err: any) {
    setSkillError(err?.message ?? String(err));
    setSkills([]);
  } finally {
    setSkillLoading(false);
  }
}

export async function restoreBuiltInSkills(): Promise<void> {
  await clearDisabledSkillFolders();
  await restoreDefaultSkills();
  await loadSkillRegistry();
}

async function loadSkillInstruction(skill: SkillDefinition): Promise<string> {
  const content = await readSkillFile(skill.folderName);
  if (!content) return "";
  return parseSkillFile(content).instruction;
}

async function resolvePythonFiles(skill: SkillDefinition, step: SkillPythonStep): Promise<PythonFilePayload[]> {
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

async function resolvePythonCode(skill: SkillDefinition, step: SkillPythonStep): Promise<string> {
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

export async function executeSkill(
  toolName: string,
  args: any,
  overrides?: SkillExecutionOverrides,
): Promise<string> {
  const skill = getSkillByToolName(toolName);
  if (!skill) {
    return `Error: Unknown skill ${toolName}`;
  }

  const inputValues = applyInputDefaults(skill.inputs, args ?? {});
  const results: string[] = [];

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i];
    try {
      if (step.type === "tool") {
        const resolvedArgs = resolveTemplateValue(step.args ?? {}, inputValues);
        let output: string;
        if (overrides?.toolExecutor) {
          output = await overrides.toolExecutor(step.tool, resolvedArgs);
        } else {
          const { executeTool } = await import("./ai-tools");
          const { isTodoistTool, executeTodoistTool } = await import("./todoist-tools");
          output = isTodoistTool(step.tool)
            ? await executeTodoistTool(step.tool, resolvedArgs)
            : await executeTool(step.tool, resolvedArgs);
        }
        results.push(formatStepResult(i, `Tool ${step.tool}`, output));
      } else if (step.type === "python") {
        const code = await resolvePythonCode(skill, step);
        if (!code) {
          results.push(formatStepResult(i, "Python", "Error: Missing python code"));
          continue;
        }
        const files = await resolvePythonFiles(skill, step);
        const input = resolveTemplateValue(step.input ?? inputValues, inputValues);
        const pythonRunner = overrides?.pythonExecutor ?? runPythonStep;
        const { output, runtime } = await pythonRunner({
          code,
          packages: step.packages,
          input,
          files,
        });
        results.push(formatStepResult(i, `Python (${runtime})`, output));
      }
    } catch (err: any) {
      results.push(formatStepResult(i, "Error", err?.message ?? String(err)));
      break;
    }
  }

  const instructionSource = overrides?.instructionProvider ?? loadSkillInstruction;
  const instruction = await instructionSource(skill);
  const parts = [
    `Skill: ${skill.name}`,
    ...results,
    instruction ? `Instruction:\n${instruction}` : "",
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
  skill: SkillDefinition,
  rawContent: string,
): Promise<SkillDefinition> {
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

export async function deleteSkill(skill: SkillDefinition): Promise<void> {
  if (isDefaultSkill(skill.folderName)) {
    await disableSkillFolder(skill.folderName);
  }
  await removeSkillFile(skill.folderName);
}
