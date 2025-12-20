# 模块：设置面板接入（`.orca-settings`）

## 目标与范围

将 AI 配置项放入 Orca 应用的设置面板中（容器样式由 `.orca-settings` 体系控制），而不是在插件面板内自建设置 UI。

本模块负责：

- 定义插件 settings schema（Orca 自动生成设置 UI）
- 约定后续读取设置的方式（从 `orca.state.plugins[pluginName].settings` 获取）

## 关联文件

- `src/settings/ai-chat-settings.ts`
- `src/main.ts`

## 设置项（当前）

通过 `orca.plugins.setSettingsSchema(pluginName, schema)` 注册：

- `apiKey`：API Key
- `apiUrl`：API URL（默认 `https://api.openai.com/v1`）
- `model`：模型选择（含 Custom）
- `customModel`：自定义模型名
- `systemPrompt`：系统提示词
- `temperature`：温度
- `maxTokens`：最大 tokens

## UI 交互

- 在 AI Chat 面板 Header 的设置按钮中，调用：
  - `orca.commands.invokeCommand("core.openSettings")`
  - 用户在设置面板中调整配置

## 读取方式（供 Step 3 使用）

运行时读取示例（伪代码）：

- `const settings = orca.state.plugins[pluginName]?.settings`
- `settings.apiKey / settings.apiUrl / settings.model ...`

## 已知限制

- 当前仅注册 schema；AI 面板尚未消费这些配置（Step 3 才真正接入请求逻辑）。

## 下一步

- Step 3：根据 settings 组装请求参数（key/url/model/prompt），并在发送时校验缺失字段与错误提示。

## 更新记录

- 2025-12-19：把 AI 配置迁移到 Orca 设置面板（schema）

