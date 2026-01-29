# Requirements Document

## Introduction

重构技能系统，完全参考 Codex Agent Skills 实现。Skills 是模块化能力系统，每个 Skill 打包指令、元数据和可选资源，系统在相关时自动使用。采用渐进式披露机制：元数据始终加载，指令触发时加载，资源按需加载。

## Glossary

- **Skill（技能）**: 模块化能力单元，包含指令、元数据和可选资源
- **SKILL.md**: 技能定义文件，YAML frontmatter（元数据）+ markdown（指令）
- **Frontmatter**: YAML 格式的元数据块，包含 name 和 description
- **渐进式披露**: 分层加载机制，减少上下文占用

## Requirements

### Requirement 1

**User Story:** As a user, I want skills stored as folders with SKILL.md files, so that skills are file-system based and easy to manage.

#### Acceptance Criteria

1. WHEN a skill is created THEN the system SHALL create a folder containing SKILL.md file with YAML frontmatter and markdown instruction body
2. WHEN loading skills THEN the system SHALL scan the skills directory for folders containing SKILL.md files
3. WHEN parsing SKILL.md THEN the system SHALL extract name and description from YAML frontmatter
4. WHEN saving a skill THEN the system SHALL serialize to SKILL.md format with frontmatter and instruction body

### Requirement 2

**User Story:** As a user, I want skills to have Codex-style metadata, so that Claude can discover and use skills appropriately.

#### Acceptance Criteria

1. WHEN defining a skill THEN the system SHALL require name (max 64 chars) and description (max 1024 chars) in frontmatter
2. WHEN a skill has no name THEN the system SHALL use folder name as default name
3. WHEN displaying skills THEN the system SHALL show name and description for discovery
4. WHEN skill metadata is loaded THEN the system SHALL include it in context for Claude to reference

### Requirement 3

**User Story:** As a user, I want skills to support progressive disclosure, so that context window is used efficiently.

#### Acceptance Criteria

1. WHEN skills are initialized THEN the system SHALL load only metadata (Level 1) into context
2. WHEN a skill is triggered THEN the system SHALL load the instruction body (Level 2) into context
3. WHEN a skill needs resources THEN the system SHALL load additional files (Level 3) on demand
4. WHEN calculating token cost THEN the system SHALL estimate ~100 tokens per skill for metadata only

### Requirement 4

**User Story:** As a user, I want to create and edit skills through a simple form, so that I can manage skills without editing raw files.

#### Acceptance Criteria

1. WHEN creating a skill THEN the system SHALL display a form with name, description, and instruction fields
2. WHEN editing a skill THEN the system SHALL populate the form with current SKILL.md content
3. WHEN saving a skill THEN the system SHALL validate name (max 64 chars) and description (max 1024 chars)
4. WHEN the form is submitted THEN the system SHALL generate valid SKILL.md content

### Requirement 5

**User Story:** As a user, I want to search and browse skills, so that I can find relevant skills quickly.

#### Acceptance Criteria

1. WHEN listing skills THEN the system SHALL display name and description for each skill
2. WHEN searching skills THEN the system SHALL match against name and description
3. WHEN a skill folder is invalid THEN the system SHALL skip it and continue loading other skills

