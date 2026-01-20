/**
 * Skills Manager Service
 * 
 * 管理 Skills 的存储和操作，采用新的文件夹结构：
 * plugin-data/ai-chat/skills/
 * ├── 日记整理/
 * │   ├── SKILL.md              # 主指令（metadata + instruction）
 * │   └── scripts/              # 可选脚本文件夹
 * │       ├── process.py
 * │       └── utils.js
 * ├── 知识卡片/
 * │   ├── SKILL.md
 * │   └── scripts/
 * │       └── generate.py
 * └── 周报聚合/
 *     ├── SKILL.md
 *     └── scripts/
 *         ├── fetch.py
 *         └── format.js
 */

const SKILLS_ROOT = "skills";
const SKILL_METADATA_FILE = "SKILL.md";
const SCRIPTS_DIR = "scripts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getPluginName(): string {
  // 始终使用 "ai-chat" 作为插件名称，确保一致性
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

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 列出所有 Skills
 */
export async function listSkills(): Promise<string[]> {
  const pluginName = getPluginName();
  
  try {
    const entries = await orca.plugins.listFiles(pluginName);
    console.log(`[SkillsManager] listFiles returned ${entries.length} entries:`, entries);
    
    const skillIds = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`[SkillsManager] [${i}] Raw entry: "${entry}"`);
      
      // 规范化路径分隔符（Windows 使用 \，Unix 使用 /）
      const normalizedEntry = entry.replace(/\\/g, "/");
      console.log(`[SkillsManager] [${i}] Normalized: "${normalizedEntry}"`);
      
      // 检查是否在 skills 目录下
      const skillsPrefix = `${SKILLS_ROOT}/`;
      console.log(`[SkillsManager] [${i}] Checking if starts with "${skillsPrefix}": ${normalizedEntry.startsWith(skillsPrefix)}`);
      
      if (!normalizedEntry.startsWith(skillsPrefix)) {
        console.log(`[SkillsManager] [${i}] Does not start with skills/, skipping`);
        continue;
      }

      const relative = normalizedEntry.slice(SKILLS_ROOT.length + 1);
      console.log(`[SkillsManager] [${i}] Relative path: "${relative}"`);
      
      const parts = relative.split("/");
      console.log(`[SkillsManager] [${i}] Parts:`, parts);
      
      if (parts.length > 0 && parts[0]) {
        console.log(`[SkillsManager] [${i}] Adding skill ID: "${parts[0]}"`);
        skillIds.add(parts[0]);
      } else {
        console.log(`[SkillsManager] [${i}] parts[0] is empty or invalid`);
      }
    }

    const result = Array.from(skillIds).sort();
    console.log(`[SkillsManager] listSkills() found ${result.length} skills:`, result);
    return result;
  } catch (err) {
    console.error("[SkillsManager] Failed to list skills:", err);
    return [];
  }
}

/**
 * 获取 Skill 详情
 */
export async function getSkill(skillId: string): Promise<Skill | null> {
  const pluginName = getPluginName();

  try {
    // 读取 SKILL.md
    const skillMdPath = buildSkillPath(skillId, SKILL_METADATA_FILE);
    console.log(`[SkillsManager] getSkill() reading: ${skillMdPath}`);
    
    const skillMdContent = await orca.plugins.readFile(pluginName, skillMdPath);

    if (!skillMdContent) {
      console.warn(`[SkillsManager] SKILL.md not found for skill: ${skillId}`);
      return null;
    }

    // 确保内容是字符串
    const contentStr = typeof skillMdContent === 'string' 
      ? skillMdContent 
      : new TextDecoder().decode(new Uint8Array(skillMdContent as ArrayBuffer));

    console.log(`[SkillsManager] getSkill() read ${contentStr.length} bytes for ${skillId}`);

    const { metadata, instruction } = parseSkillMetadata(contentStr);
    metadata.id = skillId;

    // 列出 Skill 下的所有文件
    const files = await listSkillFiles(skillId);

    // 检查是否启用
    const enabled = await isSkillEnabled(skillId);

    return {
      id: skillId,
      metadata,
      instruction,
      files,
      enabled,
    };
  } catch (err) {
    console.error(`[SkillsManager] Failed to get skill ${skillId}:`, err);
    return null;
  }
}

/**
 * 创建新 Skill
 */
export async function createSkill(
  skillId: string,
  metadata: Omit<SkillMetadata, "id">,
  instruction: string
): Promise<boolean> {
  const pluginName = getPluginName();
  console.log(`[SkillsManager] createSkill() called: skillId=${skillId}, name=${metadata.name}`);

  try {
    // 检查是否已存在
    const existing = await getSkill(skillId);
    if (existing) {
      console.warn(`[SkillsManager] Skill already exists: ${skillId}`);
      return false;
    }

    // 创建 SKILL.md
    const skillMdPath = buildSkillPath(skillId, SKILL_METADATA_FILE);
    console.log(`[SkillsManager] Writing SKILL.md to: ${skillMdPath}`);
    
    const fullMetadata: SkillMetadata = { id: skillId, name: metadata.name, ...metadata };
    const content = buildSkillMetadataContent(fullMetadata, instruction);
    console.log(`[SkillsManager] Content length: ${content.length} bytes`);
    console.log(`[SkillsManager] Content preview:`, content.slice(0, 200));

    await orca.plugins.writeFile(pluginName, skillMdPath, content);
    console.log(`[SkillsManager] Successfully wrote SKILL.md`);
    
    // Verify the file was written
    const verifyContent = await orca.plugins.readFile(pluginName, skillMdPath);
    if (!verifyContent) {
      console.error(`[SkillsManager] Verification failed: SKILL.md not found after write`);
      return false;
    }
    console.log(`[SkillsManager] Verification passed: SKILL.md exists`);
    
    // Verify it appears in listFiles
    const entries = await orca.plugins.listFiles(pluginName);
    const found = entries.some(e => e.replace(/\\/g, "/").includes(`${skillId}/SKILL.md`));
    console.log(`[SkillsManager] File appears in listFiles: ${found}`);

    console.log(`[SkillsManager] Successfully created skill: ${skillId}`);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to create skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 更新 Skill 的元数据和指令
 */
export async function updateSkill(
  skillId: string,
  metadata: Partial<SkillMetadata>,
  instruction?: string
): Promise<boolean> {
  const pluginName = getPluginName();

  try {
    const skill = await getSkill(skillId);
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

    await orca.plugins.writeFile(pluginName, skillMdPath, content);

    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to update skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 删除 Skill（删除所有文件，但文件夹无法删除 - Orca API 限制）
 * 
 * 注意：Orca API 的 removeFile 不支持删除文件夹，只能删除文件。
 * 因此删除后会留下空文件夹，这是已知的 API 限制。
 */
export async function deleteSkill(skillId: string): Promise<boolean> {
  const pluginName = getPluginName();

  try {
    console.log(`[SkillsManager] Deleting skill: ${skillId}`);
    
    // 列出所有文件并删除
    const entries = await orca.plugins.listFiles(pluginName);
    const skillPrefix = buildSkillPath(skillId);
    const filesToDelete: string[] = [];
    
    for (const entry of entries) {
      const normalizedEntry = entry.replace(/\\/g, "/");
      if (normalizedEntry.startsWith(`${skillPrefix}/`)) {
        filesToDelete.push(entry);
      }
    }
    
    // 按路径长度倒序排列，先删除深层文件，再删除浅层文件
    filesToDelete.sort((a, b) => b.length - a.length);
    
    console.log(`[SkillsManager] Found ${filesToDelete.length} files to delete`);
    
    // 删除所有文件
    for (const file of filesToDelete) {
      try {
        await orca.plugins.removeFile(pluginName, file);
        console.log(`[SkillsManager] Deleted: ${file}`);
      } catch (err) {
        console.warn(`[SkillsManager] Failed to delete file ${file}:`, err);
      }
    }
    
    // 注意：文件夹无法删除，这是 Orca API 的限制
    console.log(`[SkillsManager] Successfully deleted skill files: ${skillId} (empty folder may remain due to API limitation)`);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to delete skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 列出 Skill 下的所有文件
 */
export async function listSkillFiles(skillId: string): Promise<SkillFile[]> {
  const pluginName = getPluginName();

  try {
    const entries = await orca.plugins.listFiles(pluginName);
    const skillPrefix = buildSkillPath(skillId);
    const files: SkillFile[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      // 规范化路径分隔符
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
 */
export async function readSkillFile(skillId: string, filePath: string): Promise<string | null> {
  const pluginName = getPluginName();

  try {
    const fullPath = buildSkillPath(skillId, filePath);
    const content = await orca.plugins.readFile(pluginName, fullPath);
    
    if (!content) {
      return null;
    }

    // 确保返回字符串
    if (typeof content === 'string') {
      return content;
    }

    // 如果是 ArrayBuffer 或 Uint8Array，转换为字符串
    if (content && typeof content === 'object') {
      try {
        const bytes = content instanceof Uint8Array ? content : new Uint8Array(content as ArrayBuffer);
        return new TextDecoder().decode(bytes);
      } catch {
        return null;
      }
    }

    return null;
  } catch (err) {
    console.error(`[SkillsManager] Failed to read file ${filePath} from skill ${skillId}:`, err);
    return null;
  }
}

/**
 * 写入 Skill 中的文件
 */
export async function writeSkillFile(
  skillId: string,
  filePath: string,
  content: string
): Promise<boolean> {
  const pluginName = getPluginName();

  try {
    const fullPath = buildSkillPath(skillId, filePath);
    await orca.plugins.writeFile(pluginName, fullPath, content);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to write file ${filePath} to skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 删除 Skill 中的文件
 */
export async function deleteSkillFile(skillId: string, filePath: string): Promise<boolean> {
  const pluginName = getPluginName();

  try {
    const fullPath = buildSkillPath(skillId, filePath);
    await orca.plugins.removeFile(pluginName, fullPath);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to delete file ${filePath} from skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 检查 Skill 是否启用
 */
export async function isSkillEnabled(skillId: string): Promise<boolean> {
  const pluginName = getPluginName();
  const disabledKey = `skills:disabled:${skillId}`;

  try {
    const value = await orca.plugins.getData(pluginName, disabledKey);
    return !value;
  } catch {
    return true; // 默认启用
  }
}

/**
 * 启用/禁用 Skill
 */
export async function setSkillEnabled(skillId: string, enabled: boolean): Promise<boolean> {
  const pluginName = getPluginName();
  const disabledKey = `skills:disabled:${skillId}`;

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
 */
export async function exportSkill(skillId: string): Promise<string | null> {
  try {
    const skill = await getSkill(skillId);
    if (!skill) return null;

    const exported = {
      id: skill.id,
      metadata: skill.metadata,
      instruction: skill.instruction,
      enabled: skill.enabled,
    };

    return JSON.stringify(exported, null, 2);
  } catch (err) {
    console.error(`[SkillsManager] Failed to export skill ${skillId}:`, err);
    return null;
  }
}

/**
 * 导入 Skill（从 JSON 格式）
 */
export async function importSkill(skillId: string, jsonContent: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonContent);

    // 创建 Skill
    const success = await createSkill(skillId, data.metadata, data.instruction);
    if (!success) return false;

    // 设置启用状态
    if (data.enabled !== undefined) {
      await setSkillEnabled(skillId, data.enabled);
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
      // 检查是否已存在 - 只检查 Skill ID 是否在列表中
      const existingSkills = await listSkills();
      if (existingSkills.includes(skill.id)) {
        console.log(`[SkillsManager] Built-in skill already exists: ${skill.id}`);
        continue;
      }

      // 创建内置 Skill
      const success = await createSkill(skill.id, skill.metadata, skill.instruction);
      if (success) {
        console.log(`[SkillsManager] Created built-in skill: ${skill.id}`);
      } else {
        console.warn(`[SkillsManager] Failed to create built-in skill: ${skill.id}`);
      }
    } catch (err) {
      console.error(`[SkillsManager] Error creating built-in skill ${skill.id}:`, err);
    }
  }
}
