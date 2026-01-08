# Semantic Breakpoint Module

## 概述

语义断点检测模块用于：
- 检测对话中的自然断点（话题结束、任务完成）
- 识别不可截断的位置（代码块中、未闭合引用）
- 支持人工标记（#MILESTONE）

## 文件位置

```
src/services/semantic-breakpoint.ts
```

## 核心功能

### 断点检测

```typescript
import { detectBreakpoint } from "./semantic-breakpoint";

const result = detectBreakpoint(message);
// result: {
//   isBreakpoint: true,
//   type: "topic_end",      // 断点类型
//   confidence: 0.85,       // 置信度
//   suggestion: "compress"  // 建议操作
// }
```

### 断点类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `topic_end` | 话题结束 | "好的，就这样" |
| `task_complete` | 任务完成 | "已完成"、"成功" |
| `user_confirm` | 用户确认 | "明白了"、"收到" |
| `natural_pause` | 自然停顿 | 长回复以句号结尾 |
| `manual_marker` | 人工标记 | `#MILESTONE` |
| `hard_limit` | 硬限制强制 | Token 超限 |

### 人工标记

用户可以在对话中插入标记强制创建里程碑：

```
#MILESTONE
#BREAKPOINT
#CHECKPOINT
<!-- milestone -->
```

### 不可截断检测

```typescript
const result = detectBreakpoint(message);

if (!result.isBreakpoint) {
  console.log(result.blockingReason);
  // "unclosed_code_block:python"
  // "logic_continuation"
  // "incomplete_sentence"
}
```

### 阻塞原因

| 原因 | 说明 |
|------|------|
| `unclosed_code_block` | 代码块未闭合 |
| `unclosed_brackets` | 括号未闭合 |
| `logic_continuation` | 逻辑连接词开头 |
| `incomplete_sentence` | 句子未完成 |
| `ellipsis` | 省略号结尾 |
| `contrast_continuation` | 转折词开头 |

## 高级功能

### 查找最佳断点

```typescript
import { findBestBreakpoint } from "./semantic-breakpoint";

// 从 preferredIdx 开始搜索最佳断点
const bestIdx = findBestBreakpoint(messages, startIdx, preferredIdx);
```

### 分析话题边界

```typescript
import { analyzeTopicBoundaries } from "./semantic-breakpoint";

const boundaries = analyzeTopicBoundaries(messages);
// [5, 12, 23] - 建议的分段点索引
```

### 查找人工标记

```typescript
import { findManualMarkers } from "./semantic-breakpoint";

const markers = findManualMarkers(messages);
// [8, 15] - 包含人工标记的消息索引
```

### 低优先级消息检测

```typescript
import { isLowPriorityMessage } from "./semantic-breakpoint";

// 可以安全过滤的消息
if (isLowPriorityMessage(message)) {
  // "好的"、"谢谢"、"嗯" 等
}
```

## 上下文状态分析

```typescript
import { getBreakpointDebugInfo } from "./semantic-breakpoint";

const debug = getBreakpointDebugInfo(message);
// {
//   content: "...",
//   result: { isBreakpoint: false, ... },
//   contextState: {
//     inCodeBlock: true,
//     codeBlockLang: "python",
//     inQuoteBlock: false,
//     inList: false,
//     unclosedBrackets: 0
//   }
// }
```

## 调试接口

```javascript
// 浏览器控制台
semanticBreakpoint.detectBreakpoint(message)
semanticBreakpoint.analyzeTopicBoundaries(messages)
semanticBreakpoint.getBreakpointDebugInfo(message)
```

## 设计原则

1. **宁可多保留** - 不确定时不截断
2. **代码块优先** - 永不在代码块中截断
3. **人工标记最高优先级** - 用户显式标记立即生效
4. **启发式 + 规则** - 组合多种检测方法
