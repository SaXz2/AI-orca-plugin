# Compression Config Module

## 概述

压缩配置模块提供：
- 配置 Schema 校验
- 模型特定预设
- 配置合并与覆盖

## 文件位置

```
src/services/compression-config.ts
```

## 配置 Schema

```typescript
type CompressionConfigSchema = {
  // 阈值配置
  compressionThreshold: number;    // 触发压缩的 Token 阈值
  hardLimitThreshold: number;      // 硬截断阈值
  recentTokenLimit: number;        // 最近对话保留上限
  
  // 摘要配置
  layerTokenTarget: number;        // 每层目标 Token
  summaryMaxTokens: number;        // 摘要最大 Token
  summaryMaxTokensCompact: number; // 高密度摘要最大 Token
  summaryVerbosity: "minimal" | "medium" | "detailed";
  
  // Token 对齐
  enableTokenAlignment: boolean;
  tokenAlignUnit: number;
  paddingStrategy: "comment" | "whitespace" | "marker" | "none";
  
  // 里程碑配置
  milestoneThreshold: number;      // 触发合并的层数
  milestoneDistillThreshold: number;
  
  // 其他
  entityMapPosition: "after_system" | "before_dynamic" | "inline";
  // ... 更多配置
};
```

## 预设配置

### DeepSeek 预设 (CACHE_FIRST)

```typescript
import { PRESET_DEEPSEEK } from "./compression-config";

// 特点：
// - 较低阈值 (4000)，更早压缩
// - 启用 64 token 对齐
// - 极简摘要
```

### Gemini 预设 (REASONING_FIRST)

```typescript
import { PRESET_GEMINI } from "./compression-config";

// 特点：
// - 较高阈值 (12000)，保留更多上下文
// - 禁用对齐
// - 中等冗余度摘要
```

### Claude 预设

```typescript
import { PRESET_CLAUDE } from "./compression-config";

// 特点：
// - 中高阈值 (10000)
// - 禁用对齐
// - 实体映射在动态上下文前
```

### GPT 预设 (GENERAL)

```typescript
import { PRESET_GPT } from "./compression-config";

// 特点：
// - 平衡阈值 (6000)
// - 禁用对齐
// - 中等冗余度
```

## 使用方式

### 创建会话配置

```typescript
import { createSessionConfig, printConfig } from "./compression-config";

// 自动选择预设
const config = createSessionConfig("deepseek-chat");

// 带覆盖
const config = createSessionConfig("gpt-4o", {
  compressionThreshold: 8000,
});

// 打印配置（调试用）
printConfig(config, "session-123");
```

### 配置校验

```typescript
import { validateConfig } from "./compression-config";

const result = validateConfig({
  compressionThreshold: 500, // 太小
});

// result: {
//   valid: false,
//   errors: ["compressionThreshold must be >= 1000"],
//   warnings: []
// }
```

### 获取配置摘要

```typescript
import { getConfigSummary } from "./compression-config";

const summary = getConfigSummary(config);
// {
//   mode: "Cache-Optimized",
//   thresholds: "4000/5800 tokens",
//   alignment: "64-token boundary",
//   milestones: "Every 10 layers"
// }
```

## 调试接口

```javascript
// 浏览器控制台
compressionConfig.validateConfig({ ... })
compressionConfig.getPresetForModel("deepseek-chat")
compressionConfig.PRESETS
compressionConfig.DEFAULT_CONFIG
```
