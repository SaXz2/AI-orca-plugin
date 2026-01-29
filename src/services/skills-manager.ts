/**
 * Skills Manager Service
 * 
 * 管理 Skills 的存储和操作，支持全局和局部两种存储模式：
 * 
 * 全局存储 (pluginAsRoot: true):
 * {plugin-dir}/skills/{skill-id}/SKILL.md
 * - 所有仓库共享
 * - 适合通用的、跨项目使用的 Skills
 * 
 * 局部存储 (pluginAsRoot: false):
 * {repo}/plugin-data/ai-chat/skills/{skill-id}/SKILL.md
 * - 仅当前仓库可见
 * - 适合项目特定的 Skills
 */

import { getAiChatPluginName } from "../ui/ai-chat-ui";

const SKILLS_ROOT = "skills";
const SKILL_METADATA_FILE = "SKILL.md";

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export interface SkillMetadata {
  id: string;           // Skill ID = 文件夹名称
  name: string;         // Skill 显示名称
  description?: string; // Skill 描述
  version?: string;     // 版本号
  author?: string;      // 作者
  tags?: string[];      // 标签
  [key: string]: any;   // 其他自定义字段
}

export interface SkillFile {
  path: string;         // 相对于 skill 文件夹的路径
  name: string;         // 文件名
  isDir: boolean;       // 是否为目录
  size?: number;        // 文件大小（字节）
}

export interface Skill {
  id: string;           // Skill ID = 文件夹名称
  metadata: SkillMetadata;
  instruction: string;  // SKILL.md 的指令内容
  files: SkillFile[];   // Skill 下的所有文件
  enabled: boolean;     // 是否启用
  isGlobal: boolean;    // 是否为全局 Skill
}

/** Skill 引用，用于列表返回 */
export interface SkillRef {
  id: string;
  isGlobal: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** 获取插件名称，根据 scope 决定 */
function getPluginName(isGlobal: boolean): string {
  if (isGlobal) {
    // 全局存储：动态获取插件名称，确保存储到正确的插件目录
    const name = getAiChatPluginName();
    return name || "ai-chat";
  }
  // 局部存储：固定使用 "ai-chat"，存储在仓库的 plugin-data/ai-chat/ 目录
  return "ai-chat";
}

function buildSkillPath(skillId: string, ...parts: string[]): string {
  const pathParts = [SKILLS_ROOT, skillId, ...parts].filter(Boolean);
  return pathParts.join("/");
}

function parseSkillMetadata(content: string): { metadata: SkillMetadata; instruction: string } {
  // 解析 SKILL.md 的 frontmatter 和内容
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    // 没有 frontmatter，整个内容作为 instruction
    return {
      metadata: { id: "", name: "" },
      instruction: content,
    };
  }

  const [, frontmatterStr, instruction] = match;
  const metadata: SkillMetadata = { id: "", name: "" };

  // 简单的 YAML 解析
  const lines = frontmatterStr.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "tags") {
      metadata.tags = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    } else if (value === "true") {
      (metadata as any)[key] = true;
    } else if (value === "false") {
      (metadata as any)[key] = false;
    } else {
      (metadata as any)[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { metadata, instruction };
}

function buildSkillMetadataContent(metadata: Partial<SkillMetadata>, instruction: string): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(metadata)) {
    if (key === "id") continue; // id 不写入文件

    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => `"${v}"`).join(", ")}]`);
    } else if (typeof value === "string") {
      lines.push(`${key}: "${value}"`);
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (value !== null && value !== undefined) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(instruction);

  return lines.join("\n");
}

// ───────────────────────────────────────────────────────────────────────────────
// Scope Helpers - 处理全局/局部存储
// ───────────────────────────────────────────────────────────────────────────────

/** 列出指定 scope 的所有文件 */
async function listFilesForScope(isGlobal: boolean): Promise<string[]> {
  const pluginName = getPluginName(isGlobal);
  return orca.plugins.listFiles(pluginName, isGlobal);
}

/** 读取指定 scope 的文件 */
async function readFileForScope(path: string, isGlobal: boolean): Promise<string | null> {
  const pluginName = getPluginName(isGlobal);
  const content = await orca.plugins.readFile(pluginName, path, "string", isGlobal);
  if (!content) return null;
  return typeof content === 'string' 
    ? content 
    : new TextDecoder().decode(new Uint8Array(content as ArrayBuffer));
}

/** 写入指定 scope 的文件 */
async function writeFileForScope(path: string, content: string, isGlobal: boolean): Promise<void> {
  const pluginName = getPluginName(isGlobal);
  await orca.plugins.writeFile(pluginName, path, content, isGlobal);
}

/** 删除指定 scope 的文件 */
async function removeFileForScope(path: string, isGlobal: boolean): Promise<void> {
  const pluginName = getPluginName(isGlobal);
  await orca.plugins.removeFile(pluginName, path, isGlobal);
}

/** 删除指定 scope 的文件夹 */
async function removeFolderForScope(path: string, isGlobal: boolean): Promise<void> {
  const pluginName = getPluginName(isGlobal);
  await orca.plugins.removeFolder(pluginName, path, isGlobal);
}

/** 从文件列表中提取 Skill IDs */
function extractSkillIdsFromEntries(entries: string[]): string[] {
  const skillIds = new Set<string>();
  
  for (const entry of entries) {
    const normalizedEntry = entry.replace(/\\/g, "/");
    const skillsPrefix = `${SKILLS_ROOT}/`;
    
    if (!normalizedEntry.startsWith(skillsPrefix)) continue;
    
    const relative = normalizedEntry.slice(SKILLS_ROOT.length + 1);
    const parts = relative.split("/");
    
    if (parts.length > 0 && parts[0]) {
      skillIds.add(parts[0]);
    }
  }
  
  return Array.from(skillIds);
}

// ───────────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────────

/**
 * 列出所有 Skills（合并全局和局部）
 * @returns SkillRef 数组，包含 id 和 isGlobal
 */
export async function listSkills(): Promise<SkillRef[]> {
  try {
    // 获取全局 Skills
    const globalEntries = await listFilesForScope(true).catch(() => []);
    const globalIds = extractSkillIdsFromEntries(globalEntries);
    
    // 获取局部 Skills
    const localEntries = await listFilesForScope(false).catch(() => []);
    const localIds = extractSkillIdsFromEntries(localEntries);
    
    // 合并结果，标记 isGlobal
    const result: SkillRef[] = [];
    const seen = new Set<string>();
    
    // 先添加全局 Skills
    for (const id of globalIds) {
      result.push({ id, isGlobal: true });
      seen.add(`global:${id}`);
    }
    
    // 再添加局部 Skills（如果同名，两个都保留）
    for (const id of localIds) {
      result.push({ id, isGlobal: false });
    }
    
    // 按名称排序
    result.sort((a, b) => a.id.localeCompare(b.id));
    
    console.log(`[SkillsManager] listSkills() found ${result.length} skills (global: ${globalIds.length}, local: ${localIds.length})`);
    return result;
  } catch (err) {
    console.error("[SkillsManager] Failed to list skills:", err);
    return [];
  }
}

/**
 * 获取 Skill 详情
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill（如果不确定，会先查全局再查局部）
 */
export async function getSkill(skillId: string, isGlobal?: boolean): Promise<Skill | null> {
  try {
    const skillMdPath = buildSkillPath(skillId, SKILL_METADATA_FILE);
    
    // 如果指定了 isGlobal，直接查找
    if (isGlobal !== undefined) {
      const content = await readFileForScope(skillMdPath, isGlobal);
      if (!content) return null;
      return await buildSkillFromContent(skillId, content, isGlobal);
    }
    
    // 否则先查全局，再查局部
    const globalContent = await readFileForScope(skillMdPath, true).catch(() => null);
    if (globalContent) {
      return await buildSkillFromContent(skillId, globalContent, true);
    }
    
    const localContent = await readFileForScope(skillMdPath, false).catch(() => null);
    if (localContent) {
      return await buildSkillFromContent(skillId, localContent, false);
    }
    
    console.warn(`[SkillsManager] SKILL.md not found for skill: ${skillId}`);
    return null;
  } catch (err) {
    console.error(`[SkillsManager] Failed to get skill ${skillId}:`, err);
    return null;
  }
}

/** 从内容构建 Skill 对象 */
async function buildSkillFromContent(skillId: string, content: string, isGlobal: boolean): Promise<Skill> {
  const { metadata, instruction } = parseSkillMetadata(content);
  metadata.id = skillId;
  
  const files = await listSkillFiles(skillId, isGlobal);
  const enabled = await isSkillEnabled(skillId, isGlobal);
  
  return {
    id: skillId,
    metadata,
    instruction,
    files,
    enabled,
    isGlobal,
  };
}

/**
 * 创建新 Skill
 * @param skillId Skill ID
 * @param metadata Skill 元数据
 * @param instruction Skill 指令
 * @param isGlobal 是否为全局 Skill（默认 false，即局部）
 */
export async function createSkill(
  skillId: string,
  metadata: Omit<SkillMetadata, "id">,
  instruction: string,
  isGlobal: boolean = false
): Promise<boolean> {
  console.log(`[SkillsManager] createSkill() called: skillId=${skillId}, name=${metadata.name}, isGlobal=${isGlobal}`);

  try {
    // 检查在同一 scope 中是否已存在
    const existing = await getSkill(skillId, isGlobal);
    if (existing) {
      console.warn(`[SkillsManager] Skill already exists in ${isGlobal ? 'global' : 'local'} scope: ${skillId}`);
      return false;
    }

    // 创建 SKILL.md
    const skillMdPath = buildSkillPath(skillId, SKILL_METADATA_FILE);
    const fullMetadata: SkillMetadata = { id: skillId, name: metadata.name, ...metadata };
    const content = buildSkillMetadataContent(fullMetadata, instruction);

    await writeFileForScope(skillMdPath, content, isGlobal);
    
    // 验证文件已写入
    const verifyContent = await readFileForScope(skillMdPath, isGlobal);
    if (!verifyContent) {
      console.error(`[SkillsManager] Verification failed: SKILL.md not found after write`);
      return false;
    }

    console.log(`[SkillsManager] Successfully created skill: ${skillId} (${isGlobal ? 'global' : 'local'})`);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to create skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 更新 Skill 的元数据和指令
 * @param skillId Skill ID
 * @param metadata 要更新的元数据
 * @param instruction 新的指令（可选）
 * @param isGlobal 是否为全局 Skill
 */
export async function updateSkill(
  skillId: string,
  metadata: Partial<SkillMetadata>,
  instruction?: string,
  isGlobal?: boolean
): Promise<boolean> {
  try {
    // 如果没指定 isGlobal，先查找 Skill 确定其位置
    let targetIsGlobal = isGlobal;
    if (targetIsGlobal === undefined) {
      const skill = await getSkill(skillId);
      if (!skill) {
        console.warn(`[SkillsManager] Skill not found: ${skillId}`);
        return false;
      }
      targetIsGlobal = skill.isGlobal;
    }
    
    const skill = await getSkill(skillId, targetIsGlobal);
    if (!skill) {
      console.warn(`[SkillsManager] Skill not found: ${skillId}`);
      return false;
    }

    // 合并元数据
    const updatedMetadata: SkillMetadata = {
      ...skill.metadata,
      ...metadata,
      id: skillId,
    };

    // 使用新指令或保留原有指令
    const updatedInstruction = instruction ?? skill.instruction;

    // 更新 SKILL.md
    const skillMdPath = buildSkillPath(skillId, SKILL_METADATA_FILE);
    const content = buildSkillMetadataContent(updatedMetadata, updatedInstruction);

    await writeFileForScope(skillMdPath, content, targetIsGlobal);

    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to update skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 删除 Skill（直接删除整个文件夹）
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill
 */
export async function deleteSkill(skillId: string, isGlobal: boolean): Promise<boolean> {
  try {
    console.log(`[SkillsManager] Deleting skill: ${skillId} (${isGlobal ? 'global' : 'local'})`);
    
    const skillFolderPath = buildSkillPath(skillId);
    await removeFolderForScope(skillFolderPath, isGlobal);
    
    console.log(`[SkillsManager] Successfully deleted skill: ${skillId}`);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to delete skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 列出 Skill 下的所有文件
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill
 */
export async function listSkillFiles(skillId: string, isGlobal: boolean): Promise<SkillFile[]> {
  try {
    const entries = await listFilesForScope(isGlobal);
    const skillPrefix = buildSkillPath(skillId);
    const files: SkillFile[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      const normalizedEntry = entry.replace(/\\/g, "/");
      const normalizedPrefix = skillPrefix.replace(/\\/g, "/");
      
      if (!normalizedEntry.startsWith(`${normalizedPrefix}/`)) continue;

      const relative = normalizedEntry.slice(normalizedPrefix.length + 1);
      if (!relative) continue;

      const parts = relative.split("/");
      const name = parts[0];

      if (seen.has(name)) continue;
      seen.add(name);

      files.push({
        path: relative,
        name,
        isDir: parts.length > 1,
      });
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error(`[SkillsManager] Failed to list files for skill ${skillId}:`, err);
    return [];
  }
}

/**
 * 读取 Skill 中的文件
 * @param skillId Skill ID
 * @param filePath 文件路径
 * @param isGlobal 是否为全局 Skill
 */
export async function readSkillFile(skillId: string, filePath: string, isGlobal: boolean): Promise<string | null> {
  try {
    const fullPath = buildSkillPath(skillId, filePath);
    return await readFileForScope(fullPath, isGlobal);
  } catch (err) {
    console.error(`[SkillsManager] Failed to read file ${filePath} from skill ${skillId}:`, err);
    return null;
  }
}

/**
 * 写入 Skill 中的文件
 * @param skillId Skill ID
 * @param filePath 文件路径
 * @param content 文件内容
 * @param isGlobal 是否为全局 Skill
 */
export async function writeSkillFile(
  skillId: string,
  filePath: string,
  content: string,
  isGlobal: boolean
): Promise<boolean> {
  try {
    const fullPath = buildSkillPath(skillId, filePath);
    await writeFileForScope(fullPath, content, isGlobal);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to write file ${filePath} to skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 删除 Skill 中的文件
 * @param skillId Skill ID
 * @param filePath 文件路径
 * @param isGlobal 是否为全局 Skill
 */
export async function deleteSkillFile(skillId: string, filePath: string, isGlobal: boolean): Promise<boolean> {
  try {
    const fullPath = buildSkillPath(skillId, filePath);
    await removeFileForScope(fullPath, isGlobal);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to delete file ${filePath} from skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 检查 Skill 是否启用
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill
 */
export async function isSkillEnabled(skillId: string, isGlobal: boolean): Promise<boolean> {
  // 启用状态是用户配置，统一存储在固定插件名下
  const pluginName = "ai-chat";
  // 使用 scope 前缀区分全局和局部的启用状态
  const disabledKey = `skills:disabled:${isGlobal ? 'global' : 'local'}:${skillId}`;

  try {
    const value = await orca.plugins.getData(pluginName, disabledKey);
    return !value;
  } catch {
    return true; // 默认启用
  }
}

/**
 * 启用/禁用 Skill
 * @param skillId Skill ID
 * @param enabled 是否启用
 * @param isGlobal 是否为全局 Skill
 */
export async function setSkillEnabled(skillId: string, enabled: boolean, isGlobal: boolean): Promise<boolean> {
  // 启用状态是用户配置，统一存储在固定插件名下
  const pluginName = "ai-chat";
  const disabledKey = `skills:disabled:${isGlobal ? 'global' : 'local'}:${skillId}`;

  try {
    if (enabled) {
      await orca.plugins.setData(pluginName, disabledKey, null);
    } else {
      await orca.plugins.setData(pluginName, disabledKey, "true");
    }
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to set skill ${skillId} enabled=${enabled}:`, err);
    return false;
  }
}

/**
 * 导出 Skill（返回 JSON 格式）
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill
 */
export async function exportSkill(skillId: string, isGlobal: boolean): Promise<string | null> {
  try {
    const skill = await getSkill(skillId, isGlobal);
    if (!skill) return null;

    const exported = {
      id: skill.id,
      metadata: skill.metadata,
      instruction: skill.instruction,
      enabled: skill.enabled,
      isGlobal: skill.isGlobal,
    };

    return JSON.stringify(exported, null, 2);
  } catch (err) {
    console.error(`[SkillsManager] Failed to export skill ${skillId}:`, err);
    return null;
  }
}

/**
 * 导入 Skill（从 JSON 格式）
 * @param skillId Skill ID
 * @param jsonContent JSON 内容
 * @param isGlobal 是否导入为全局 Skill（默认 false）
 */
export async function importSkill(skillId: string, jsonContent: string, isGlobal: boolean = false): Promise<boolean> {
  try {
    const data = JSON.parse(jsonContent);

    // 创建 Skill
    const success = await createSkill(skillId, data.metadata, data.instruction, isGlobal);
    if (!success) return false;

    // 设置启用状态
    if (data.enabled !== undefined) {
      await setSkillEnabled(skillId, data.enabled, isGlobal);
    }

    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to import skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 初始化内置 Skills
 * 在系统首次启动时创建预设的 Skills
 */
export async function ensureBuiltInSkills(): Promise<void> {
  const builtInSkills = [
    {
      id: "今日回顾",
      metadata: {
        name: "今日回顾",
        description: "总结今天的工作和生活，提取关键事件、完成任务和待办事项。Use when users ask to review their day, summarize today's work, or reflect on daily progress.",
        version: "1.0.0",
        tags: ["日记", "总结", "回顾", "反思"],
      },
      instruction: `# 今日回顾

## 执行工具要求

**必须使用的工具**:
- \`getTodayJournal\` - 获取今天日记的完整内容

**执行流程**:
1. 调用 \`getTodayJournal\` 工具获取今天的日记内容
2. 分析日记内容，提取关键信息
3. 按照下面的格式组织内容
4. 生成结构化的回顾总结

## 快速开始

帮助用户快速回顾今天的工作和生活。

### 基本用法

1. 调用 getTodayJournal 获取今天的日记
2. 提取 3-5 条关键事件
3. 列出已完成的重要任务
4. 整理未完成的事项
5. 生成结构化的回顾总结

### 输出格式

\`\`\`markdown
## 今日回顾

### 关键事件
- [事件 1]
- [事件 2]
- [事件 3]

### 已完成任务
✅ [任务 1]
✅ [任务 2]
✅ [任务 3]

### 未完成/待办
⏳ [待办 1]
⏳ [待办 2]

### 明日关注
- [明日计划 1]
- [明日计划 2]
\`\`\`

## 执行规则

**严格要求**:
- ✅ 必须先调用 getTodayJournal 工具获取今天的日记
- ✅ 只使用日记中的真实内容，不要编造
- ✅ 按照上述格式输出，保持一致性
- ✅ 关键事件最多 5 条，按重要性排序
- ❌ 不要使用其他工具
- ❌ 不要跳过 getTodayJournal 步骤

## 最佳实践

- **时间**：每天晚上使用，花费 5-10 分钟
- **内容**：包含具体的事件和成果，避免过于笼统
- **格式**：使用清晰的分类和符号（✅ 完成，⏳ 待办）
- **反思**：添加个人感受或改进建议

## 常见场景

### 场景 1：工作日总结
从工作日的日记中提取任务列表和笔记，生成专业的工作总结。

### 场景 2：学习反思
从今天的学习日记中提取学习内容，生成学习总结和改进计划。

### 场景 3：生活回顾
从今天的生活日记中提取生活事件，生成个人成长反思。`,

    },
    {
      id: "周报聚合",
      metadata: {
        name: "周报聚合",
        description: "汇总一周的工作成果、项目进展和问题解决方案，生成专业周报。Use when users need to create weekly reports, summarize weekly progress, or prepare team updates.",
        version: "1.0.0",
        tags: ["周报", "总结", "汇总", "报告"],
      },
      instruction: `# 周报聚合

## 执行工具要求

**必须使用的工具**:
- \`getJournalsByDateRange\` - 按日期范围获取日记

**执行流程**:
1. 调用 \`getJournalsByDateRange\` 工具获取本周的日记
2. 分析日记内容，按项目/部门分类
3. 提取关键成果、问题和下周计划
4. 按照下面的格式组织内容
5. 生成专业的周报总结

## 快速开始

将一周的工作、任务和成果汇总成专业的周报。

### 基本用法

1. 调用 getJournalsByDateRange 获取本周的日记
2. 按项目或部门分类整理
3. 提取关键成果和亮点
4. 总结遇到的问题和解决方案
5. 制定下周计划

### 输出格式

\`\`\`markdown
## 周报总结 (第 X 周)

### 本周成果
- [成果 1]
- [成果 2]
- [成果 3]

### 项目进展
**项目 A**
- 进度：X% → Y%
- 完成：[完成项]
- 下周：[计划项]

**项目 B**
- 进度：X% → Y%
- 完成：[完成项]
- 下周：[计划项]

### 遇到的问题
1. **问题 1**
   - 原因：[原因]
   - 解决：[解决方案]
   - 结果：[结果]

2. **问题 2**
   - 原因：[原因]
   - 解决：[解决方案]
   - 结果：[结果]

### 下周计划
- [ ] [计划 1]
- [ ] [计划 2]
- [ ] [计划 3]

### 其他备注
- [备注 1]
- [备注 2]
\`\`\`

## 执行规则

**严格要求**:
- ✅ 必须先调用 getJournalsByDateRange 工具获取本周日记
- ✅ 只使用日记中的真实内容，不要编造
- ✅ 按照上述格式输出，保持一致性
- ✅ 本周成果最多 5 条，按重要性排序
- ✅ 项目进展最多 3 个项目
- ✅ 问题最多 3 个，每个问题需要原因、解决方案和结果
- ❌ 不要使用其他工具
- ❌ 不要跳过 getJournalsByDateRange 步骤
- ❌ 不要编造数据或进度

## 最佳实践

- **时间**：每周五下午生成，为团队同步做准备
- **数据来源**：从本周的日记中提取真实数据
- **重点突出**：强调关键成果和解决的问题
- **前瞻性**：清晰列出下周计划和风险预警
- **准确性**：所有数据必须来自日记的真实内容

## 常见场景

### 场景 1：技术团队周报
从本周日记中汇总开发进度、bug 修复、性能优化等技术工作。

### 场景 2：项目管理周报
从本周日记中总结项目里程碑、团队产出、风险和下周计划。

### 场景 3：销售团队周报
从本周日记中统计销售成果、客户反馈、问题处理和下周目标。`,
    },
  ];

  for (const skill of builtInSkills) {
    try {
      // 检查全局 Skills 中是否已存在
      const existingSkills = await listSkills();
      const exists = existingSkills.some(s => s.id === skill.id && s.isGlobal);
      if (exists) {
        console.log(`[SkillsManager] Built-in skill already exists: ${skill.id}`);
        continue;
      }

      // 创建内置 Skill（全局）
      const success = await createSkill(skill.id, skill.metadata, skill.instruction, true);
      if (success) {
        console.log(`[SkillsManager] Created built-in skill (global): ${skill.id}`);
      } else {
        console.warn(`[SkillsManager] Failed to create built-in skill: ${skill.id}`);
      }
    } catch (err) {
      console.error(`[SkillsManager] Error creating built-in skill ${skill.id}:`, err);
    }
  }
}
