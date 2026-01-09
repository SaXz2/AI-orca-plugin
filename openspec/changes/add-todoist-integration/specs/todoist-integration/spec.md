## ADDED Requirements

### Requirement: Todoist API Token Configuration
用户 SHALL 能够在插件设置中配置 Todoist API Token。

#### Scenario: Token 配置成功
- **WHEN** 用户在设置中输入有效的 Todoist API Token
- **THEN** Token 被保存到本地设置
- **AND** 后续 API 调用使用该 Token 认证

#### Scenario: Token 未配置
- **WHEN** 用户使用 Todoist 斜杠命令但未配置 Token
- **THEN** 显示提示信息引导用户配置 Token

---

### Requirement: View Today Tasks via Slash Command
用户 SHALL 能够通过 `/todoist` 斜杠命令查看今日任务。

#### Scenario: 查看今日任务
- **WHEN** 用户在编辑器中输入 `/todoist` 并选择该命令
- **THEN** 系统调用 Todoist API 获取今日任务
- **AND** 在编辑器中插入任务列表块

#### Scenario: 无今日任务
- **WHEN** 用户执行 `/todoist` 且 Todoist 中无今日任务
- **THEN** 显示"今日无任务"提示

#### Scenario: API 调用失败
- **WHEN** Todoist API 调用失败（网络错误、Token 无效等）
- **THEN** 显示友好的错误提示信息

---

### Requirement: Create Task via Slash Command
用户 SHALL 能够通过 `/todoist-add` 斜杠命令创建新任务。

#### Scenario: 创建简单任务
- **WHEN** 用户执行 `/todoist-add 买牛奶`
- **THEN** 在 Todoist 中创建标题为"买牛奶"的任务
- **AND** 显示创建成功提示

#### Scenario: 创建带日期的任务
- **WHEN** 用户执行 `/todoist-add 写周报 明天下午3点`
- **THEN** 在 Todoist 中创建任务，due_string 设为"明天下午3点"
- **AND** Todoist 自动解析自然语言日期

---

### Requirement: Complete Task via Slash Command
用户 SHALL 能够通过 `/todoist-done` 斜杠命令标记任务完成。

#### Scenario: 标记任务完成
- **WHEN** 用户执行 `/todoist-done` 并选择一个任务
- **THEN** 该任务在 Todoist 中被标记为完成
- **AND** 显示完成成功提示

#### Scenario: 无可完成任务
- **WHEN** 用户执行 `/todoist-done` 但无今日任务
- **THEN** 显示"无可完成的任务"提示
