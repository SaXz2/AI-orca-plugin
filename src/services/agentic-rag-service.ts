/**
 * Agentic RAG Service
 * 智能检索增强生成 - 让 AI 自主决定检索策略，支持多轮迭代
 * 
 * 基于 Anthropic "Building Effective Agents" 和 Weaviate 团队的 Agentic Workflow 理论：
 * 
 * 【核心理念】
 * - 传统 RAG：检索 → 生成（单次，确定性流程）
 * - Agentic RAG：规划 → 检索 → 反思 → 迭代 → 生成（自主性流程）
 * 
 * 【三大核心能力】
 * 1. Planning（规划）- 任务分解，将复杂问题拆解为可执行的检索步骤
 * 2. Tool Use（工具使用）- 智能选择和组合多种检索工具
 * 3. Reflection（反思）- 评估检索质量，自我修正，决定是否继续迭代
 * 
 * 【与纯 Agent 的区别】
 * - Agent：完全自主，自由发挥
 * - Agentic Workflow：有预设流程框架，但在框架内具备自主决策能力
 * 
 * 注意：此功能会增加 token 消耗（多次 LLM 调用）
 */

import { executeTool } from "./ai-tools";
import { isWebSearchEnabled } from "../store/tool-store";

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

export interface AgenticRAGOptions {
  /** 最大迭代次数（防止无限循环），默认 5 */
  maxIterations?: number;
  /** 是否启用反思机制，默认 true */
  enableReflection?: boolean;
  /** 是否启用联网搜索 */
  enableWebSearch?: boolean;
  /** 置信度阈值（0-1），低于此值继续检索，默认 0.7 */
  confidenceThreshold?: number;
  /** 进度回调，用于实时更新 UI */
  onProgress?: (update: RAGProgressUpdate) => void;
  /** 是否启用多步骤规划（一次规划多个检索步骤），默认 false */
  enableMultiStepPlanning?: boolean;
  /** 是否启用自我修正（检索失败时调整策略），默认 true */
  enableSelfCorrection?: boolean;
}

/** 进度更新类型 */
export interface RAGProgressUpdate {
  /** 当前阶段 */
  phase: "analyzing" | "planning" | "retrieving" | "reflecting" | "answering" | "done";
  /** 简短状态文字 */
  status: string;
  /** 详细思考过程（累积） */
  reasoning: string;
  /** 当前步骤信息 */
  step?: RAGStep;
  /** 当前迭代轮数 */
  iteration?: number;
}

export interface RAGStep {
  type: "plan" | "retrieve" | "reflect" | "answer" | "correct";
  tool?: string;
  args?: Record<string, any>;
  result?: string;
  reasoning?: string;
  confidence?: number;
  timestamp: number;
  /** 是否为修正步骤（自我修正后的重试） */
  isCorrection?: boolean;
  /** 修正原因（如果是修正步骤） */
  correctionReason?: string;
}

export interface RAGResult {
  /** 最终答案 */
  answer: string;
  /** 执行步骤记录 */
  steps: RAGStep[];
  /** 收集到的上下文 */
  collectedContext: string;
  /** 总迭代次数 */
  iterations: number;
  /** 是否因达到上限而停止 */
  hitLimit: boolean;
  /** 检索策略摘要 */
  strategySummary?: string;
}

/** LLM 调用函数类型 */
export type LLMCaller = (
  prompt: string,
  options?: { temperature?: number; maxTokens?: number }
) => Promise<string>;

/** 检索记忆 - 记录已尝试的检索策略，避免重复 */
interface RetrievalMemory {
  /** 已使用的工具和参数组合 */
  usedStrategies: Set<string>;
  /** 失败的策略（用于自我修正） */
  failedStrategies: Map<string, string>;
  /** 成功获取信息的策略 */
  successfulStrategies: string[];
  /** 累积的关键信息点 */
  keyFindings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt 模板
// ═══════════════════════════════════════════════════════════════════════════

function buildPlanningPrompt(
  userQuery: string,
  previousSteps: RAGStep[],
  enableWebSearch: boolean,
  memory: RetrievalMemory
): string {
  const stepsSummary = previousSteps.length > 0
    ? `\n\n【已执行的步骤】\n${previousSteps
        .filter(s => s.type === "retrieve" || s.type === "reflect" || s.type === "correct")
        .map((s, i) => {
          if (s.type === "retrieve") {
            const status = s.result?.includes("Error") ? "❌" : (s.result?.includes("No ") ? "⚠️" : "✅");
            return `${i + 1}. ${status} 检索 ${s.tool}(${JSON.stringify(s.args)}) → ${s.result?.substring(0, 100)}...`;
          }
          if (s.type === "correct") {
            return `${i + 1}. 🔄 修正策略: ${s.correctionReason}`;
          }
          return `${i + 1}. 💭 反思: ${s.reasoning}`;
        })
        .join("\n")}`
    : "";

  // 显示已尝试过的策略，避免重复
  const triedStrategies = memory.usedStrategies.size > 0
    ? `\n\n【已尝试的策略】（请勿重复）\n${Array.from(memory.usedStrategies).slice(-5).join("\n")}`
    : "";

  // 显示失败的策略，帮助 AI 调整
  const failedInfo = memory.failedStrategies.size > 0
    ? `\n\n【失败的策略】（请避免或调整）\n${Array.from(memory.failedStrategies.entries()).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
    : "";

  // 显示已发现的关键信息
  const findingsInfo = memory.keyFindings.length > 0
    ? `\n\n【已发现的关键信息】\n${memory.keyFindings.slice(-3).map(f => `- ${f}`).join("\n")}`
    : "";

  // 检查是否已经尝试过本地检索但没有结果
  const localSearchFailed = memory.failedStrategies.size > 0 && 
    Array.from(memory.failedStrategies.keys()).some(k => 
      k.startsWith("searchBlocksByText:") || k.startsWith("searchBlocksByTag:") || k.startsWith("getRecentJournals:")
    );

  const webSearchNote = enableWebSearch
    ? "\n- webSearch: 联网搜索外部信息（当本地笔记找不到答案、需要外部知识或最新资讯时使用）"
    : "";

  // 根据是否有本地搜索失败，调整决策规则
  const webSearchGuidance = enableWebSearch && localSearchFailed
    ? `\n8. **重要**：本地笔记中未找到相关信息，请使用 webSearch 联网搜索获取答案`
    : (enableWebSearch 
        ? `\n8. 如果问题涉及外部知识（人物、事件、概念等）且本地笔记可能没有，优先使用 webSearch`
        : "");

  return `你是一个智能检索规划助手。分析用户问题，决定下一步检索策略。

【用户问题】
${userQuery}
${stepsSummary}${triedStrategies}${failedInfo}${findingsInfo}

【可用的检索工具】
- searchBlocksByTag: 按标签搜索（用户提到 #标签 时）
- searchBlocksByText: 全文搜索笔记内容
- query_blocks_by_tag: 按标签+属性条件搜索（如 Status=Done）
- query_blocks: 组合多条件搜索
- getRecentJournals: 获取最近日记（days 参数，最大 7）
- getTodayJournal: 获取今天日记
- getJournalByDate: 获取指定日期日记
- searchBlocksByReference: 搜索引用某页面的笔记
- getPage: 读取指定页面内容${webSearchNote}

【决策规则】
1. 首次收到问题时，必须先检索相关信息，不要直接说"信息不足"
2. 如果问题涉及用户个人笔记/日记/学习记录，优先使用 getRecentJournals 或 searchBlocksByText
3. 如果问题涉及特定标签，使用 searchBlocksByTag
4. 如果问题涉及外部知识（人物、动漫、游戏、历史、科学等），且启用了 webSearch，应该使用 webSearch
5. 如果之前的本地检索没有结果，且问题需要外部知识，必须使用 webSearch（如果可用）
6. 不要重复使用完全相同的工具和参数组合
7. 只有在已经执行过检索且确实没有相关信息时，才返回 canAnswer${webSearchGuidance}

请返回 JSON 格式的决策（不要包含其他内容）：
{
  "needsRetrieval": true,
  "tool": "工具名",
  "args": { "参数名": "参数值" },
  "reasoning": "选择这个工具的理由",
  "expectedInfo": "期望获取什么信息"
}

只有在已经检索过且信息充足时，才返回：
{
  "needsRetrieval": false,
  "canAnswer": true,
  "reasoning": "已有足够信息的原因",
  "keyPoints": ["关键信息点1", "关键信息点2"]
}`;
}

function buildReflectionPrompt(
  userQuery: string,
  collectedContext: string,
  lastStep: RAGStep,
  memory: RetrievalMemory
): string {
  const findingsContext = memory.keyFindings.length > 0
    ? `\n\n【已确认的关键发现】\n${memory.keyFindings.map(f => `- ${f}`).join("\n")}`
    : "";

  return `评估检索结果是否足以回答用户问题。

【用户问题】
${userQuery}

【最新检索结果】
工具: ${lastStep.tool}
参数: ${JSON.stringify(lastStep.args)}
结果: ${lastStep.result?.substring(0, 1500) || "(无结果)"}

【已收集的全部信息】
${collectedContext.substring(0, 3000) || "(无)"}
${findingsContext}

【评估要点】
1. 检索结果是否与问题相关？
2. 信息是否完整，能否回答用户的核心问题？
3. 是否需要补充其他角度的信息？
4. 如果信息不足，具体缺少什么？

请评估并返回 JSON（不要包含其他内容）：
{
  "sufficient": true/false,
  "confidence": 0.0-1.0,
  "relevance": "high/medium/low/none",
  "keyFindings": ["从本次检索中提取的关键信息点"],
  "missingInfo": "如果不充足，说明缺少什么信息",
  "suggestion": "如果需要继续，建议下一步做什么",
  "shouldCorrect": false,
  "correctionReason": "如果需要修正策略，说明原因"
}`;
}

function buildAnswerPrompt(
  userQuery: string,
  collectedContext: string,
  steps: RAGStep[],
  memory: RetrievalMemory
): string {
  const searchSummary = steps
    .filter(s => s.type === "retrieve")
    .map(s => {
      const status = s.result?.includes("Error") ? "❌" : (s.result?.includes("No ") ? "⚠️" : "✅");
      return `- ${status} ${s.tool}: ${s.reasoning}`;
    })
    .join("\n");

  const keyFindingsSummary = memory.keyFindings.length > 0
    ? `\n\n【关键发现摘要】\n${memory.keyFindings.map(f => `- ${f}`).join("\n")}`
    : "";

  // 检查是否有成功的检索
  const hasSuccessfulRetrieval = steps.some(s => 
    s.type === "retrieve" && s.result && !s.result.includes("Error") && !s.result.includes("No ")
  );

  return `基于检索到的信息，回答用户问题。

【用户问题】
${userQuery}

【检索过程】
${searchSummary || "(直接回答)"}
${keyFindingsSummary}

【检索到的信息】
${collectedContext || "(无检索结果)"}

【回答要求】
1. 直接用自然语言回答，不要返回 JSON 格式
2. 基于检索到的信息回答，不要编造
3. 如果信息不足，诚实说明并给出建议
4. 引用笔记时保留 [标题](orca-block:id) 格式
5. 使用中文回答
6. 不要包含 "thoughts"、"answer" 等字段，直接输出回答内容
7. 如果有多个相关笔记，可以综合整理后回答

【禁止事项】
- 绝对不要说"无法访问互联网"、"无法联网搜索"、"无法为您搜索"等
- 不要说"我处于XX模式"、"我目前只能提供信息"等
- 不要建议用户"自己去搜索引擎搜索"
- 如果没有找到信息，直接说"在笔记中未找到相关信息"即可`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 核心服务
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 从文本中提取 JSON
 */
function extractJSON(text: string): any {
  if (!text || !text.trim()) {
    console.warn("[AgenticRAG] extractJSON: empty input");
    return null;
  }
  
  const trimmed = text.trim();
  console.log("[AgenticRAG] extractJSON input:", trimmed.substring(0, 200));
  
  // 尝试直接解析
  try {
    return JSON.parse(trimmed);
  } catch {
    // 继续尝试其他方式
  }
  
  // 尝试提取 ```json ... ``` 代码块
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      console.log("[AgenticRAG] extractJSON: parsed from code block");
      return parsed;
    } catch {
      // 继续尝试
    }
  }
  
  // 尝试提取 { ... } 对象
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      console.log("[AgenticRAG] extractJSON: parsed from object match");
      return parsed;
    } catch {
      // 继续尝试
    }
  }
  
  // 尝试修复常见的 JSON 格式问题
  // 1. 移除尾部逗号
  // 2. 处理单引号
  const fixedText = trimmed
    .replace(/,\s*([}\]])/g, '$1')  // 移除尾部逗号
    .replace(/'/g, '"');  // 单引号转双引号
  
  const fixedMatch = fixedText.match(/\{[\s\S]*\}/);
  if (fixedMatch) {
    try {
      const parsed = JSON.parse(fixedMatch[0]);
      console.log("[AgenticRAG] extractJSON: parsed after fixing");
      return parsed;
    } catch {
      // 放弃
    }
  }
  
  console.warn("[AgenticRAG] extractJSON: failed to parse:", trimmed.substring(0, 300));
  return null;
}

/**
 * 根据问题内容构建默认检索计划
 */
function buildDefaultPlan(userQuery: string, enableWebSearch: boolean = false): any {
  const queryLower = userQuery.toLowerCase();
  
  // 检测是否是需要外部知识的问题（人物、动漫、游戏、历史、科学等）
  const externalKnowledgePatterns = [
    /谁是|是谁|什么是|是什么/,  // 定义类问题
    /介绍一下|讲讲|说说/,  // 介绍类问题
    /红A|Fate|动漫|番剧|游戏|电影|小说|漫画/i,  // 娱乐内容
    /历史|科学|技术|编程|代码/,  // 知识类
    /最新|新闻|消息|更新/,  // 时效性内容
  ];
  
  const needsExternalKnowledge = externalKnowledgePatterns.some(p => p.test(userQuery));
  
  // 如果启用了 webSearch 且问题需要外部知识，优先使用 webSearch
  if (enableWebSearch && needsExternalKnowledge) {
    // 提取搜索关键词
    const keywords = userQuery
      .replace(/[？?！!。，,、：:""''（）()【】\[\]谁是什么介绍一下讲讲说说]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 1)
      .slice(0, 5)
      .join(" ");
    
    return {
      needsRetrieval: true,
      tool: "webSearch",
      args: { query: keywords || userQuery.substring(0, 30) },
      reasoning: "问题涉及外部知识，需要联网搜索获取信息",
      expectedInfo: `关于 "${keywords || userQuery.substring(0, 30)}" 的信息`,
    };
  }
  
  // 日记相关
  if (queryLower.includes("日记") || queryLower.includes("最近") || queryLower.includes("今天")) {
    if (queryLower.includes("今天") || queryLower.includes("今日")) {
      return {
        needsRetrieval: true,
        tool: "getTodayJournal",
        args: { includeChildren: true },
        reasoning: "问题涉及今天的日记，获取今日日记内容",
        expectedInfo: "今天的日记记录",
      };
    }
    return {
      needsRetrieval: true,
      tool: "getRecentJournals",
      args: { days: 7 },
      reasoning: "问题涉及日记/最近内容，需要查询最近的日记记录",
      expectedInfo: "最近7天的日记内容",
    };
  }
  
  // 标签相关
  if (queryLower.includes("#")) {
    const tagMatch = userQuery.match(/#(\S+)/);
    return {
      needsRetrieval: true,
      tool: "searchBlocksByTag",
      args: { tag_query: tagMatch ? tagMatch[0] : "#" },
      reasoning: "问题包含标签，需要按标签搜索相关笔记",
      expectedInfo: `带有 ${tagMatch ? tagMatch[0] : "标签"} 的笔记`,
    };
  }
  
  // 页面引用相关
  const pageRefMatch = userQuery.match(/\[\[([^\]]+)\]\]/);
  if (pageRefMatch) {
    return {
      needsRetrieval: true,
      tool: "getPage",
      args: { pageName: pageRefMatch[1] },
      reasoning: "问题引用了特定页面，需要获取该页面内容",
      expectedInfo: `页面 [[${pageRefMatch[1]}]] 的内容`,
    };
  }
  
  // 默认全文搜索
  const keywords = userQuery
    .replace(/[？?！!。，,、：:""''（）()【】\[\]]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 3)
    .join(" ");
  
  return {
    needsRetrieval: true,
    tool: "searchBlocksByText",
    args: { query: keywords || userQuery.substring(0, 20) },
    reasoning: "需要在笔记中搜索相关内容",
    expectedInfo: `包含关键词 "${keywords || userQuery.substring(0, 20)}" 的笔记`,
  };
}

/**
 * 执行 Agentic RAG 流程
 */
export async function executeAgenticRAG(
  userQuery: string,
  callLLM: LLMCaller,
  options: AgenticRAGOptions = {}
): Promise<RAGResult> {
  const {
    maxIterations = 5,
    enableReflection = true,
    enableWebSearch = isWebSearchEnabled(),
    confidenceThreshold = 0.7,
    onProgress,
    enableSelfCorrection = true,
  } = options;

  const steps: RAGStep[] = [];
  let collectedContext = "";
  let iteration = 0;
  let hitLimit = false;
  
  // 初始化检索记忆
  const memory: RetrievalMemory = {
    usedStrategies: new Set(),
    failedStrategies: new Map(),
    successfulStrategies: [],
    keyFindings: [],
  };
  
  // 累积的思考过程文本
  let reasoningLog = "";
  
  // 辅助函数：生成策略标识（用于去重）
  const getStrategyKey = (tool: string, args: Record<string, any>): string => {
    return `${tool}:${JSON.stringify(args)}`;
  };
  
  // 辅助函数：添加思考日志并通知 UI
  const addReasoning = (
    phase: RAGProgressUpdate["phase"],
    status: string,
    text: string,
    step?: RAGStep
  ) => {
    reasoningLog += text + "\n";
    onProgress?.({
      phase,
      status,
      reasoning: reasoningLog,
      step,
      iteration,
    });
  };

  console.log("[AgenticRAG] Starting with query:", userQuery);
  addReasoning("analyzing", "分析问题中...", `🧠 **分析用户问题**\n> ${userQuery}\n`);

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[AgenticRAG] Iteration ${iteration}/${maxIterations}`);
    
    if (iteration > 1) {
      addReasoning("planning", `第 ${iteration} 轮检索...`, `\n---\n\n🔄 **第 ${iteration} 轮检索**\n`);
    }

    // Step 1: 规划 - 让 AI 决定下一步（传入 memory 帮助避免重复）
    addReasoning("planning", "规划检索策略...", `\n📋 **规划检索策略**\n正在分析需要什么信息...\n`);
    const planningPrompt = buildPlanningPrompt(userQuery, steps, enableWebSearch, memory);
    const planResponse = await callLLM(planningPrompt, { temperature: 0.3, maxTokens: 600 });
    
    let plan = extractJSON(planResponse);
    
    // 如果解析失败且是第一次迭代，使用默认检索策略
    if (!plan && iteration === 1) {
      console.log("[AgenticRAG] Planning parse failed, using default retrieval strategy");
      plan = buildDefaultPlan(userQuery, enableWebSearch);
      addReasoning("planning", "使用默认策略", `⚠️ AI 规划解析失败，使用默认策略\n`);
    }
    
    if (!plan) {
      console.warn("[AgenticRAG] Failed to parse planning response, stopping");
      addReasoning("planning", "规划失败", `❌ 无法解析 AI 的规划响应，停止检索\n`);
      break;
    }

    // 记录规划决策
    const expectedInfo = plan.expectedInfo ? `\n   期望获取: ${plan.expectedInfo}` : "";
    addReasoning(
      "planning",
      plan.needsRetrieval ? "需要检索" : "信息充足",
      `💡 **决策**: ${plan.reasoning}${expectedInfo}\n`
    );

    steps.push({
      type: "plan",
      reasoning: plan.reasoning,
      timestamp: Date.now(),
    });

    // 如果不需要检索，跳出循环
    if (!plan.needsRetrieval || plan.canAnswer) {
      console.log("[AgenticRAG] AI decided no more retrieval needed:", plan.reasoning);
      // 记录关键信息点
      if (plan.keyPoints && Array.isArray(plan.keyPoints)) {
        memory.keyFindings.push(...plan.keyPoints);
      }
      addReasoning("done", "信息收集完成", `\n✅ **信息收集完成**\n${plan.reasoning}\n`);
      break;
    }

    // Step 2: 执行检索
    if (!plan.tool || !plan.args) {
      console.warn("[AgenticRAG] Invalid plan, missing tool or args");
      addReasoning("planning", "规划无效", `❌ 规划缺少工具或参数\n`);
      break;
    }

    // 检查是否重复策略
    const strategyKey = getStrategyKey(plan.tool, plan.args);
    if (memory.usedStrategies.has(strategyKey)) {
      console.log("[AgenticRAG] Duplicate strategy detected, skipping:", strategyKey);
      addReasoning("planning", "跳过重复策略", `⏭️ 跳过重复的检索策略: ${plan.tool}\n`);
      continue;
    }
    memory.usedStrategies.add(strategyKey);

    // 显示正在执行的工具
    const toolDisplayName = getToolDisplayName(plan.tool);
    const argsStr = JSON.stringify(plan.args, null, 2);
    addReasoning(
      "retrieving",
      `${toolDisplayName}...`,
      `\n🔍 **执行检索: ${toolDisplayName}**\n\`\`\`json\n${argsStr}\n\`\`\`\n`
    );

    console.log(`[AgenticRAG] Executing tool: ${plan.tool}`, plan.args);
    
    let toolResult: string;
    let isError = false;
    try {
      toolResult = await executeTool(plan.tool, plan.args);
      isError = toolResult.includes("Error:");
    } catch (err: any) {
      toolResult = `Error: ${err.message || err}`;
      isError = true;
      console.error("[AgenticRAG] Tool execution failed:", err);
    }

    const retrieveStep: RAGStep = {
      type: "retrieve",
      tool: plan.tool,
      args: plan.args,
      result: toolResult,
      reasoning: plan.reasoning,
      timestamp: Date.now(),
    };
    steps.push(retrieveStep);

    // 显示检索结果摘要
    const resultPreview = toolResult.length > 300 
      ? toolResult.substring(0, 300) + "..." 
      : toolResult;
    const resultCountMatch = toolResult.match(/Found (\d+)/);
    const hasNoResults = toolResult.includes("No blocks found") || toolResult.includes("No journal");
    const resultSummary = isError 
      ? "检索出错" 
      : (hasNoResults ? "未找到结果" : (resultCountMatch ? `找到 ${resultCountMatch[1]} 条结果` : "检索完成"));
    
    addReasoning(
      "retrieving",
      resultSummary,
      `📄 **检索结果**: ${resultSummary}\n> ${resultPreview.split('\n').slice(0, 3).join('\n> ')}\n`,
      retrieveStep
    );

    // 记录成功/失败策略
    if (isError || hasNoResults) {
      memory.failedStrategies.set(strategyKey, resultSummary);
    } else {
      memory.successfulStrategies.push(strategyKey);
      // 累积上下文（只累积有结果的）
      collectedContext += `\n\n--- ${plan.tool} 结果 ---\n${toolResult}`;
    }

    // Step 3: 反思 - 评估结果质量
    if (enableReflection && iteration < maxIterations) {
      addReasoning("reflecting", "评估检索结果...", `\n💭 **评估检索结果**\n正在判断信息是否充足...\n`);
      const reflectionPrompt = buildReflectionPrompt(userQuery, collectedContext, retrieveStep, memory);
      const reflectionResponse = await callLLM(reflectionPrompt, { temperature: 0.2, maxTokens: 400 });
      
      const reflection = extractJSON(reflectionResponse);
      if (reflection) {
        const confidencePercent = Math.round((reflection.confidence || 0) * 100);
        const relevanceMap: Record<string, string> = { high: "🎯", medium: "📍", low: "📌", none: "❌" };
        const relevanceKey = (reflection.relevance || "medium") as string;
        const relevanceEmoji = relevanceMap[relevanceKey] || "📍";
        
        // 提取关键发现
        if (reflection.keyFindings && Array.isArray(reflection.keyFindings)) {
          memory.keyFindings.push(...reflection.keyFindings);
        }
        
        const reflectReasoning = reflection.sufficient 
          ? `信息充足 (置信度: ${confidencePercent}%)`
          : `信息不足: ${reflection.missingInfo || "需要更多信息"}`;
        
        steps.push({
          type: "reflect",
          reasoning: reflectReasoning,
          confidence: reflection.confidence,
          timestamp: Date.now(),
        });

        // 自我修正：如果需要调整策略
        if (enableSelfCorrection && reflection.shouldCorrect && reflection.correctionReason) {
          console.log("[AgenticRAG] Self-correction triggered:", reflection.correctionReason);
          steps.push({
            type: "correct",
            reasoning: reflection.correctionReason,
            correctionReason: reflection.correctionReason,
            isCorrection: true,
            timestamp: Date.now(),
          });
          addReasoning(
            "reflecting",
            "调整策略",
            `🔄 **策略修正**: ${reflection.correctionReason}\n`
          );
        }

        // 如果信息充足且置信度达标，停止检索
        if (reflection.sufficient && reflection.confidence >= confidenceThreshold) {
          console.log(`[AgenticRAG] Sufficient info with confidence ${reflection.confidence}`);
          addReasoning(
            "done",
            `信息充足 (${confidencePercent}%)`,
            `✅ **评估结果**: 信息充足\n- 置信度: ${confidencePercent}%\n- 相关性: ${relevanceEmoji} ${reflection.relevance || "medium"}\n- 可以回答用户问题\n`
          );
          break;
        } else if (!reflection.sufficient) {
          addReasoning(
            "reflecting",
            "需要更多信息",
            `⚠️ **评估结果**: 信息不足\n- 置信度: ${confidencePercent}%\n- 相关性: ${relevanceEmoji} ${reflection.relevance || "medium"}\n- 缺少: ${reflection.missingInfo || "更多相关信息"}\n- 建议: ${reflection.suggestion || "继续检索"}\n`
          );
        }
      }
    }
  }

  if (iteration >= maxIterations) {
    hitLimit = true;
    console.log("[AgenticRAG] Hit max iterations limit");
    addReasoning("done", "达到最大轮数", `\n⚠️ **达到最大检索轮数** (${maxIterations} 轮)\n将基于已收集的信息生成回答\n`);
  }

  // Step 4: 生成最终答案
  addReasoning("answering", "生成回答中...", `\n✍️ **正在生成回答**\n基于收集到的信息整理答案...\n`);
  const answerPrompt = buildAnswerPrompt(userQuery, collectedContext, steps, memory);
  const answer = await callLLM(answerPrompt, { temperature: 0.7 });

  steps.push({
    type: "answer",
    result: answer,
    timestamp: Date.now(),
  });

  // 生成策略摘要
  const strategySummary = [
    `成功策略: ${memory.successfulStrategies.length}`,
    `失败策略: ${memory.failedStrategies.size}`,
    `关键发现: ${memory.keyFindings.length}`,
  ].join(" | ");

  console.log(`[AgenticRAG] Completed with ${iteration} iterations, ${steps.length} steps`);
  console.log(`[AgenticRAG] Strategy summary: ${strategySummary}`);

  return {
    answer,
    steps,
    collectedContext,
    iterations: iteration,
    hitLimit,
    strategySummary,
  };
}

/**
 * 获取工具的中文显示名称
 */
export function getToolDisplayName(toolName: string): string {
  const names: Record<string, string> = {
    searchBlocksByTag: "搜索标签",
    searchBlocksByText: "全文搜索",
    query_blocks_by_tag: "标签属性查询",
    query_blocks: "组合查询",
    getRecentJournals: "获取最近日记",
    getTodayJournal: "获取今日日记",
    getJournalByDate: "获取指定日期日记",
    getJournalsByDateRange: "获取日期范围日记",
    searchBlocksByReference: "搜索引用",
    getPage: "读取页面",
    getBlock: "读取块",
    webSearch: "联网搜索",
  };
  return names[toolName] || toolName;
}

/**
 * 判断问题是否适合使用 Agentic RAG
 * 用于自动模式下的启发式判断
 * 
 * Agentic RAG 适合：
 * - 需要多步骤检索的复杂问题
 * - 需要综合多个来源信息的问题
 * - 需要反思和迭代优化的问题
 */
export function shouldUseAgenticRAG(query: string): boolean {
  // 复杂查询的启发式规则
  const complexPatterns = [
    // 综合分析类
    /综合|汇总|分析|比较|总结|整理|梳理|回顾|复盘/,
    // 多条件查询
    /最近.{0,10}(和|与|跟).{0,10}关系/,
    /所有.{0,10}(相关|关于)/,
    /根据.{0,10}(查找|搜索|整理)/,
    /有哪些.{0,10}(提到|涉及|关于)/,
    // 时间范围查询
    /这(周|月|段时间).{0,10}(写|记|做|学)/,
    /过去.{0,5}(天|周|月)/,
    // 多角度问题
    /从.{0,10}角度/,
    /不同.{0,10}(方面|维度)/,
    // 深度问题
    /详细.{0,10}(说明|解释|分析)/,
    /深入.{0,10}(了解|分析)/,
  ];
  
  // 简单查询的排除规则（这些用普通工具调用更高效）
  const simplePatterns = [
    /^(打开|查看|读取)\s*\[\[.+\]\]$/,  // 直接打开页面
    /^今天(的)?日记$/,  // 简单日记查询
    /^#\S+\s*$/,  // 单纯标签查询
  ];
  
  // 如果匹配简单模式，不使用 Agentic RAG
  if (simplePatterns.some(p => p.test(query))) {
    return false;
  }
  
  // 如果匹配复杂模式，使用 Agentic RAG
  return complexPatterns.some(p => p.test(query));
}

/**
 * 格式化 RAG 步骤为可读文本（用于调试或展示）
 */
export function formatRAGSteps(steps: RAGStep[]): string {
  return steps
    .map((step, i) => {
      const time = new Date(step.timestamp).toLocaleTimeString();
      switch (step.type) {
        case "plan":
          return `[${time}] 📋 规划: ${step.reasoning}`;
        case "retrieve":
          const status = step.result?.includes("Error") ? "❌" : 
                        (step.result?.includes("No ") ? "⚠️" : "✅");
          return `[${time}] 🔍 ${status} 检索 ${step.tool}: ${step.reasoning}`;
        case "reflect":
          return `[${time}] 💭 反思: ${step.reasoning}`;
        case "correct":
          return `[${time}] 🔄 修正: ${step.correctionReason || step.reasoning}`;
        case "answer":
          return `[${time}] ✅ 生成答案`;
        default:
          return `[${time}] ${step.type}`;
      }
    })
    .join("\n");
}
