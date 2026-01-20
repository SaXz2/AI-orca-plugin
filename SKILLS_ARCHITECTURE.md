# Skills 系统架构

## 📁 存储结构

```
Orca Plugin Data (orca.plugins API)
│
└── plugin-data/ai-chat/
    │
    ├── skills/                          # Skills 根目录
    │   │
    │   ├── 日记整理/                    # Skill 文件夹（ID = 文件夹名）
    │   │   ├── SKILL.md                 # 主指令文件（YAML frontmatter + Markdown）
    │   │   └── scripts/                 # 可选脚本文件夹
    │   │       ├── process.py           # Python 脚本
    │   │       └── utils.js             # JavaScript 脚本
    │   │
    │   ├── 知识卡片/
    │   │   ├── SKILL.md
    │   │   └── scripts/
    │   │       └── generate.py
    │   │
    │   └── 周报聚合/
    │       ├── SKILL.md
    │       └── scripts/
    │           ├── fetch.py
    │           └── format.js
    │
    └── [其他插件数据]
```

## 📋 SKILL.md 格式

```markdown
---
id: 日记整理
name: 日记整理
description: 自动整理和分类日记内容
version: 1.0.0
author: User
tags: [日记, 整理, AI]
---

# 日记整理

## 快速开始

调用 getRecentJournals 工具获取最近日记，然后生成结构化回顾。

## 功能特性

- **重点事件**：提取 3-5 条关键事件
- **完成事项**：列出已完成的任务
- **未完成/待办**：整理未完成的事项
- **明日关注**：建议明天需要关注的内容
```

## 🔌 API 层次结构

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
│  (SkillManagerModal, AiChatPanel, SkillConfirmDialog)       │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              SkillsManager Service                           │
│  (src/services/skills-manager.ts)                           │
│                                                              │
│  Public API:                                                │
│  - listSkills()                                             │
│  - getSkill(skillId)                                        │
│  - createSkill(skillId, metadata, instruction)             │
│  - updateSkill(skillId, metadata, instruction)             │
│  - deleteSkill(skillId)                                     │
│  - listSkillFiles(skillId)                                  │
│  - readSkillFile(skillId, filePath)                         │
│  - writeSkillFile(skillId, filePath, content)              │
│  - deleteSkillFile(skillId, filePath)                       │
│  - isSkillEnabled(skillId)                                  │
│  - setSkillEnabled(skillId, enabled)                        │
│  - exportSkill(skillId)                                     │
│  - importSkill(skillId, jsonContent)                        │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│           Orca Plugins API                                   │
│  (orca.plugins.readFile, writeFile, listFiles, etc.)       │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│        Plugin Data Storage                                   │
│  (plugin-data/ai-chat/skills/)                              │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 数据流

### 创建 Skill

```
User Input (SkillManagerModal)
    ↓
createSkill(skillId, metadata, instruction)
    ↓
buildSkillMetadataContent(metadata, instruction)
    ↓
orca.plugins.writeFile(pluginName, skillMdPath, content)
    ↓
Plugin Data Storage
```

### 读取 Skill

```
User Request (AiChatPanel)
    ↓
getSkill(skillId)
    ↓
orca.plugins.readFile(pluginName, skillMdPath)
    ↓
parseSkillMetadata(content)
    ↓
listSkillFiles(skillId)
    ↓
Return Skill Object
```

### 管理脚本文件

```
User Action (SkillManagerModal)
    ↓
writeSkillFile(skillId, "scripts/process.py", code)
    ↓
orca.plugins.writeFile(pluginName, fullPath, code)
    ↓
Plugin Data Storage
```

## 📦 类型系统

```typescript
// 元数据
interface SkillMetadata {
  id: string;           // Skill ID = 文件夹名称
  name: string;         // 显示名称
  description?: string; // 描述
  version?: string;     // 版本号
  author?: string;      // 作者
  tags?: string[];      // 标签
  [key: string]: any;   // 自定义字段
}

// 文件信息
interface SkillFile {
  path: string;         // 相对路径
  name: string;         // 文件名
  isDir: boolean;       // 是否目录
  size?: number;        // 文件大小
}

// 完整 Skill
interface Skill {
  id: string;           // Skill ID
  metadata: SkillMetadata;
  instruction: string;  // 指令内容
  files: SkillFile[];   // 文件列表
  enabled: boolean;     // 启用状态
}
```

## 🎯 核心特性

### 1. 文件夹结构
- **Skill ID** = 文件夹名称（支持中文）
- **必需**: `SKILL.md` 文件
- **可选**: `scripts/` 子文件夹

### 2. 元数据系统
- **格式**: YAML frontmatter
- **位置**: `SKILL.md` 文件头
- **字段**: name, description, version, author, tags, 自定义字段

### 3. 指令内容
- **格式**: Markdown
- **位置**: `SKILL.md` 文件体
- **用途**: AI 执行 Skill 时的指令

### 4. 脚本管理
- **位置**: `scripts/` 子文件夹
- **支持**: 任意脚本文件（.py, .js, .sh 等）
- **操作**: 读写、列表、删除

### 5. 启用/禁用
- **存储**: `skills:disabled:[skillId]` 键
- **操作**: 无需删除即可禁用
- **默认**: 启用

### 6. 导入/导出
- **格式**: JSON
- **内容**: metadata + instruction + enabled 状态
- **用途**: 备份和分享

## 🔐 存储键规则

```
SKILL.md 文件:
  skills-fs:skills/[skillId]/SKILL.md

脚本文件:
  skills-fs:skills/[skillId]/scripts/[filename]

启用状态:
  skills:disabled:[skillId]
```

## 🚀 使用流程

### 创建 Skill

```typescript
await createSkill("日记整理", {
  name: "日记整理",
  description: "自动整理日记",
  version: "1.0.0",
}, "# 指令内容");
```

### 添加脚本

```typescript
await writeSkillFile("日记整理", "scripts/process.py", pythonCode);
```

### 获取 Skill

```typescript
const skill = await getSkill("日记整理");
console.log(skill.metadata.name);      // "日记整理"
console.log(skill.instruction);        // "# 指令内容"
console.log(skill.files);              // [{ path: "scripts/process.py", ... }]
console.log(skill.enabled);            // true
```

### 更新 Skill

```typescript
await updateSkill("日记整理", {
  description: "改进的日记整理",
}, "# 新指令内容");
```

### 删除 Skill

```typescript
await deleteSkill("日记整理");
```

### 导入/导出

```typescript
// 导出
const json = await exportSkill("日记整理");

// 导入
await importSkill("日记整理_备份", json);
```

## 📊 对比：旧系统 vs 新系统

| 特性 | 旧系统 | 新系统 |
|------|--------|--------|
| **存储后端** | 文件系统 + IndexedDB | Orca plugins API |
| **文件夹结构** | 单个 skills.md | 每个 Skill 一个文件夹 |
| **脚本支持** | ❌ 不支持 | ✅ 支持 |
| **元数据格式** | YAML frontmatter | YAML frontmatter |
| **启用/禁用** | ❌ 不支持 | ✅ 支持 |
| **导入/导出** | Markdown/ZIP | JSON |
| **API 风格** | 同步 + 状态管理 | 异步函数 |
| **类型系统** | SkillDefinition | Skill |

## 🔗 相关文件

- **核心实现**: `src/services/skills-manager.ts`
- **类型定义**: `src/types/skills.ts`
- **使用示例**: `src/services/skills-manager.example.ts`
- **React 组件**: `src/views/SkillManagerModal.tsx`
- **OpenSpec 提案**: `openspec/changes/refactor-skills-storage-structure/`

## 📝 总结

新的 Skills 系统采用**简洁、灵活、可扩展**的架构：

1. **简洁**: 单一的 SkillsManager API，无需复杂的状态管理
2. **灵活**: 支持任意脚本文件和自定义元数据字段
3. **可扩展**: 为脚本执行、版本控制等功能奠定基础

所有操作都是**异步的**，通过 **Orca plugins API** 与存储交互，确保与 Orca Note 的深度集成。
