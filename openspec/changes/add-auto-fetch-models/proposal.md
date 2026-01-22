# Change: 自动获取平台模型列表

## Why
当前平台模型需要手动维护，容易遗漏或配置错误。增加自动获取能力可以降低维护成本并提升配置效率。

## What Changes
- 新增模型列表获取服务，兼容 OpenAI `/v1/models` 标准
- 平台配置面板增加“获取模型”按钮与加载/错误提示
- 获取结果与现有模型列表去重合并，保留已有模型配置

## Impact
- Affected specs: model-selection
- Affected code: src/services/model-fetcher.ts, src/views/chat-input/ModelSelectorMenu.tsx, module-docs/chat-input.md
