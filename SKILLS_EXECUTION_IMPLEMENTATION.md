# Skills 执行功能实现方案

## 🔴 当前问题

在 `src/views/AiChatPanel.tsx` 第 2326 行：

```typescript
if (isSkillCall) {
  // Skill execution is not supported in the new system
  result = `Error: Skill execution is not supported in the current version. Please use the Skill Manager to manage skills.`;
}
```

**Skills 虽然能创建和管理，但无法真正执行！**

---

## 🎯 改进方案

### 方案：将 Skill 指令注入到 AI 响应中

这是最简单且最有效的方案。当 AI 调用 Skill 工具时，返回 Skill 的指令内容，让 AI 根据指令执行。

#### 实现步骤

**第 1 步**: 修改 Skill 工具调用处理

```typescript
if (isSkillCall) {
  // 提取 Skill ID
  const skillId = toolName.replace("skill_", "");
  
  try {
    // 获取 Skill 详情
    const skill = await getSkill(skillId);
    if (!skill) {
      result = `Error: Skill not found: ${skillId}`;
    } else {
      // 返回 Skill 的指令和输入
      result = `
# ${skill.metadata.name}

${skill.instruction}

---

**用户输入**: ${JSON.stringify(args.input || "")}

请根据上述指令处理用户输入，并提供结果。
`;
    }
  } catch (err) {
    result = `Error: Failed to load skill ${skillId}: ${err?.message}`;
  }
}
```

**第 2 步**: 在 `getSkillTools()` 中生成工具定义

```typescript
export async function getSkillTools(): Promise<OpenAITool[]> {
  try {
    const skillIds = await listSkills();
    const tools: OpenAITool[] = [];
    
    for (const skillId of skillIds) {
      const skill = await getSkill(skillId);
      if (!skill || !skill.enabled) continue;
      
      tools.push({
        type: "function",
        function: {
          name: `skill_${skillId}`,
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
      });
    }
    
    return tools;
  } catch (err) {
    console.error("[SkillTools] Failed to generate tools:", err);
    return [];
  }
}
```

**第 3 步**: 在 `getTools()` 中包含 Skill 工具

```typescript
export async function getTools(): Promise<OpenAITool[]> {
  const tools = [...TOOLS];
  
  // 添加 Skill 工具
  const skillTools = await getSkillTools();
  tools.push(...skillTools);
  
  return tools;
}
```

---

## 📝 完整的代码改动

### 文件: `src/services/ai-tools.ts`

**修改 `getSkillTools()` 函数**:

```typescript
// 获取 Skill 工具列表（新的 SkillsManager 实现）
export async function getSkillTools(): Promise<OpenAITool[]> {
  try {
    const skillIds = await listSkills();
    const tools: OpenAITool[] = [];
    
    for (const skillId of skillIds) {
      const skill = await getSkill(skillId);
      if (!skill || !skill.enabled) continue;
      
      tools.push({
        type: "function",
        function: {
          name: `skill_${skillId}`,
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
      });
    }
    
    console.log(`[SkillTools] Generated ${tools.length} skill tools`);
    return tools;
  } catch (err) {
    console.error("[SkillTools] Failed to generate tools:", err);
    return [];
  }
}
```

**导入必要的函数**:

```typescript
import { listSkills, getSkill, type Skill } from "./skills-manager";
```

### 文件: `src/views/AiChatPanel.tsx`

**修改工具调用处理部分** (第 2326 行附近):

```typescript
const isSkillCall = toolName.startsWith("skill_");

if (isSkillCall) {
  // 执行 Skill
  const skillId = toolName.replace("skill_", "");
  
  try {
    const skill = await getSkill(skillId);
    if (!skill) {
      result = `Error: Skill not found: ${skillId}`;
    } else {
      // 返回 Skill 的指令和用户输入
      const userInput = args.input || "";
      result = `
# ${skill.metadata.name}

${skill.instruction}

---

**用户输入**: ${userInput}

请根据上述指令处理用户输入，并提供结果。
`;
      
      console.log(`[SkillExecution] Executed skill: ${skillId}`);
    }
  } catch (err: any) {
    result = `Error: Failed to execute skill ${skillId}: ${err?.message || err}`;
    console.error(`[SkillExecution] Failed to execute skill ${skillId}:`, err);
  }
} else {
  // 现有的工具执行逻辑
  // ...
}
```

**导入必要的函数**:

```typescript
import { listSkills, getSkill, type Skill } from "../services/skills-manager";
```

---

## 🧪 测试步骤

1. **创建一个测试 Skill**
   - 名称: `文本反转`
   - 描述: `将输入的文本反转`
   - 指令:
     ```markdown
     # 文本反转
     
     ## 功能
     将输入的文本反转（从后往前）。
     
     ## 示例
     - 输入: "Hello"
     - 输出: "olleH"
     ```

2. **在 AI Chat 中测试**
   - 输入: "请使用文本反转技能处理 'Hello World'"
   - 预期: AI 会调用 `skill_文本反转` 工具，获取指令，然后执行

3. **检查控制台日志**
   - 应该看到: `[SkillExecution] Executed skill: 文本反转`

---

## 📊 改进效果

| 方面 | 改进前 | 改进后 |
|------|--------|--------|
| **Skill 可用性** | ❌ 无法执行 | ✅ 可以执行 |
| **用户体验** | 创建 Skill 无用 | 创建的 Skill 立即可用 |
| **工作量** | - | 1-2 小时 |
| **代码复杂度** | - | 低 |

---

## 🚀 实施优先级

**优先级**: 🔴 **最高** - 这是 Skills 系统的核心功能

**工作量**: 1-2 小时

**影响**: 最高 - 让 Skills 系统真正可用

---

## 💡 后续改进

实施完成后，可以考虑：

1. **Skill 脚本执行** - 支持执行 Python/JavaScript 脚本
2. **Skill 结果缓存** - 缓存常用 Skill 的结果
3. **Skill 链式调用** - 支持 Skill 之间的调用
4. **Skill 性能优化** - 优化 Skill 加载和执行速度

---

## 📝 总结

当前 Skills 系统的关键问题是 **Skill 工具调用被禁用了**。

通过简单的改动（返回 Skill 指令给 AI），就能让 Skills 系统真正发挥作用。

这是一个高优先级、低工作量、高影响的改进。
