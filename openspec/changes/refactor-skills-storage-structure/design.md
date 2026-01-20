# Design Document: Skills Storage Refactoring

## Context

当前 Skills 系统使用 `skill-fs.ts` 提供的平面文件存储，仅支持单个 `skills.md` 文件。这限制了 Skills 的功能扩展，特别是对脚本文件、资源文件的支持。

新的设计需要：
1. 支持每个 Skill 一个文件夹
2. 支持元数据和指令分离
3. 支持脚本文件和其他资源
4. 保持简洁的 API 接口

## Goals

**Goals:**
- 提供灵活的 Skills 文件组织方式
- 支持脚本文件和资源管理
- 简化 Skills 的创建、编辑、删除操作
- 为未来的功能（脚本执行、资源管理）奠定基础
- 提供清晰的迁移路径

**Non-Goals:**
- 不实现脚本执行引擎（仅存储和管理）
- 不实现版本控制系统
- 不实现权限管理系统
- 不实现云同步功能

## Decisions

### 1. 文件夹结构设计

**决策**: 采用 `skills/[skillId]/` 结构，其中 `skillId` 是文件夹名称（中文名称）

**原因**:
- 文件夹名称作为 Skill ID，简化了路径管理
- 支持中文名称，更符合用户习惯
- 便于在文件系统中直观查看

**结构**:
```
skills/
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

### 2. 元数据格式

**决策**: 使用 YAML frontmatter + Markdown 内容

**原因**:
- YAML frontmatter 是标准的元数据格式
- 支持灵活的字段扩展
- 易于解析和生成
- 与 Markdown 兼容

**格式**:
```markdown
---
id: 日记整理
name: 日记整理
description: 自动整理和分类日记内容
version: 1.0.0
author: User
tags: [日记, 整理, AI]
---

你是一个日记整理助手。

## 功能
- 自动分类日记内容
- 提取关键信息
- 生成摘要
```

### 3. API 设计

**决策**: 提供对象式 API，而非函数式 API

**原因**:
- 更符合现代 TypeScript 风格
- 便于扩展和维护
- 提供更好的类型安全

**API 接口**:
```typescript
// 列表操作
listSkills(): Promise<string[]>
getSkill(skillId: string): Promise<Skill | null>

// 创建/更新/删除
createSkill(skillId, metadata, instruction): Promise<boolean>
updateSkill(skillId, metadata, instruction): Promise<boolean>
deleteSkill(skillId): Promise<boolean>

// 文件操作
listSkillFiles(skillId): Promise<SkillFile[]>
readSkillFile(skillId, filePath): Promise<string | null>
writeSkillFile(skillId, filePath, content): Promise<boolean>
deleteSkillFile(skillId, filePath): Promise<boolean>

// 启用/禁用
isSkillEnabled(skillId): Promise<boolean>
setSkillEnabled(skillId, enabled): Promise<boolean>

// 导入/导出
exportSkill(skillId): Promise<string | null>
importSkill(skillId, jsonContent): Promise<boolean>
```

### 4. 存储后端

**决策**: 使用 `orca.plugins.setData/getData` 存储，不使用文件系统

**原因**:
- 与 Orca 插件 API 一致
- 支持跨平台存储
- 便于备份和同步
- 避免文件系统权限问题

**存储键**:
- SKILL.md: `skills-fs:skills/[skillId]/SKILL.md`
- 脚本文件: `skills-fs:skills/[skillId]/scripts/[filename]`
- 启用状态: `skills:disabled:[skillId]`

### 5. 元数据解析

**决策**: 简单的正则表达式解析，不使用完整的 YAML 解析器

**原因**:
- 避免额外的依赖
- 支持常见的元数据字段
- 易于维护和扩展

**支持的字段**:
- `id`: Skill ID（自动设置）
- `name`: 显示名称
- `description`: 描述
- `version`: 版本号
- `author`: 作者
- `tags`: 标签数组
- 其他自定义字段

### 6. 迁移策略

**决策**: 提供迁移脚本，支持从旧格式到新格式的转换

**原因**:
- 保护现有数据
- 提供清晰的升级路径
- 支持回滚

**迁移步骤**:
1. 备份现有 Skills 数据
2. 读取旧格式的 `skills.md` 文件
3. 转换为新格式的 `SKILL.md`
4. 创建新的文件夹结构
5. 验证迁移结果

## Alternatives Considered

### 1. 使用 JSON 格式而非 YAML

**优点**: 更易于解析，无需正则表达式
**缺点**: 不如 YAML 易读，不符合 Markdown 习惯
**决策**: 使用 YAML，因为更符合 Markdown 生态

### 2. 使用数据库而非 Orca 插件 API

**优点**: 更强大的查询能力，更好的性能
**缺点**: 增加复杂性，依赖外部系统
**决策**: 使用 Orca 插件 API，保持简洁

### 3. 支持嵌套文件夹

**优点**: 更灵活的组织方式
**缺点**: 增加复杂性，难以管理
**决策**: 不支持嵌套，保持扁平结构

## Risks & Trade-offs

### 风险 1: 迁移数据丢失

**风险**: 迁移过程中可能丢失数据
**缓解**: 
- 创建完整的备份
- 提供回滚脚本
- 充分测试迁移逻辑

### 风险 2: 性能下降

**风险**: 新的 API 可能比旧的更慢
**缓解**:
- 使用缓存机制
- 优化文件读写操作
- 监控性能指标

### 风险 3: 向后兼容性

**风险**: 旧代码可能无法使用新 API
**缓解**:
- 提供适配器层
- 逐步迁移代码
- 保持旧 API 的兼容性（可选）

## Migration Plan

### Phase 1: 准备
1. 创建备份脚本
2. 创建测试数据集
3. 编写迁移脚本

### Phase 2: 迁移
1. 备份现有数据
2. 运行迁移脚本
3. 验证迁移结果

### Phase 3: 验证
1. 测试所有 Skills 功能
2. 检查数据完整性
3. 性能测试

### Phase 4: 部署
1. 更新代码
2. 部署到生产环境
3. 监控和支持

### Phase 5: 清理
1. 删除旧代码
2. 更新文档
3. 归档旧数据

## Open Questions

1. 是否需要支持 Skill 版本控制？
2. 是否需要支持 Skill 权限管理？
3. 是否需要支持 Skill 云同步？
4. 脚本文件的大小限制是多少？
5. 是否需要支持二进制文件（如图片）？
