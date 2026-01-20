# AI Chat 插件改进机会分析

## 📊 当前系统状态

### ✅ 已完成的功能
- Skills 系统完全重构（文件夹结构、SkillsManager API）
- 内置 Skills（今日回顾、周报聚合）
- Skill 预检系统（自动检测相关 Skills）
- 多对话管理（独立后台生成）
- 对话切换不中断流式输出
- **Skill 工具执行** ✅ 新增 - AI 可以发现和调用 Skills
- **Skill 执行处理** ✅ 新增 - Skill 指令返回给 AI 处理

### ⚠️ 待完成的功能
- Skill 脚本执行（支持 Python/JavaScript 脚本）
- Skill 版本控制
- Skill 搜索和发现（按标签、作者过滤）

---

## 🎯 改进机会（按优先级排序）

### 1. **Skill 工具执行** (优先级: 🔴 最高)

**当前状态**: `getSkillTools()` 返回空数组，Skills 无法被 AI 调用

**改进方案**:
```typescript
// 在 src/services/ai-tools.ts 中实现
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
    console.error("[SkillTools] Failed:", err);
    return [];
  }
}
```

**工作量**: 1-2 小时  
**影响**: 最高 - 让 Skills 真正可用

---

### 2. **Skill 执行处理** (优先级: 🔴 最高)

**当前状态**: 在 `AiChatPanel.tsx` 第 2326 行，Skill 工具调用被禁用

**改进方案**:
```typescript
// 在 AiChatPanel.tsx 中修改工具调用处理
if (isSkillCall) {
  const skillId = toolName.replace("skill_", "");
  
  try {
    const skill = await getSkill(skillId);
    if (!skill) {
      result = `Error: Skill not found: ${skillId}`;
    } else {
      // 返回 Skill 的指令供 AI 使用
      result = `
# ${skill.metadata.name}

${skill.instruction}

---

**用户输入**: ${JSON.stringify(args.input || "")}

请根据上述指令处理用户输入，并提供结果。
`;
    }
  } catch (err: any) {
    result = `Error: Failed to execute skill ${skillId}: ${err?.message}`;
  }
}
```

**工作量**: 1-2 小时  
**影响**: 最高 - 完成 Skills 系统

---

### 3. **Skill 脚本执行** (优先级: 🟡 高)

**当前状态**: Skills 支持 `scripts/` 文件夹，但无法执行

**改进方案**:
- 支持执行 Python 脚本（利用现有的 Python 运行时）
- 支持执行 JavaScript 脚本
- 脚本结果返回给 AI

**工作量**: 2-3 小时  
**影响**: 高 - 支持更复杂的 Skills

---

### 4. **Skill 版本控制** (优先级: 🟡 中)

**当前状态**: 只有单一版本

**改进方案**:
- 每次编辑时自动保存版本
- 支持版本历史查看
- 支持回滚到之前的版本

**工作量**: 2-3 小时  
**影响**: 中 - 改善用户体验

---

### 5. **Skill 搜索和发现** (优先级: 🟡 中)

**当前状态**: 只有简单的名称搜索

**改进方案**:
- 按标签过滤
- 按作者过滤
- 按使用频率排序
- 搜索指令内容

**工作量**: 1-2 小时  
**影响**: 中 - 改善用户体验

---

### 6. **Skill 使用统计** (优先级: 🟢 低)

**当前状态**: 无统计信息

**改进方案**:
- 追踪每个 Skill 的使用次数
- 记录成功/失败率
- 显示最后使用时间
- 在 Skill Manager 中显示统计

**工作量**: 1-2 小时  
**影响**: 低 - 帮助用户了解 Skill 使用情况

---

### 7. **Skill 快捷方式** (优先级: 🟢 低)

**当前状态**: 无快捷方式

**改进方案**:
- 为常用 Skill 添加快捷键
- 在 Chat Panel 中显示快捷方式按钮
- 支持自定义快捷方式

**工作量**: 1-2 小时  
**影响**: 低 - 提升工作效率

---

### 8. **对话多模型支持** (优先级: 🟡 中)

**当前状态**: 每个对话只能用一个模型

**改进方案**:
- 支持在同一对话中切换模型
- 显示每条消息使用的模型
- 支持多模型并行生成

**工作量**: 2-3 小时  
**影响**: 中 - 改善用户体验

---

### 9. **对话导出功能** (优先级: 🟡 中)

**当前状态**: 无导出功能

**改进方案**:
- 导出为 Markdown
- 导出为 PDF
- 导出为 JSON
- 支持选择性导出

**工作量**: 2-3 小时  
**影响**: 中 - 改善用户体验

---

### 10. **对话搜索** (优先级: 🟡 中)

**当前状态**: 无全局搜索

**改进方案**:
- 搜索所有对话中的消息
- 按日期范围过滤
- 按模型过滤
- 显示搜索结果的上下文

**工作量**: 2-3 小时  
**影响**: 中 - 改善用户体验

---

## 📋 建议实施顺序

### 第一阶段（立即实施）
1. **Skill 工具执行** - 让 Skills 真正可用
2. **Skill 执行处理** - 完成 Skills 系统

### 第二阶段（下一步）
3. **Skill 脚本执行** - 支持更复杂的 Skills
4. **Skill 搜索和发现** - 改善用户体验

### 第三阶段（可选）
5. **Skill 版本控制** - 追踪历史
6. **Skill 使用统计** - 了解使用情况
7. **对话导出功能** - 分享和备份
8. **对话搜索** - 快速查找

---

## 💡 快速赢（最小可行改进）

如果只有 2-3 小时，建议：

1. **实施 Skill 工具执行** (30 分钟)
   - 在 `getSkillTools()` 中生成工具列表
   - 让 AI 能发现 Skills

2. **实施 Skill 执行处理** (1 小时)
   - 在工具调用时返回 Skill 指令
   - 让 AI 能使用 Skills

3. **改进 Skill 搜索** (30 分钟)
   - 添加标签过滤
   - 改善用户体验

这样就能让 Skills 系统完全可用，并改善用户体验。

---

## 📝 总结

**最高优先级**: 完成 Skill 工具执行和执行处理  
**次高优先级**: 添加 Skill 脚本执行和搜索功能  
**可选改进**: 版本控制、统计、快捷方式等

建议从第一阶段开始，这会让 Skills 系统真正发挥作用。
