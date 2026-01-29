# Design Document

## Overview

重构技能系统，采用 Codex Agent Skills 架构设计：
1. **渐进式披露架构**: 三层加载机制（元数据/指令/资源）
2. **SKILL.md 格式**: YAML frontmatter + markdown 指令
3. **浏览器缓存存储**: 使用 IndexedDB/localStorage 存储技能数据
4. **上下文工程**: 最小化 token 消耗，按需加载

## Architecture

### 三层渐进加载架构

```
+-------------------------+
|   Level 1: Metadata     |  ← 启动时加载：~100 tokens/skill
+-------------------------+
|   Level 2: Instructions |  ← 请求匹配时加载：<5k tokens
+-------------------------+
|   Level 3: Resources    |  ← 执行时按需加载：实际无限
+-------------------------+
```

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Skill System                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ SkillStore  │  │SkillService │  │ SkillManagerModal   │ │
│  │  (State)    │◄─┤  (Logic)    │◄─┤      (UI)           │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────┘ │
│                          │                                  │
│                   ┌──────▼──────┐                          │
│                   │ SkillStorage│                          │
│                   │ (IndexedDB) │                          │
│                   └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### SkillMetadata (Type) - Level 1

```typescript
interface SkillMetadata {
  name: string;           // 技能名称，max 64 chars
  description: string;    // 技能描述，max 1024 chars
                          // 格式: [功能描述]. Use when [触发场景] or when the user mentions [关键词].
}
```

### SkillDefinition (Type)

```typescript
interface SkillDefinition {
  id: string;              // 唯一标识
  metadata: SkillMetadata; // 元数据（Level 1，启动时加载）
  instruction: string;     // 指令内容（Level 2）
  source: 'built-in' | 'user';
  createdAt: number;       // 创建时间戳
  updatedAt: number;       // 更新时间戳
}
```

### SkillStore (State)

```typescript
interface SkillStore {
  skills: SkillDefinition[];
  loading: boolean;
  error?: string;
}
```

### SkillStorage (IndexedDB)

```typescript
// 数据库结构
const DB_NAME = 'skill-store';
const STORE_NAME = 'skills';

// 存储操作
function saveSkill(skill: SkillDefinition): Promise<void>;
function getSkill(id: string): Promise<SkillDefinition | null>;
function getAllSkills(): Promise<SkillDefinition[]>;
function deleteSkill(id: string): Promise<void>;
```

### SkillService (Functions)

```typescript
// 解析 SKILL.md 格式
function parseSkillMd(content: string): { metadata: SkillMetadata; instruction: string };

// 序列化为 SKILL.md 格式
function serializeSkillMd(metadata: SkillMetadata, instruction: string): string;

// 加载所有技能
function loadSkillRegistry(): Promise<void>;

// CRUD 操作
function createSkill(name: string, description: string, instruction: string): Promise<void>;
function updateSkill(id: string, metadata: SkillMetadata, instruction: string): Promise<void>;
function deleteSkill(id: string): Promise<void>;

// 搜索
function searchSkills(query: string): SkillDefinition[];

// 验证
function validateMetadata(metadata: SkillMetadata): { valid: boolean; error?: string };

// 导入导出
function exportSkill(skill: SkillDefinition): string;  // 导出为 SKILL.md 格式
function importSkill(content: string): Promise<void>;  // 从 SKILL.md 导入
```

## Data Models

### SKILL.md 文件格式

```markdown
---
name: Email Classifier
description: Classify and route customer support emails by topic, urgency, and sentiment. Use when processing customer emails, support tickets, or when the user mentions email classification, routing, or customer support automation.
---

# Email Classifier

## 快速开始

[最简单的用例]

## 功能特性

- **主题分类**：技术、账单、销售、其他
- **紧急度评估**：低、中、高、紧急

## 使用场景

[具体示例]

## 限制

- 邮件长度：最大 50,000 字符
```

### IndexedDB 存储结构

```typescript
// 存储的数据结构
interface StoredSkill {
  id: string;
  name: string;
  description: string;
  instruction: string;
  source: 'built-in' | 'user';
  createdAt: number;
  updatedAt: number;
}
```

### Description 编写规范

格式模板：
```
[功能描述]. Use when [触发场景] or when the user mentions [关键词].
```

✅ 好的描述：
```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

❌ 不好的描述：
```
Handles PDF files.
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SKILL.md Round-Trip Consistency

*For any* valid SkillMetadata and instruction string, serializing to SKILL.md format and then parsing back should produce equivalent metadata and instruction.

**Validates: Requirements 1.3, 1.4**

### Property 2: Metadata Validation Correctness

*For any* string pair (name, description), validation should accept if and only if name.length <= 64 and description.length <= 1024.

**Validates: Requirements 2.1**

### Property 3: Skill Storage Persistence

*For any* valid SkillDefinition, saving to IndexedDB and then loading back should produce an equivalent skill.

**Validates: Requirements 1.1, 1.2**

### Property 4: Search Result Relevance

*For any* search query and skill list, all returned skills should have the query substring in either name or description.

**Validates: Requirements 5.2**

## Error Handling

| Error Type | Condition | Handling |
|------------|-----------|----------|
| INVALID_SKILL_MD | SKILL.md 格式错误 | 返回解析错误 |
| NAME_TOO_LONG | name > 64 chars | 返回验证错误 |
| DESC_TOO_LONG | description > 1024 chars | 返回验证错误 |
| STORAGE_ERROR | IndexedDB 操作失败 | 返回存储错误 |
| PARSE_ERROR | YAML 解析失败 | 返回解析错误 |

## Testing Strategy

### Unit Tests

- 测试 `parseSkillMd` 解析各种格式的 SKILL.md
- 测试 `serializeSkillMd` 生成正确格式
- 测试 `validateMetadata` 边界条件
- 测试 `searchSkills` 匹配逻辑

### Property-Based Tests

使用 fast-check 库进行属性测试：

1. **Round-Trip Property**: 生成随机 metadata 和 instruction，验证序列化后解析回来等价
2. **Validation Property**: 生成随机长度字符串，验证验证逻辑正确
3. **Storage Property**: 生成随机技能，验证存储后读取等价
4. **Search Property**: 生成随机技能列表和查询，验证搜索结果正确

每个属性测试运行至少 100 次迭代。测试标注格式：
```typescript
// **Feature: skill-refactor-codex-style, Property 1: SKILL.md Round-Trip Consistency**
```

