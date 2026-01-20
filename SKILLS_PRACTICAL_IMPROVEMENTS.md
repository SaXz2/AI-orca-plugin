# AI Chat 插件中 Skills 的实际改进建议

## 📊 当前状态分析

### 已实现的功能
✅ **Skill 管理**
- 创建、编辑、删除 Skills
- 导入/导出 Skills
- 启用/禁用 Skills
- 搜索和过滤

✅ **Skill 预检系统**
- 用户输入时自动检测相关 Skills
- 显示匹配的 Skills 列表
- 建议使用特定 Skill
- 用户可以选择是否使用

✅ **Skill 存储**
- 基于 Orca plugins API
- 支持 YAML frontmatter 元数据
- 支持脚本文件夹

### 缺失的功能
❌ **Skill 执行**
- 没有实际执行 Skill 的机制
- 用户选择 Skill 后没有后续动作

❌ **Skill 工具集成**
- `getSkillTools()` 返回空数组
- Skills 不能作为 AI 工具被调用

❌ **Skill 内容使用**
- Skill 的 `instruction` 字段没有被使用
- 用户创建的 Skill 指令无法被 AI 利用

---

## 🎯 核心改进方向

### 1. **Skill 执行和集成** (优先级: 🔴 最高)

**问题**: 用户创建了 Skill，但 AI Chat 无法使用它们

**当前流程**:
```
用户输入 → 预检检测 → 显示建议 → 用户选择 → ??? (没有后续)
```

**改进方案**:

#### 方案 A: 将 Skill 作为系统提示词
```typescript
// 在发送消息给 AI 时，将相关 Skill 的指令注入到系统提示词中
async function buildSystemPromptWithSkills(
  baseSystemPrompt: string,
  userMessage: string
): Promise<string> {
  // 1. 运行 Skill 预检
  const summary = await runSkillPrecheck({
    text: userMessage,
    skills: await loadAllSkills(),
    // ...
  });
  
  if (!summary?.matches.length) {
    return baseSystemPrompt;
  }
  
  // 2. 获取匹配的 Skill 指令
  const skillInstructions = await Promise.all(
    summary.matches.map(async (match) => {
      const skill = await getSkill(match.skillId);
      return skill?.instruction || "";
    })
  );
  
  // 3. 注入到系统提示词
  const skillSection = `
## 可用的技能

${summary.matches.map((match, i) => `
### ${match.skillName}
${skillInstructions[i]}
`).join("\n")}

根据用户请求，如果适合使用上述技能，请按照技能的指令执行。
`;
  
  return baseSystemPrompt + "\n" + skillSection;
}
```

**优点**:
- 简单直接
- 充分利用 Skill 的指令内容
- AI 可以灵活决定是否使用 Skill

**缺点**:
- 增加 token 消耗
- 需要管理 Skill 指令的长度

---

#### 方案 B: 将 Skill 作为工具函数
```typescript
// 将 Skill 转换为 OpenAI 工具格式
function convertSkillToTool(skill: Skill): OpenAITool {
  return {
    type: "function",
    function: {
      name: `skill_${skill.id}`,
      description: skill.metadata.description || skill.metadata.name,
      parameters: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "Skill 的输入内容"
          }
        },
        required: ["input"]
      }
    }
  };
}

// 在 getSkillTools() 中实现
function getSkillTools(): OpenAITool[] {
  const skills = await listSkills();
  return skills
    .filter(skillId => isSkillEnabled(skillId))
    .map(skillId => {
      const skill = await getSkill(skillId);
      return skill ? convertSkillToTool(skill) : null;
    })
    .filter(Boolean);
}

// 处理 Skill 工具调用
async function executeSkillTool(skillId: string, input: string): Promise<string> {
  const skill = await getSkill(skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);
  
  // 返回 Skill 的指令供 AI 使用
  return `
# ${skill.metadata.name}

${skill.instruction}

---

用户输入: ${input}

请根据上述指令处理用户输入。
`;
}
```

**优点**:
- 符合 OpenAI 工具调用规范
- AI 可以明确选择使用哪个 Skill
- 支持多个 Skill 的链式调用

**缺点**:
- 需要修改工具调用处理逻辑
- 增加复杂度

---

### 2. **Skill 预检的改进** (优先级: 🟡 高)

**当前问题**:
- 预检结果只是显示建议，用户需要手动选择
- 没有自动执行的选项
- 预检本身消耗 token

**改进方案**:

```typescript
// 添加预检配置
interface SkillPrecheckConfig {
  enabled: boolean;
  autoExecute: boolean;        // 自动执行建议的 Skill
  confirmBeforeExecute: boolean; // 执行前确认
  maxSkillsToShow: number;      // 最多显示多少个建议
  confidenceThreshold: number;  // 置信度阈值（0-1）
}

// 改进的预检流程
async function runSkillPrecheckWithConfig(
  text: string,
  config: SkillPrecheckConfig
): Promise<SkillPrecheckSummary | null> {
  if (!config.enabled) return null;
  
  const summary = await runSkillPrecheck({ text, /* ... */ });
  if (!summary?.suggestedSkillId) return null;
  
  // 如果启用自动执行
  if (config.autoExecute && summary.suggestedSkillId) {
    if (config.confirmBeforeExecute) {
      // 显示确认对话框
      const confirmed = await requestSkillPrecheckConfirm(summary);
      if (!confirmed) return summary;
    }
    
    // 自动执行 Skill
    await executeSkillAndInjectResult(summary.suggestedSkillId, text);
  }
  
  return summary;
}
```

**改进点**:
- 用户可以配置预检行为
- 支持自动执行常用 Skill
- 减少用户交互

---

### 3. **Skill 指令优化** (优先级: 🟡 中)

**当前问题**:
- Skill 指令格式没有标准化
- 没有指导用户如何编写有效的指令
- 指令可能过长或不清晰

**改进方案**:

```typescript
// 定义 Skill 指令的标准格式
interface SkillInstructionTemplate {
  overview: string;        // 简短概述
  inputFormat: string;     // 输入格式说明
  outputFormat: string;    // 输出格式说明
  examples: Array<{
    input: string;
    output: string;
  }>;
  constraints?: string;    // 限制条件
  bestPractices?: string[]; // 最佳实践
}

// 在创建 Skill 时提供模板
const SKILL_INSTRUCTION_TEMPLATE = `# {skillName}

## 概述
{overview}

## 输入格式
{inputFormat}

## 输出格式
{outputFormat}

## 示例

### 示例 1
**输入**: {example1Input}
**输出**: {example1Output}

### 示例 2
**输入**: {example2Input}
**输出**: {example2Output}

## 最佳实践
- {practice1}
- {practice2}

## 限制
{constraints}
`;

// 在 SkillManagerModal 中提供模板选择
function renderCreateModal() {
  return (
    <div>
      <select onChange={(e) => {
        if (e.target.value === "template") {
          setCreateForm(prev => ({
            ...prev,
            instruction: SKILL_INSTRUCTION_TEMPLATE
          }));
        }
      }}>
        <option value="">从头开始</option>
        <option value="template">使用模板</option>
      </select>
    </div>
  );
}
```

**改进点**:
- 标准化 Skill 指令格式
- 提供模板降低创建难度
- 提高指令质量

---

### 4. **Skill 使用统计** (优先级: 🟢 低)

**改进方案**:

```typescript
// 追踪 Skill 使用情况
interface SkillUsageStats {
  skillId: string;
  usageCount: number;
  lastUsed: number;
  successCount: number;
  failureCount: number;
  averageTokens: number;
}

export async function recordSkillUsage(
  skillId: string,
  success: boolean,
  tokensUsed: number
): Promise<void> {
  const statsKey = `skills:stats:${skillId}`;
  const stats = await orca.plugins.getData("ai-chat", statsKey);
  
  const current: SkillUsageStats = stats ? JSON.parse(stats) : {
    skillId,
    usageCount: 0,
    lastUsed: 0,
    successCount: 0,
    failureCount: 0,
    averageTokens: 0
  };
  
  current.usageCount++;
  current.lastUsed = Date.now();
  if (success) current.successCount++;
  else current.failureCount++;
  current.averageTokens = (current.averageTokens * (current.usageCount - 1) + tokensUsed) / current.usageCount;
  
  await orca.plugins.setData("ai-chat", statsKey, JSON.stringify(current));
}

// 在 Skill Manager 中显示统计
async function renderSkillStats(skillId: string) {
  const stats = await getSkillUsageStats(skillId);
  return (
    <div>
      <p>使用次数: {stats.usageCount}</p>
      <p>成功率: {((stats.successCount / stats.usageCount) * 100).toFixed(1)}%</p>
      <p>平均 Token: {stats.averageTokens.toFixed(0)}</p>
      <p>最后使用: {new Date(stats.lastUsed).toLocaleString()}</p>
    </div>
  );
}
```

**改进点**:
- 了解哪些 Skill 最常用
- 识别有问题的 Skill
- 优化 Skill 设计

---

### 5. **Skill 快捷方式** (优先级: 🟢 低)

**改进方案**:

```typescript
// 为常用 Skill 添加快捷方式
interface SkillShortcut {
  skillId: string;
  hotkey?: string;        // 快捷键
  pinned: boolean;        // 是否固定在顶部
  customName?: string;    // 自定义名称
}

// 在 AI Chat Panel 中显示快捷方式
function renderSkillShortcuts() {
  const shortcuts = getSkillShortcuts();
  return (
    <div className="skill-shortcuts">
      {shortcuts.map(shortcut => (
        <button
          key={shortcut.skillId}
          onClick={() => executeSkill(shortcut.skillId)}
          title={shortcut.hotkey}
        >
          {shortcut.customName || getSkillName(shortcut.skillId)}
        </button>
      ))}
    </div>
  );
}
```

**改进点**:
- 快速访问常用 Skill
- 提高工作效率

---

## 📋 改进优先级和工作量

| 改进 | 优先级 | 工作量 | 影响 | 建议 |
|------|--------|--------|------|------|
| Skill 执行集成 | 🔴 最高 | 中 | 最高 | **立即实施** |
| 预检改进 | 🟡 高 | 小 | 高 | **立即实施** |
| 指令优化 | 🟡 中 | 小 | 中 | **下一步** |
| 使用统计 | 🟢 低 | 小 | 低 | **可选** |
| 快捷方式 | 🟢 低 | 小 | 低 | **可选** |

---

## 🚀 建议实施顺序

### 第一阶段: 核心功能 (1-2 天)
1. **实施 Skill 执行集成** (方案 A 或 B)
   - 让 AI 能实际使用 Skill 指令
   - 这是最关键的改进

2. **改进预检流程**
   - 添加自动执行选项
   - 改进用户体验

### 第二阶段: 用户体验 (1 天)
3. **优化 Skill 指令**
   - 提供模板
   - 改进创建流程

### 第三阶段: 高级功能 (可选)
4. **添加使用统计**
5. **添加快捷方式**

---

## 💡 快速赢 (最小可行改进)

如果只有 1-2 小时，建议：

1. **实施方案 A** (将 Skill 注入系统提示词)
   - 修改 `buildSystemPromptWithSkills()` 函数
   - 在发送消息时调用
   - 工作量: 30 分钟

2. **改进预检显示**
   - 当用户选择 Skill 时，自动注入到对话
   - 工作量: 30 分钟

这样用户创建的 Skill 就能被 AI 实际使用了。

---

## 📝 总结

当前 Skills 系统的主要问题是：
- ✅ 管理功能完整
- ✅ 预检系统完整
- ❌ **执行机制缺失** ← 这是关键问题

建议优先实施 **Skill 执行集成**，让用户创建的 Skill 能被 AI 实际使用。这会大幅提升 Skills 系统的价值。
