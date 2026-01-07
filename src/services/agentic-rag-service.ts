/**
 * Agentic RAG Service
 * 智能检索增强生成 - 让 AI 自主决定检索策略，支持多轮迭代
 * 
 * 与传统 RAG 的区别：
 * - 传统 RAG：检索 → 生成（单次）
 * - Agentic RAG：规划 → 检索 → 反思 → 迭代 → 生成
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
  type: "plan" | "retrieve" | "reflect" | "answer";
  tool?: string;
  args?: Record<string, any>;
  result?: string;
  reasoning?: string;
  confidence?: number;
  timestamp: number;
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
}

/** LLM 调用函数类型 */
export type LLMCaller = (
  prompt: string,
  options?: { temperature?: number; maxTokens?: number }
) => Promise<string>;

// ═══════════════════════════════════════════════════════════════════════════
// Prompt 模板
// ═══════════════════════════════════════════════════════════════════════════

function buildPlanningPrompt(
  userQuery: string,
  previousSteps: RAGStep[],
  enableWebSearch: boolean
): string {
  const stepsSummary = previousSteps.length > 0
    ? `\n\n【已执行的步骤】\n${previousSteps
        .filter(s => s.type === "retrieve" || s.type === "reflect")
        .map((s, i) => {
          if (s.type === "retrieve") {
            return `${i + 1}. 检索 ${s.tool}(${JSON.stringify(s.args)}) → ${s.result?.substring(0, 100)}...`;
          }
          return `${i + 1}. 反思: ${s.reasoning}`;
        })
        .join("\n")}`
    : "";

  const webSearchNote = enableWebSearch
    ? "\n- webSearch: 联网搜索外部信息（需要最新资讯时使用）"
    : "";

  return `你是一个智能检索规划助手。分析用户问题，决定下一步检索策略。

【用户问题】
${userQuery}
${stepsSummary}

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
4. 如果需要最新外部信息（新闻、技术更新等），使用 webSearch
5. 只有在已经执行过检索且确实没有相关信息时，才返回 canAnswer

请返回 JSON 格式的决策（不要包含其他内容）：
{
  "needsRetrieval": true,
  "tool": "工具名",
  "args": { "参数名": "参数值" },
  "reasoning": "选择这个工具的理由"
}

只有在已经检索过且信息充足时，才返回：
{
  "needsRetrieval": false,
  "canAnswer": true,
  "reasoning": "已有足够信息的原因"
}`;
}

function buildReflectionPrompt(
  userQuery: string,
  collectedContext: string,
  lastStep: RAGStep
): string {
  return `评估检索结果是否足以回答用户问题。

【用户问题】
${userQuery}

【最新检索结果】
工具: ${lastStep.tool}
结果: ${lastStep.result?.substring(0, 1500) || "(无结果)"}

【已收集的全部信息】
${collectedContext.substring(0, 3000) || "(无)"}

请评估并返回 JSON（不要包含其他内容）：
{
  "sufficient": true/false,
  "confidence": 0.0-1.0,
  "missingInfo": "如果不充足，说明缺少什么信息",
  "suggestion": "如果需要继续，建议下一步做什么"
}`;
}

function buildAnswerPrompt(
  userQuery: string,
  collectedContext: string,
  steps: RAGStep[]
): string {
  const searchSummary = steps
    .filter(s => s.type === "retrieve")
    .map(s => `- ${s.tool}: ${s.reasoning}`)
    .join("\n");

  return `基于检索到的信息，回答用户问题。

【用户问题】
${userQuery}

【检索过程】
${searchSummary || "(直接回答)"}

【检索到的信息】
${collectedContext || "(无检索结果)"}

【回答要求】
1. 直接用自然语言回答，不要返回 JSON 格式
2. 基于检索到的信息回答，不要编造
3. 如果信息不足，诚实说明并给出建议
4. 引用笔记时保留 [标题](orca-block:id) 格式
5. 使用中文回答
6. 不要包含 "thoughts"、"answer" 等字段，直接输出回答内容`;
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
  } = options;

  const steps: RAGStep[] = [];
  let collectedContext = "";
  let iteration = 0;
  let hitLimit = false;
  
  // 累积的思考过程文本
  let reasoningLog = "";
  
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

    // Step 1: 规划 - 让 AI 决定下一步
    addReasoning("planning", "规划检索策略...", `\n📋 **规划检索策略**\n正在分析需要什么信息...\n`);
    const planningPrompt = buildPlanningPrompt(userQuery, steps, enableWebSearch);
    const planResponse = await callLLM(planningPrompt, { temperature: 0.3, maxTokens: 500 });
    
    let plan = extractJSON(planResponse);
    
    // 如果解析失败且是第一次迭代，使用默认检索策略
    if (!plan && iteration === 1) {
      console.log("[AgenticRAG] Planning parse failed, using default retrieval strategy");
      // 根据问题内容选择默认策略
      const queryLower = userQuery.toLowerCase();
      if (queryLower.includes("日记") || queryLower.includes("最近") || queryLower.includes("今天")) {
        plan = {
          needsRetrieval: true,
          tool: "getRecentJournals",
          args: { days: 7 },
          reasoning: "问题涉及日记/最近内容，需要查询最近的日记记录",
        };
      } else if (queryLower.includes("#")) {
        const tagMatch = userQuery.match(/#(\S+)/);
        plan = {
          needsRetrieval: true,
          tool: "searchBlocksByTag",
          args: { tag_query: tagMatch ? tagMatch[0] : "#" },
          reasoning: "问题包含标签，需要按标签搜索相关笔记",
        };
      } else {
        // 默认全文搜索
        const keywords = userQuery.replace(/[？?！!。，,]/g, " ").trim().split(/\s+/).slice(0, 3).join(" ");
        plan = {
          needsRetrieval: true,
          tool: "searchBlocksByText",
          args: { query: keywords || userQuery.substring(0, 20) },
          reasoning: "需要在笔记中搜索相关内容",
        };
      }
      addReasoning("planning", "使用默认策略", `⚠️ AI 规划解析失败，使用默认策略\n`);
    }
    
    if (!plan) {
      console.warn("[AgenticRAG] Failed to parse planning response, stopping");
      addReasoning("planning", "规划失败", `❌ 无法解析 AI 的规划响应，停止检索\n`);
      break;
    }

    // 记录规划决策
    addReasoning(
      "planning",
      plan.needsRetrieval ? "需要检索" : "信息充足",
      `💡 **决策**: ${plan.reasoning}\n`
    );

    steps.push({
      type: "plan",
      reasoning: plan.reasoning,
      timestamp: Date.now(),
    });

    // 如果不需要检索，跳出循环
    if (!plan.needsRetrieval || plan.canAnswer) {
      console.log("[AgenticRAG] AI decided no more retrieval needed:", plan.reasoning);
      addReasoning("done", "信息收集完成", `\n✅ **信息收集完成**\n${plan.reasoning}\n`);
      break;
    }

    // Step 2: 执行检索
    if (!plan.tool || !plan.args) {
      console.warn("[AgenticRAG] Invalid plan, missing tool or args");
      addReasoning("planning", "规划无效", `❌ 规划缺少工具或参数\n`);
      break;
    }

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
    try {
      toolResult = await executeTool(plan.tool, plan.args);
    } catch (err: any) {
      toolResult = `Error: ${err.message || err}`;
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
    const resultSummary = resultCountMatch 
      ? `找到 ${resultCountMatch[1]} 条结果` 
      : (toolResult.includes("Error") ? "检索出错" : "检索完成");
    
    addReasoning(
      "retrieving",
      resultSummary,
      `📄 **检索结果**: ${resultSummary}\n> ${resultPreview.split('\n').slice(0, 3).join('\n> ')}\n`,
      retrieveStep
    );

    // 累积上下文
    collectedContext += `\n\n--- ${plan.tool} 结果 ---\n${toolResult}`;

    // Step 3: 反思 - 评估结果质量
    if (enableReflection && iteration < maxIterations) {
      addReasoning("reflecting", "评估检索结果...", `\n💭 **评估检索结果**\n正在判断信息是否充足...\n`);
      const reflectionPrompt = buildReflectionPrompt(userQuery, collectedContext, retrieveStep);
      const reflectionResponse = await callLLM(reflectionPrompt, { temperature: 0.2, maxTokens: 300 });
      
      const reflection = extractJSON(reflectionResponse);
      if (reflection) {
        const confidencePercent = Math.round((reflection.confidence || 0) * 100);
        const reflectReasoning = reflection.sufficient 
          ? `信息充足 (置信度: ${confidencePercent}%)`
          : `信息不足: ${reflection.missingInfo || "需要更多信息"}`;
        
        steps.push({
          type: "reflect",
          reasoning: reflectReasoning,
          confidence: reflection.confidence,
          timestamp: Date.now(),
        });

        // 如果信息充足且置信度达标，停止检索
        if (reflection.sufficient && reflection.confidence >= confidenceThreshold) {
          console.log(`[AgenticRAG] Sufficient info with confidence ${reflection.confidence}`);
          addReasoning(
            "done",
            `信息充足 (${confidencePercent}%)`,
            `✅ **评估结果**: 信息充足\n- 置信度: ${confidencePercent}%\n- 可以回答用户问题\n`
          );
          break;
        } else if (!reflection.sufficient) {
          addReasoning(
            "reflecting",
            "需要更多信息",
            `⚠️ **评估结果**: 信息不足\n- 置信度: ${confidencePercent}%\n- 缺少: ${reflection.missingInfo || "更多相关信息"}\n- 建议: ${reflection.suggestion || "继续检索"}\n`
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
  const answerPrompt = buildAnswerPrompt(userQuery, collectedContext, steps);
  const answer = await callLLM(answerPrompt, { temperature: 0.7 });

  steps.push({
    type: "answer",
    result: answer,
    timestamp: Date.now(),
  });

  console.log(`[AgenticRAG] Completed with ${iteration} iterations, ${steps.length} steps`);

  return {
    answer,
    steps,
    collectedContext,
    iterations: iteration,
    hitLimit,
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
 */
export function shouldUseAgenticRAG(query: string): boolean {
  // 复杂查询的启发式规则
  const complexPatterns = [
    /综合|汇总|分析|比较|总结|整理/,
    /最近.{0,10}(和|与|跟).{0,10}关系/,
    /所有.{0,10}(相关|关于)/,
    /根据.{0,10}(查找|搜索|整理)/,
    /有哪些.{0,10}(提到|涉及|关于)/,
    /回顾|复盘|梳理/,
  ];
  
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
          return `[${time}] 🔍 检索 ${step.tool}: ${step.reasoning}`;
        case "reflect":
          return `[${time}] 💭 反思: ${step.reasoning}`;
        case "answer":
          return `[${time}] ✅ 生成答案`;
        default:
          return `[${time}] ${step.type}`;
      }
    })
    .join("\n");
}
