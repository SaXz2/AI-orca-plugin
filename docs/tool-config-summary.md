# AI 工具配置和系统提示词总结

## 修复日期
2026-01-31

## 当前工具数量

**基础工具**: 23 个（在 `src/services/ai-tools.ts` 的 TOOLS 数组中定义）

### 工具分类

1. **搜索类** (4个)
   - `searchNotes` - 全文搜索笔记
   - `queryByTagProperty` - 标签属性查询
   - `query_blocks` - 高级查询（QueryDescription2）
   - `searchBlocksByReference` - 反链搜索

2. **读取类** (4个)
   - `getPage` - 读取页面内容
   - `getBlocksText` - 读取块文本
   - `getBlockMeta` - 获取元数据
   - `getBlockLinks` - 获取链接

3. **日记类** (3个)
   - `getTodayJournal` - 今日日记
   - `getJournalByDate` - 指定日期日记
   - `getJournals` - 日记范围查询

4. **写入类** (4个)
   - `createBlock` - 创建块
   - `createPage` - 创建页面
   - `insertTag` - 添加标签
   - `updateTagProperties` - 更新标签属性

5. **其他功能** (8个)
   - `getSavedAiConversations` - 已保存对话
   - `webSearch` - 联网搜索（可选）
   - `imageSearch` - 图像搜索（可选）
   - `searchWikipedia` - Wikipedia 搜索（可选）
   - `convertCurrency` - 货币转换（可选）
   - `getExchangeRates` - 汇率查询（可选）
   - `fetchWebContent` - 网页内容获取（可选）
   - `generateFlashcards` - 生成闪卡（特殊工具）

6. **动态工具**
   - **Skills** - 用户自定义技能（数量不固定，按需加载）
   - **Todoist** - 任务管理工具（可选，6个工具）
   - **脚本分析** - Python 数据分析工具（可选）

## 系统提示词

位置: `src/settings/ai-chat-settings.ts`

当前版本强调：
- 回复原则：结论先行、短句优先
- 工具使用规范：避免重复调用、正确使用引用格式
- 真实性要求：不编造内容
- 写入操作：仅在明确要求时执行

⚠️ **关键缺失**: 没有明确区分"查询笔记"和"一般性提问"

## 发现的问题及修复

### 1. 🔴 Skills 自动执行问题（✅ 已修复）

**问题**: Skills 工具被调用时不需要用户确认，直接执行

**修复**: 在 `AiChatPanel.tsx` 2286-2325 行添加了用户确认逻辑
- 使用 `createToolConfirmPromise` 显示确认对话框
- 用户拒绝时返回错误信息给 AI
- 用户确认后才加载 Skill 详细指令

### 2. 🟡 AI 过度调用工具

**现象**: 用户问"什么是 XXX"时，AI 可能去调用 searchNotes

**问题示例**:
- 用户: "解释一下什么是量子纠缠"
- AI 错误行为: 调用 searchNotes 查询笔记
- AI 正确行为: 直接回答概念性问题

**原因**: 系统提示词没有明确区分场景

### 3. 🔴 XML 工具调用解析问题（✅ 已修复）

详见: `docs/tool-call-parsing-fixes.md`

## 优化建议

### 建议 1: 优化系统提示词（解决过度调用）⭐

在系统提示词添加：

```
## 工具调用判断
- 仅在用户明确要求查询笔记时才调用工具
- 用户询问概念、原理、解释等一般性问题时，直接回答，不要调用工具
- 判断标准：
  ✅ 需要工具："我的笔记里有XXX吗"、"搜索/查找XXX"、"总结我的XXX"
  ❌ 不需要工具："XXX是什么"、"解释XXX"、"XXX的原理"、"如何理解XXX"
- 当不确定时，优先直接回答，除非用户明确说要"在笔记中查找"
```

### 建议 2: 工具错误提示优化

增强错误信息，包含：
- 错误原因
- 可能的解决方案
- 替代方法建议

### 建议 3: 添加工具调用日志

在设置界面添加"工具调用历史"功能

## 工具状态管理

三种状态（`tool-store.ts`）：

1. **auto** - 自动批准，AI 可以直接调用
   - 适用于：搜索、读取等安全操作

2. **ask** - 询问用户，每次调用前需要用户确认
   - 适用于：写入操作、联网搜索等需要用户确认的操作

3. **disabled** - 禁用，不加载到工具列表中
   - 适用于：临时禁用某些工具，但保留配置（方便再次启用）

### 与开关的区别

- **开关** (`webSearchEnabled` 等): 控制整个功能模块的启用/禁用
- **disabled 状态**: 精细控制单个工具，不影响其他工具

例如：可以开启 `webSearchEnabled`，但把 `imageSearch` 设为 disabled。

默认: 所有工具为 `auto`，Skills 强制要求确认

## 相关文件

- 工具定义: `src/services/ai-tools.ts`
- 工具状态: `src/store/tool-store.ts`
- 系统提示词: `src/settings/ai-chat-settings.ts`
- 执行逻辑: `src/views/AiChatPanel.tsx` (2216-2425)

## 总结

### ✅ 已完成
1. 修复 Skills 自动执行 - 现在需要用户确认
2. 修复 XML 工具调用解析 - 支持所有格式
3. 完善测试覆盖 - 55 个测试全部通过

### 🔴 待修复
1. 系统提示词需要明确区分场景
2. 防止 AI 过度调用工具
3. 增强错误提示可读性
