# Skills 系统迁移指南

## 概述

已完成从旧的 Skills 系统到新的 `SkillsManager` 的迁移。旧系统已完全移除，新系统采用 Orca plugins API 存储。

## 删除的文件

以下旧的 Skills 系统文件已被删除：

### Services
- `src/services/skill-fs.ts` - 文件系统存储实现
- `src/services/skill-service.ts` - 旧的 Skills 服务
- `src/services/skill-storage.ts` - IndexedDB 存储实现
- `src/services/skill-zip.ts` - 压缩工具

### Store & Types
- `src/store/skill-store.ts` - 旧的状态管理
- `src/types/skill.ts` - 旧的类型定义

### Tests
- `tests/skill-service.test.ts` - 旧的测试文件

## 新的文件

### Services
- `src/services/skills-manager.ts` - 新的 Skills 管理服务
- `src/services/skills-manager.example.ts` - 使用示例

### Types
- `src/types/skills.ts` - 新的类型定义

## 新的 Skills 系统架构

### 文件夹结构

```
plugin-data/ai-chat/skills/
├── 日记整理/
│   ├── SKILL.md              # 主指令（metadata + instruction）
│   └── scripts/              # 可选脚本文件夹
│       ├── process.py
│       └── utils.js
├── 知识卡片/
│   ├── SKILL.md
│   └── scripts/
│       └── generate.py
└── 周报聚合/
    ├── SKILL.md
    └── scripts/
        ├── fetch.py
        └── format.js
```

### 核心 API

```typescript
import {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  listSkillFiles,
  readSkillFile,
  writeSkillFile,
  deleteSkillFile,
  isSkillEnabled,
  setSkillEnabled,
  exportSkill,
  importSkill,
} from "./services/skills-manager";

// 列出所有 Skills
const skillIds = await listSkills();

// 获取 Skill 详情
const skill = await getSkill("日记整理");

// 创建新 Skill
await createSkill("新技能", {
  name: "新技能",
  description: "技能描述",
}, "# 指令内容");

// 添加脚本文件
await writeSkillFile("日记整理", "scripts/process.py", pythonCode);

// 启用/禁用
await setSkillEnabled("日记整理", false);

// 导入/导出
const json = await exportSkill("日记整理");
await importSkill("新技能", json);
```

## 迁移步骤

### 1. 更新导入

**旧代码**:
```typescript
import { loadSkillRegistry, getSkillTools } from "./services/skill-service";
import { setSkillPluginName } from "./services/skill-fs";
```

**新代码**:
```typescript
import {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
} from "./services/skills-manager";
```

### 2. 初始化

**旧代码**:
```typescript
setSkillPluginName(pluginName);
await loadSkillRegistry();
```

**新代码**:
```typescript
// 不需要初始化，直接使用 API
// SkillsManager 会自动处理插件名称
```

### 3. 获取 Skills

**旧代码**:
```typescript
const skills = skillStore.skills;
```

**新代码**:
```typescript
const skillIds = await listSkills();
for (const skillId of skillIds) {
  const skill = await getSkill(skillId);
  console.log(skill.metadata.name);
}
```

### 4. 创建 Skill

**旧代码**:
```typescript
const skill = await createSkill(name, description, instruction);
```

**新代码**:
```typescript
const success = await createSkill(skillId, {
  name,
  description,
}, instruction);
```

### 5. 管理脚本文件

**旧代码**:
```typescript
// 不支持脚本文件管理
```

**新代码**:
```typescript
// 添加脚本
await writeSkillFile(skillId, "scripts/process.py", pythonCode);

// 读取脚本
const code = await readSkillFile(skillId, "scripts/process.py");

// 列出文件
const files = await listSkillFiles(skillId);

// 删除文件
await deleteSkillFile(skillId, "scripts/process.py");
```

## 存储后端变化

### 旧系统
- 使用 `skill-fs.ts` 管理文件系统存储
- 使用 IndexedDB 存储 Skill 定义
- 路径: `skills/[skillId]/skills.md`

### 新系统
- 使用 Orca plugins API (`orca.plugins.setData/getData`)
- 存储键: `skills-fs:skills/[skillId]/SKILL.md`
- 启用状态: `skills:disabled:[skillId]`

## 类型变化

### 旧类型

```typescript
interface SkillDefinition {
  id: string;
  metadata: SkillMetadata;
  instruction: string;
  source: 'built-in' | 'user';
  createdAt: number;
  updatedAt: number;
}

interface LegacySkillDefinition {
  id: string;
  name: string;
  description?: string;
  inputs: SkillInput[];
  steps: SkillStep[];
  source: "built-in" | "user";
  folderName: string;
}
```

### 新类型

```typescript
interface SkillMetadata {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  [key: string]: any;
}

interface SkillFile {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
}

interface Skill {
  id: string;
  metadata: SkillMetadata;
  instruction: string;
  files: SkillFile[];
  enabled: boolean;
}
```

## 临时兼容性处理

### AI Tools 集成

在 `src/services/ai-tools.ts` 中，`getSkillTools()` 函数已被替换为临时实现：

```typescript
function getSkillTools(): OpenAITool[] {
  // TODO: 集成新的 SkillsManager 来获取 Skill 工具
  // 暂时返回空数组
  return [];
}
```

需要在后续实现中集成新的 SkillsManager 来获取 Skill 工具列表。

### Skill 显示名称

在 `src/utils/tool-display-config.ts` 和 `src/services/agentic-rag-service.ts` 中，已添加本地实现：

```typescript
function isSkillToolName(toolName: string): boolean {
  return toolName.startsWith("skill_");
}

function getSkillDisplayName(toolName: string): string {
  if (!isSkillToolName(toolName)) return toolName;
  const skillId = toolName.slice("skill_".length);
  return skillId;
}
```

## 下一步

1. **实现 Skill 工具集成** - 在 `ai-tools.ts` 中集成新的 SkillsManager
2. **创建 Skill 管理 UI** - 构建 Skill 编辑、创建、删除的界面
3. **实现脚本执行** - 支持 Python 和 JavaScript 脚本执行
4. **数据迁移** - 如果需要，创建迁移脚本将旧数据转换为新格式
5. **测试** - 编写单元测试和集成测试

## 参考资源

- 新的 SkillsManager 实现: `src/services/skills-manager.ts`
- 使用示例: `src/services/skills-manager.example.ts`
- 类型定义: `src/types/skills.ts`
- OpenSpec 变更提案: `openspec/changes/refactor-skills-storage-structure/`

## 问题排查

### 编译错误

如果遇到编译错误，检查：
1. 是否有其他文件仍在导入旧的 skill 模块
2. 是否正确更新了所有导入语句
3. 运行 `npm run build` 检查完整的编译错误

### 运行时错误

如果遇到运行时错误，检查：
1. Orca plugins API 是否可用
2. 插件名称是否正确设置
3. 存储键是否正确格式化

---

**迁移完成时间**: 2026-01-18
**状态**: 旧系统已完全移除，新系统已就位
