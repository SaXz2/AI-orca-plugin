# OrcaNote AI Chat Plugin（三步拆分任务）

计划来源：`C:\\Users\\1\\.claude\\plans\\splendid-honking-music.md`

## CSS/样式要求（先决约束）

- 优先使用 `orca.components`（遵循虎鲸笔记/Orca 的设计体系），减少自定义样式。
- 如需自定义 CSS：
  - 仅使用主题变量（如 `--orca-color-bg-1` / `--orca-color-text-1` / `--orca-color-border` 等），避免硬编码颜色。
  - 样式需作用域化（以插件前缀 class 包裹），避免污染全局。
  - 建议通过 `orca.themes.injectCSSResource("styles/xxx.css", role)` 注入，并在 `unload()` 中 `removeCSSResources(role)` 清理。

---

## Step 1：创建前端界面（前端优先，可用 mock）

目标：先把“能用/能点/能演示”的 UI 搭起来（Settings 页面 + 左侧 AI 交互面板），交互用 mock 数据模拟。

### 1.1 面板与入口

- 左侧 AI 交互面板
  - 注册一个自定义 panel（例如 `ai-chat.panel`），并提供打开/关闭入口（推荐：EditorSidetool 按钮；备选：headbar/toolbar 按钮）。
  - 面板内包含：Header（标题 + 设置入口）/ MessageList / 输入区。
- Settings 面板（Orca 内置设置）
  - AI 配置应出现在 Orca 设置面板（容器通常为 `.orca-settings`），而不是嵌在 AI 面板里。
  - 通过 `orca.plugins.setSettingsSchema()` 定义字段，让设置面板自动渲染配置项（Step 3 再扩展 prompts/models 等更完整配置）。

### 1.2 组件拆分（以可维护为主）

- `ChatPanel`：面板容器，组织区域与状态绑定
- `MessageList` + `MessageItem`：消息渲染（区分 user/assistant）
- `ChatInput`：输入框（优先用 `orca.components.CompositionTextArea`，支持中文 IME）
- `Settings` UI：最小可用的设置页面/弹窗（只做 UI + 本地状态）

### 1.3 Mock 交互（可演示）

- “发送”后：
  - 立即把用户消息追加到列表
  - 1s 后追加一条 assistant mock 回复（可根据输入拼接）
- “清空会话”按钮（仅前端清空即可）
-（可选）Mock：Prompt 模板下拉（2~3 个静态模板）
 -（可选）右侧信息栏（mock）：Context/Prompt/History 占位，先把布局搭好，Step 2/3 再接功能

### 1.4 验收标准

- 能在 Orca 中打开/关闭左侧 AI 面板
- 能输入并发送消息，消息列表正常渲染，mock 回复可见
- Settings 面板可打开，并能看到插件的 AI 配置项（由 settings schema 渲染）
- UI 样式不破坏原有界面（遵循 CSS 约束）

---

## Step 2：接入读取功能（block / 页面 / 标签）

目标：把“上下文读取”接到 UI 上，让用户能选择要喂给 AI 的内容（仍可先不调用 AI，先把读取结果展示/拼接出来）。

### 2.1 Context 读取能力

- Block 内容读取
  - 通过 `orca.invokeBackend("get-block-tree", blockId)` 获取 block 树，并转换成可用于提示词的纯文本（先做最小可读格式即可）。
- 页面内容读取
  - 支持“当前活动页面”（可用 `rootBlockId` 作为入口）；
  -（可选）支持选择某个页面 root block。
- 标签内容读取
  - 通过 `orca.invokeBackend("get-blocks-with-tags", ["tagName"])` 拉取关联 blocks，并拼接成上下文文本。

### 2.2 UI 接线

- ContextSelector（或等价 UI）
  - 展示已选上下文（block/page/tag）为 tags/chips
  - 支持添加/删除
  - 添加入口：选择 block / 选择 tag / 使用当前活动页面
- 右键菜单入口（可作为第二阶段收尾）
  - `orca.blockMenuCommands.registerBlockMenuCommand()`：对某个 block “发送到 AI/加入上下文”
  - `orca.tagMenuCommands.registerTagMenuCommand()`：对某个 tag “加入上下文”

### 2.3 验收标准

- 选择一个 block/page/tag 后，面板内能看到“已选上下文”
- 点击“构建上下文/预览”能看到拼接后的文本（哪怕后续 AI 仍 mock）
- 右键菜单能把 block/tag 加入上下文（至少 block 可用）

---

## Step 3：接入 AI 功能（API key / URL / models / prompt）

目标：在 Step 1/2 UI 和读取能力稳定后，接入 OpenAI 兼容 API（含流式输出），并把 Settings 真正变成可配置项。

### 3.1 Settings 真落地

- `orca.plugins.setSettingsSchema(pluginName, schema)` 定义设置项
- 用 `orca.plugins.setSettings("app"|"repo", pluginName, settings)` 保存
- Settings 字段（建议最小集）
  - `apiKey`、`apiUrl`、`model`、`customModel`
  - `temperature`、`maxTokens`
  - `promptTemplates`（数组）+ `activePromptId`

### 3.2 AI Client（OpenAI-compatible）

- `fetch(apiUrl + "/chat/completions")`（或兼容路径）请求
- 支持：
  - AbortController：Stop/Cancel
  - SSE/流式响应解析（`data: { ... }`）
  - 组合 messages：system（prompt）+ context（Step2 构建文本）+ history

### 3.3 UI 集成与历史（可迭代）

- 发送时切换为 streaming 状态，MessageItem 显示流式文本追加
- 错误态：key/url/model 缺失、网络错误、超时等给出提示
-（可选）会话历史持久化：`orca.plugins.setData/getData`（按会话 ID 存储）

### 3.4 验收标准

- 配置 API 后可真实对话（至少非流式成功；再扩展到流式）
- 上下文（block/page/tag）会进入 prompt 并影响回答
- Stop 可中断流式输出
