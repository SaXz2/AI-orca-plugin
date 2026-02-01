# 文档索引

本目录包含 Orca AI Chat Plugin 的详细文档。

## 📚 核心文档

### 主文档
- **[../README.md](../README.md)** - 项目介绍和快速开始
- **[../ARCHITECTURE.md](../ARCHITECTURE.md)** - 完整架构、功能和实现说明
- **[../AGENTS.md](../AGENTS.md)** - AI 助手开发指引
- **[../TOOL_CALL_LOGIC.md](../TOOL_CALL_LOGIC.md)** - 工具调用逻辑说明

### 用户文档
- **[QUICK_SETUP_GUIDE.md](./QUICK_SETUP_GUIDE.md)** - 快速设置指南

## 🔧 工具文档

- **[../Tool-Prompt/](../Tool-Prompt/)** - 23+ AI 工具的详细文档
  - 搜索工具：searchNotes, searchBlocksByTag, searchBlocksByReference, queryBlocks
  - 读取工具：getBlockLinks, getBlockMeta, getBlocksText, getPage
  - 日记工具：getTodayJournal, getJournalByDate, getJournals
  - 写入工具：createBlock, createPage, insertTag, updateTagProperties
  - 查询工具：queryByTagProperty, getTagsAndPages, getPageByName
  - 联网工具：webSearch, imageSearch, wikipedia, currency
  - 其他工具：fetchUrl, getSavedAiConversations, batchInsertTags

## 📖 模块文档

- **[../module-docs/](../module-docs/)** - 详细的模块实现文档
  - 01-ui-shell.md - UI Shell 模块
  - 02-chat-panel.md - 聊天面板
  - 03-settings.md - 设置系统
  - 04-context.md - 上下文管理
  - 05-session-persistence.md - 会话持久化
  - 06-ai-tools.md - AI 工具系统
  - 07-search-service.md - 搜索服务
  - 08-query-utilities.md - 查询工具
  - 09-block-utils.md - 块工具函数
  - 10-property-utils.md - 属性工具
  - 12-custom-block-renderer.md - 自定义块渲染
  - 12-tokenizer-module.md - Token 计算模块
  - 13-plugin-api.md - 插件 API
  - chat-input.md - 聊天输入组件

## 📋 插件文档

- **[../plugin-docs/](../plugin-docs/)** - Orca 插件开发文档
  - documents/Backend-API.md - 后端 API 文档
  - documents/Core-Commands.md - 核心命令
  - documents/Core-Editor-Commands.md - 编辑器命令
  - documents/Custom-Renderers.md - 自定义渲染器
  - documents/Quick-Start.md - 快速开始
  - types/orca.md - Orca 类型定义
  - constants/configs.md - 配置常量
  - constants/db.md - 数据库常量
  - modules.md - 模块说明

## 🧪 测试文档

- **[../tests/tool-test-cases.md](../tests/tool-test-cases.md)** - 工具测试用例

## 📝 文档说明

### 文档组织原则

1. **README.md** - 项目概览和快速开始，面向新用户
2. **ARCHITECTURE.md** - 完整的技术架构文档，面向开发者
3. **AGENTS.md** - AI 助手和代码生成器的开发指引
4. **TOOL_CALL_LOGIC.md** - 工具调用系统的详细说明

### 如何使用文档

- **新用户**：从 [README.md](../README.md) 开始，然后阅读 [QUICK_SETUP_GUIDE.md](./QUICK_SETUP_GUIDE.md)
- **开发者**：阅读 [ARCHITECTURE.md](../ARCHITECTURE.md) 了解整体架构，然后查看 [module-docs](../module-docs/) 了解具体实现
- **工具开发**：查看 [Tool-Prompt](../Tool-Prompt/) 了解现有工具，参考 [06-ai-tools.md](../module-docs/06-ai-tools.md) 学习如何添加新工具
- **AI 助手**：遵循 [AGENTS.md](../AGENTS.md) 中的指引

## 🔄 文档更新

文档版本：v2.0.0  
更新日期：2026-02-01

### 最近更新

- ✨ 创建完整的架构文档（ARCHITECTURE.md）
- 📚 重组文档结构，删除过时和重复文档
- 📝 创建统一的文档索引
- 🗑️ 清理临时文档和 PR 文档

---

**提示**：如果发现文档有错误或需要补充，请提交 Issue 或 PR。
