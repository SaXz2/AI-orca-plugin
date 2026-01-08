/**
 * Semantic Breakpoint Detection - 语义断点检测
 * 
 * 功能：
 * - 检测对话中的自然断点（话题结束、任务完成等）
 * - 识别不可截断的位置（代码块中、未闭合引用等）
 * - 支持人工标记（#MILESTONE）
 * - 规则集 + 启发式组合
 * 
 * 设计原则：
 * - 宁可多保留也不要在关键位置截断
 * - 对边界情况（代码块、引用）做特殊处理
 */

import type { Message } from "./session-service";

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

/** 断点类型 */
export type BreakpointType = 
  | "topic_end"       // 话题结束
  | "task_complete"   // 任务完成
  | "user_confirm"    // 用户确认
  | "natural_pause"   // 自然停顿
  | "manual_marker"   // 人工标记
  | "hard_limit";     // 硬限制强制

/** 断点检测结果 */
export type BreakpointResult = {
  /** 是否为断点 */
  isBreakpoint: boolean;
  /** 断点类型 */
  type?: BreakpointType;
  /** 置信度 (0-1) */
  confidence: number;
  /** 不可截断的原因（如果不是断点） */
  blockingReason?: string;
  /** 建议的处理方式 */
  suggestion?: "compress" | "wait" | "force";
};

/** 上下文状态（用于跨消息检测） */
export type ContextState = {
  /** 是否在代码块中 */
  inCodeBlock: boolean;
  /** 代码块语言 */
  codeBlockLang?: string;
  /** 是否在引用块中 */
  inQuoteBlock: boolean;
  /** 是否在列表中 */
  inList: boolean;
  /** 未闭合的括号数 */
  unclosedBrackets: number;
  /** 最近的话题关键词 */
  recentTopics: string[];
};

// ═══════════════════════════════════════════════════════════════════════════
// 检测规则
// ═══════════════════════════════════════════════════════════════════════════

/** 话题结束信号（高置信度） */
const TOPIC_END_PATTERNS: Array<{ pattern: RegExp; confidence: number }> = [
  { pattern: /^(好的|就这样|先这样|那就这样|暂时就这些)[。！!,.，\s]*$/i, confidence: 0.9 },
  { pattern: /^(谢谢|感谢|多谢|辛苦了|thanks|thank you)[。！!,.，\s]*$/i, confidence: 0.85 },
  { pattern: /^(我知道了|明白了|了解了|收到|got it|understood)[。！!,.，\s]*$/i, confidence: 0.85 },
  { pattern: /^(下次再|回头再|稍后再|待会再|later)[。！!,.，\s]*$/i, confidence: 0.8 },
  { pattern: /^(没问题|可以|行|ok|okay|sure)[。！!,.，\s]*$/i, confidence: 0.7 },
];

/** 任务完成信号 */
const TASK_COMPLETE_PATTERNS: Array<{ pattern: RegExp; confidence: number }> = [
  { pattern: /已完成|已创建|已保存|已更新|done|completed|finished/i, confidence: 0.8 },
  { pattern: /成功[。！!]?$/i, confidence: 0.75 },
  { pattern: /以上就是|总结如下|综上所述/i, confidence: 0.7 },
];

/** 人工标记 */
const MANUAL_MARKER_PATTERNS: Array<{ pattern: RegExp; confidence: number }> = [
  { pattern: /#MILESTONE/i, confidence: 1.0 },
  { pattern: /#BREAKPOINT/i, confidence: 1.0 },
  { pattern: /#CHECKPOINT/i, confidence: 1.0 },
  { pattern: /<!-- ?milestone ?-->/i, confidence: 1.0 },
];

/** 逻辑连续信号（不应截断） */
const CONTINUATION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /```[^`]*$/, reason: "unclosed_code_block" },
  { pattern: /^\s*(然后|接下来|首先|其次|最后|另外|此外|furthermore|additionally|next)/i, reason: "logic_continuation" },
  { pattern: /[,，:：]$/, reason: "incomplete_sentence" },
  { pattern: /\.\.\.$|…$/, reason: "ellipsis" },
  { pattern: /^(但是|不过|然而|however|but|although)/i, reason: "contrast_continuation" },
  { pattern: /\($|\[$|\{$/, reason: "unclosed_bracket" },
];

/** 低优先级内容（可以安全压缩） */
const LOW_PRIORITY_PATTERNS: RegExp[] = [
  /^(好的|好|ok|OK|嗯|哦|行|可以|没问题|收到|明白|了解|知道了)[\s。！!,.，]*$/,
  /^(谢谢|感谢|多谢|thanks|thx)[\s。！!,.，]*$/i,
  /^(你好|您好|hi|hello|hey)[\s。！!,.，]*$/i,
  /^(是的|对|没错|确实|同意)[\s。！!,.，]*$/,
];

// ═══════════════════════════════════════════════════════════════════════════
// 上下文分析
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 分析文本的上下文状态
 */
function analyzeContextState(text: string): ContextState {
  const state: ContextState = {
    inCodeBlock: false,
    inQuoteBlock: false,
    inList: false,
    unclosedBrackets: 0,
    recentTopics: [],
  };
  
  // 检测代码块
  const codeBlockMatches = text.match(/```(\w*)/g) || [];
  const codeBlockCloses = text.match(/```\s*$/gm) || [];
  
  // 奇数个 ``` 表示未闭合
  if (codeBlockMatches.length % 2 !== 0) {
    state.inCodeBlock = true;
    // 提取语言
    const lastOpen = text.lastIndexOf("```");
    const langMatch = text.slice(lastOpen).match(/```(\w+)/);
    if (langMatch) {
      state.codeBlockLang = langMatch[1];
    }
  }
  
  // 检测引用块（以 > 开头的行）
  const lines = text.split("\n");
  const lastLine = lines[lines.length - 1];
  if (lastLine.trim().startsWith(">")) {
    state.inQuoteBlock = true;
  }
  
  // 检测列表（以 - 或数字. 开头）
  if (/^[\s]*[-*]\s/.test(lastLine) || /^[\s]*\d+\.\s/.test(lastLine)) {
    state.inList = true;
  }
  
  // 检测未闭合括号
  const openBrackets = (text.match(/[(\[{]/g) || []).length;
  const closeBrackets = (text.match(/[)\]}]/g) || []).length;
  state.unclosedBrackets = openBrackets - closeBrackets;
  
  return state;
}

/**
 * 检测是否在不可截断的位置
 */
function detectBlockingContext(text: string, state: ContextState): string | null {
  // 代码块未闭合
  if (state.inCodeBlock) {
    return `unclosed_code_block${state.codeBlockLang ? `:${state.codeBlockLang}` : ""}`;
  }
  
  // 括号未闭合
  if (state.unclosedBrackets > 0) {
    return "unclosed_brackets";
  }
  
  // 检查连续性模式
  for (const { pattern, reason } of CONTINUATION_PATTERNS) {
    if (pattern.test(text)) {
      return reason;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 主要检测逻辑
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 检测单条消息是否为断点
 */
export function detectBreakpoint(message: Message): BreakpointResult {
  const content = message.content?.trim() || "";
  
  // 空消息不是断点
  if (!content) {
    return { isBreakpoint: false, confidence: 0 };
  }
  
  // 1. 检查人工标记（最高优先级）
  for (const { pattern, confidence } of MANUAL_MARKER_PATTERNS) {
    if (pattern.test(content)) {
      return {
        isBreakpoint: true,
        type: "manual_marker",
        confidence,
        suggestion: "compress",
      };
    }
  }
  
  // 2. 分析上下文状态
  const state = analyzeContextState(content);
  const blockingReason = detectBlockingContext(content, state);
  
  if (blockingReason) {
    return {
      isBreakpoint: false,
      confidence: 0.9,
      blockingReason,
      suggestion: "wait",
    };
  }
  
  // 3. 检查话题结束信号
  for (const { pattern, confidence } of TOPIC_END_PATTERNS) {
    if (pattern.test(content)) {
      return {
        isBreakpoint: true,
        type: "topic_end",
        confidence,
        suggestion: "compress",
      };
    }
  }
  
  // 4. 检查任务完成信号
  for (const { pattern, confidence } of TASK_COMPLETE_PATTERNS) {
    if (pattern.test(content)) {
      return {
        isBreakpoint: true,
        type: "task_complete",
        confidence,
        suggestion: "compress",
      };
    }
  }
  
  // 5. 启发式判断
  // - 用户消息以句号/问号结尾
  if (message.role === "user" && /[。！!?？]$/.test(content)) {
    return {
      isBreakpoint: true,
      type: "natural_pause",
      confidence: 0.6,
      suggestion: "compress",
    };
  }
  
  // - 助手消息较长且完整
  if (message.role === "assistant" && content.length > 100) {
    // 检查是否以完整句子结尾
    if (/[。！!?？.]\s*$/.test(content)) {
      return {
        isBreakpoint: true,
        type: "natural_pause",
        confidence: 0.65,
        suggestion: "compress",
      };
    }
  }
  
  // 默认：不是明确的断点
  return {
    isBreakpoint: false,
    confidence: 0.5,
    suggestion: "wait",
  };
}

/**
 * 检测消息序列中的最佳断点位置
 * 
 * @param messages 消息列表
 * @param startIdx 开始搜索的索引
 * @param preferredIdx 首选索引（如果是断点则使用）
 * @returns 最佳断点索引，-1 表示没有找到
 */
export function findBestBreakpoint(
  messages: Message[],
  startIdx: number,
  preferredIdx: number,
): number {
  // 首先检查首选位置
  if (preferredIdx >= startIdx && preferredIdx < messages.length) {
    const result = detectBreakpoint(messages[preferredIdx]);
    if (result.isBreakpoint && result.confidence >= 0.7) {
      return preferredIdx;
    }
  }
  
  // 从首选位置向后搜索
  let bestIdx = -1;
  let bestConfidence = 0;
  
  for (let i = preferredIdx; i < messages.length; i++) {
    const result = detectBreakpoint(messages[i]);
    
    if (result.isBreakpoint && result.confidence > bestConfidence) {
      bestIdx = i;
      bestConfidence = result.confidence;
      
      // 高置信度直接返回
      if (bestConfidence >= 0.85) {
        return bestIdx;
      }
    }
  }
  
  // 如果向后没找到，向前搜索
  if (bestIdx === -1) {
    for (let i = preferredIdx - 1; i >= startIdx; i--) {
      const result = detectBreakpoint(messages[i]);
      
      if (result.isBreakpoint && result.confidence > bestConfidence) {
        bestIdx = i;
        bestConfidence = result.confidence;
      }
    }
  }
  
  return bestIdx;
}

/**
 * 检查消息是否为低优先级（可以安全过滤）
 */
export function isLowPriorityMessage(message: Message): boolean {
  const content = message.content?.trim() || "";
  
  if (!content || content.length < 3) return true;
  
  return LOW_PRIORITY_PATTERNS.some(p => p.test(content));
}

/**
 * 查找消息中的人工标记
 */
export function findManualMarkers(messages: Message[]): number[] {
  const indices: number[] = [];
  
  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content || "";
    for (const { pattern } of MANUAL_MARKER_PATTERNS) {
      if (pattern.test(content)) {
        indices.push(i);
        break;
      }
    }
  }
  
  return indices;
}

/**
 * 移除消息中的人工标记（用于显示）
 */
export function removeManualMarkers(text: string): string {
  let cleaned = text;
  for (const { pattern } of MANUAL_MARKER_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// 高级分析
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 分析对话的话题边界
 * 返回建议的分段点
 */
export function analyzeTopicBoundaries(messages: Message[]): number[] {
  const boundaries: number[] = [];
  
  for (let i = 0; i < messages.length; i++) {
    const result = detectBreakpoint(messages[i]);
    
    // 高置信度的断点
    if (result.isBreakpoint && result.confidence >= 0.75) {
      boundaries.push(i);
    }
    
    // 人工标记
    if (result.type === "manual_marker") {
      boundaries.push(i);
    }
  }
  
  return [...new Set(boundaries)].sort((a, b) => a - b);
}

/**
 * 获取断点检测的调试信息
 */
export function getBreakpointDebugInfo(message: Message): {
  content: string;
  result: BreakpointResult;
  contextState: ContextState;
} {
  const content = message.content?.trim() || "";
  const result = detectBreakpoint(message);
  const contextState = analyzeContextState(content);
  
  return { content, result, contextState };
}

// ═══════════════════════════════════════════════════════════════════════════
// 调试接口
// ═══════════════════════════════════════════════════════════════════════════

export const semanticBreakpointDebug = {
  detectBreakpoint,
  findBestBreakpoint,
  isLowPriorityMessage,
  findManualMarkers,
  analyzeTopicBoundaries,
  getBreakpointDebugInfo,
  analyzeContextState,
};

if (typeof window !== "undefined") {
  (window as any).semanticBreakpoint = semanticBreakpointDebug;
}
