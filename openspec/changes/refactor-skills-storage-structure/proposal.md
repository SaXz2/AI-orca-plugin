# Change: Refactor Skills Storage Structure

## Why

当前 Skills 存储方式使用平面的 `skills.md` 文件，不支持脚本文件和复杂的 Skill 组织。新的结构需要支持：

1. **每个 Skill 一个文件夹** - 便于组织和管理
2. **SKILL.md 主指令文件** - 包含元数据和指令
3. **scripts/ 子文件夹** - 支持 Python、JavaScript 等脚本
4. **灵活的文件组织** - 支持任意脚本文件和资源

这个改进使 Skills 系统更加模块化、可扩展，并为未来的功能（如脚本执行、资源管理）奠定基础。

## What Changes

- **新增** `SkillsManager` 服务 - 统一的 Skills 管理 API
- **新增** 文件夹结构支持 - `skills/[skillId]/SKILL.md` 和 `skills/[skillId]/scripts/`
- **新增** 元数据系统 - SKILL.md 中的 frontmatter 支持
- **新增** 脚本文件管理 - 读写、列表、删除脚本文件
- **新增** 启用/禁用机制 - 通过 `orca.plugins.setData` 存储状态
- **新增** 导入/导出功能 - JSON 格式的 Skill 备份和恢复
- **BREAKING** 旧的 `skill-fs.ts` 平面存储方式将被弃用

## Impact

- **Affected specs**: Skills Management System
- **Affected code**: 
  - `src/services/skill-fs.ts` (旧实现，需要迁移)
  - `src/services/skills-manager.ts` (新实现)
  - 所有使用 Skills 的组件和服务需要更新

- **Migration path**: 
  - 创建迁移脚本将旧格式转换为新格式
  - 保持向后兼容性（可选）
  - 提供导入/导出工具

- **Breaking changes**:
  - Skills 存储路径从 `skills/[skillId]/skills.md` 变为 `skills/[skillId]/SKILL.md`
  - API 从 `skill-fs.ts` 的函数式接口变为 `SkillsManager` 的对象式接口
  - 元数据格式从纯文本变为 YAML frontmatter

## Timeline

- **Phase 1**: 实现 `SkillsManager` 服务
- **Phase 2**: 创建迁移脚本和工具
- **Phase 3**: 更新所有使用 Skills 的代码
- **Phase 4**: 测试和验证
- **Phase 5**: 部署和文档更新
