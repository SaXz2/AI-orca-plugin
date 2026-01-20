# Skills 系统改进建议

## 当前状态分析

Skills 系统已经有了良好的基础架构：
- ✅ 统一的 SkillsManager API
- ✅ 灵活的文件夹结构（支持脚本）
- ✅ YAML frontmatter 元数据
- ✅ 启用/禁用功能
- ✅ 导入/导出功能

但还有以下改进空间：

---

## 🎯 改进方向

### 1. **AI 工具集成** (优先级: 高)

**当前状态**: `getSkillTools()` 返回空数组，Skills 还未真正集成到 AI 工具系统

**改进方案**:
```typescript
// 动态生成 Skill 工具
function getSkillTools(): OpenAITool[] {
  const skills = await listSkills();
  return skills.map(skillId => ({
    type: "function",
    function: {
      name: `skill_${skillId}`,
      description: skill.metadata.description || "Execute skill",
      parameters: {
        type: "object",
        properties: {
          input: { type: "string", description: "Skill input" }
        }
      }
    }
  }));
}
```

**好处**:
- AI Chat 插件可以自动发现和使用 Skills
- 用户创建的 Skill 立即可用于对话
- 支持 Skill 链式调用

---

### 2. **Skill 执行引擎** (优先级: 高)

**当前状态**: Skills 有指令但没有执行机制

**改进方案**:
```typescript
// 执行 Skill 的通用引擎
export async function executeSkill(
  skillId: string,
  input: string,
  context?: Record<string, any>
): Promise<string> {
  const skill = await getSkill(skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);
  
  // 1. 准备上下文
  const skillContext = {
    skillName: skill.metadata.name,
    skillDescription: skill.metadata.description,
    input,
    ...context
  };
  
  // 2. 检查是否有脚本
  const scripts = skill.files.filter(f => f.path.startsWith("scripts/"));
  
  // 3. 如果有脚本，执行脚本
  if (scripts.length > 0) {
    return await executeSkillScripts(skillId, scripts, skillContext);
  }
  
  // 4. 否则，返回指令供 AI Chat 使用
  return skill.instruction;
}
```

**好处**:
- 支持脚本执行（Python、JavaScript 等）
- 支持纯指令型 Skill
- AI Chat 可以调用 Skill 获取结果或指令

---

### 3. **Skill 模板库** (优先级: 中)

**当前状态**: 用户从零开始创建 Skill

**改进方案**:
```typescript
// 预定义的 Skill 模板
const SKILL_TEMPLATES = {
  "text-processing": {
    name: "文本处理",
    description: "处理和转换文本内容",
    instruction: "# 文本处理\n\n## 功能\n- 分词\n- 去重\n- 格式化",
    scripts: {
      "process.py": "# Python 脚本模板"
    }
  },
  "data-analysis": {
    name: "数据分析",
    description: "分析和可视化数据",
    instruction: "# 数据分析\n\n## 功能\n- 统计\n- 聚合\n- 图表",
    scripts: {
      "analyze.py": "# Python 分析脚本"
    }
  }
};

export async function createSkillFromTemplate(
  templateId: string,
  skillName: string
): Promise<boolean> {
  const template = SKILL_TEMPLATES[templateId];
  if (!template) return false;
  
  const success = await createSkill(skillName, {
    name: skillName,
    description: template.description,
  }, template.instruction);
  
  if (success && template.scripts) {
    for (const [filename, content] of Object.entries(template.scripts)) {
      await writeSkillFile(skillName, `scripts/${filename}`, content);
    }
  }
  
  return success;
}
```

**好处**:
- 降低创建 Skill 的门槛
- 提供最佳实践示例
- 加快用户上手速度

---

### 4. **Skill 版本控制** (优先级: 中)

**当前状态**: 只有单一版本，无法追踪历史

**改进方案**:
```typescript
// 添加版本历史
interface SkillVersion {
  version: string;
  timestamp: number;
  author?: string;
  changes?: string;
  metadata: SkillMetadata;
  instruction: string;
}

export async function createSkillVersion(
  skillId: string,
  changes?: string
): Promise<boolean> {
  const skill = await getSkill(skillId);
  if (!skill) return false;
  
  const version = new Date().toISOString();
  const versionData: SkillVersion = {
    version,
    timestamp: Date.now(),
    changes,
    metadata: skill.metadata,
    instruction: skill.instruction
  };
  
  const versionPath = `versions/${version}.json`;
  return await writeSkillFile(skillId, versionPath, JSON.stringify(versionData, null, 2));
}

export async function getSkillVersions(skillId: string): Promise<SkillVersion[]> {
  const files = await listSkillFiles(skillId);
  const versionFiles = files.filter(f => f.path.startsWith("versions/"));
  
  const versions: SkillVersion[] = [];
  for (const file of versionFiles) {
    const content = await readSkillFile(skillId, file.path);
    if (content) {
      versions.push(JSON.parse(content));
    }
  }
  
  return versions.sort((a, b) => b.timestamp - a.timestamp);
}
```

**好处**:
- 追踪 Skill 的演变过程
- 支持回滚到之前的版本
- 便于协作和审计

---

### 5. **Skill 依赖管理** (优先级: 低)

**当前状态**: Skills 是独立的，无法相互调用

**改进方案**:
```typescript
// 在元数据中添加依赖
interface SkillMetadata {
  // ... 现有字段
  dependencies?: string[];  // 依赖的其他 Skill ID
  requiredTools?: string[]; // 需要的工具
}

export async function getSkillWithDependencies(
  skillId: string,
  resolved = new Set<string>()
): Promise<Skill[]> {
  if (resolved.has(skillId)) return [];
  resolved.add(skillId);
  
  const skill = await getSkill(skillId);
  if (!skill) return [];
  
  const result = [skill];
  
  if (skill.metadata.dependencies) {
    for (const depId of skill.metadata.dependencies) {
      const deps = await getSkillWithDependencies(depId, resolved);
      result.push(...deps);
    }
  }
  
  return result;
}
```

**好处**:
- 支持 Skill 组合
- 减少代码重复
- 构建 Skill 生态

---

### 6. **Skill 搜索和发现** (优先级: 中)

**当前状态**: 只有简单的名称搜索

**改进方案**:
```typescript
interface SkillSearchOptions {
  query?: string;
  tags?: string[];
  author?: string;
  enabled?: boolean;
}

export async function searchSkills(options: SkillSearchOptions): Promise<Skill[]> {
  const skillIds = await listSkills();
  const results: Skill[] = [];
  
  for (const skillId of skillIds) {
    const skill = await getSkill(skillId);
    if (!skill) continue;
    
    // 按查询字符串匹配
    if (options.query) {
      const query = options.query.toLowerCase();
      const matches = 
        skill.metadata.name.toLowerCase().includes(query) ||
        skill.metadata.description?.toLowerCase().includes(query) ||
        skill.instruction.toLowerCase().includes(query);
      if (!matches) continue;
    }
    
    // 按标签过滤
    if (options.tags?.length) {
      const hasAllTags = options.tags.every(tag => 
        skill.metadata.tags?.includes(tag)
      );
      if (!hasAllTags) continue;
    }
    
    // 按作者过滤
    if (options.author && skill.metadata.author !== options.author) {
      continue;
    }
    
    // 按启用状态过滤
    if (options.enabled !== undefined && skill.enabled !== options.enabled) {
      continue;
    }
    
    results.push(skill);
  }
  
  return results;
}
```

**好处**:
- 快速找到相关 Skill
- 支持多维度过滤
- 改善用户体验

---

### 7. **Skill 性能优化** (优先级: 低)

**当前状态**: 每次都读取完整的 Skill 数据

**改进方案**:
```typescript
// 添加缓存层
const skillCache = new Map<string, { skill: Skill; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export async function getSkillCached(skillId: string): Promise<Skill | null> {
  const cached = skillCache.get(skillId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.skill;
  }
  
  const skill = await getSkill(skillId);
  if (skill) {
    skillCache.set(skillId, { skill, timestamp: Date.now() });
  }
  
  return skill;
}

export function clearSkillCache(skillId?: string) {
  if (skillId) {
    skillCache.delete(skillId);
  } else {
    skillCache.clear();
  }
}

// 在创建/更新/删除时清除缓存
export async function createSkill(...args) {
  const result = await createSkill(...args);
  if (result) clearSkillCache();
  return result;
}
```

**好处**:
- 减少文件系统访问
- 提升响应速度
- 降低 API 调用

---

### 8. **Skill 权限和共享** (优先级: 低)

**当前状态**: 所有 Skills 都是私有的

**改进方案**:
```typescript
interface SkillPermissions {
  owner: string;
  public: boolean;
  shared?: string[];  // 共享给的用户
  readOnly?: boolean;
}

export async function shareSkill(
  skillId: string,
  userIds: string[]
): Promise<boolean> {
  const permKey = `skills:perms:${skillId}`;
  const perms: SkillPermissions = {
    owner: getCurrentUser(),
    public: false,
    shared: userIds
  };
  
  return await orca.plugins.setData("ai-chat", permKey, JSON.stringify(perms));
}
```

**好处**:
- 支持 Skill 共享
- 团队协作
- 社区生态

---

## 📊 改进优先级矩阵

| 改进 | 优先级 | 工作量 | 影响 | 建议 |
|------|--------|--------|------|------|
| AI 工具集成 | 🔴 高 | 中 | 高 | **立即实施** |
| Skill 执行引擎 | 🔴 高 | 中 | 高 | **立即实施** |
| Skill 模板库 | 🟡 中 | 小 | 中 | **下一步** |
| 版本控制 | 🟡 中 | 中 | 中 | **后续** |
| 搜索和发现 | 🟡 中 | 小 | 中 | **后续** |
| 依赖管理 | 🟢 低 | 大 | 低 | **可选** |
| 性能优化 | 🟢 低 | 小 | 低 | **可选** |
| 权限共享 | 🟢 低 | 大 | 低 | **可选** |

---

## 🚀 建议实施路线

### Phase 1: 核心功能 (1-2 周)
1. **AI 工具集成** - 让 AI Chat 插件能发现和使用 Skills
2. **Skill 执行引擎** - 支持脚本执行和指令返回

### Phase 2: 用户体验 (1 周)
3. **Skill 模板库** - 降低创建门槛
4. **搜索和发现** - 改善查找体验

### Phase 3: 高级功能 (可选)
5. **版本控制** - 追踪历史
6. **依赖管理** - 支持组合
7. **性能优化** - 缓存加速
8. **权限共享** - 团队协作

---

## 💡 快速赢

如果只有有限的时间，建议优先实施：

1. **AI 工具集成** (1-2 天)
   - 让 Skills 真正可用
   - 最高的投入产出比

2. **Skill 模板库** (1 天)
   - 提供 3-5 个常用模板
   - 大幅降低使用门槛

3. **搜索功能** (半天)
   - 改善 UI 中的搜索
   - 快速提升体验

---

## 📝 总结

Skills 系统已有良好基础，主要改进方向是：
- **集成**: 与 AI 工具系统深度集成
- **执行**: 支持脚本执行和自动化
- **易用**: 提供模板和搜索
- **扩展**: 版本控制、依赖管理等高级功能

建议从 **AI 工具集成** 和 **Skill 执行引擎** 开始，这两个功能会让 Skills 系统真正发挥作用。
