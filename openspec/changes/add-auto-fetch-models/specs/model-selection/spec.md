## ADDED Requirements
### Requirement: 平台模型自动获取
系统 MUST 支持从 OpenAI 兼容 API 的 `/v1/models` 获取模型列表，并与当前平台模型列表去重合并，保留已有模型配置。

#### Scenario: 成功获取并合并
- **WHEN** 用户在平台配置面板点击“获取模型”
- **THEN** 系统请求 `/v1/models` 并将新模型合并到列表，已有模型配置保持不变

#### Scenario: 获取失败提示
- **WHEN** API 认证失败或网络异常或返回空列表
- **THEN** 系统向用户显示对应错误信息，且不破坏现有模型列表
