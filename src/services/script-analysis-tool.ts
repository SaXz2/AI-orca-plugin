/**
 * Script Analysis Tool for AI
 * 
 * 为 AI 提供数据分析能力的工具定义和实现。
 * 让 AI 可以通过执行代码来分析数据、进行计算。
 * 支持 JavaScript 和 Python（通过 Pyodide）
 */

import type { OpenAITool } from "./openai-client";
import {
  executeScript,
  checkScriptEnvironment,
  formatExecutionResult,
  getNotesDataForAnalysis,
  analyzeNotesStats,
  searchKeywordOccurrences,
  analyzeWordFrequency,
  type ScriptExecutionResult,
} from "./script-executor-service";
import {
  executePython,
  isPyodideLoaded,
  isPyodideLoading,
} from "./pyodide-executor";

/**
 * 笔记统计分析工具定义
 */
export const NOTES_STATS_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "analyzeNotesStats",
    description: `统计笔记库的整体数据。

【返回数据】
- totalBlocks: 总块数
- totalCharacters: 总字符数
- totalWords: 总词数
- blocksByType: 按类型分类的块数量
- recentActivity: 最近活动（今天/本周/本月修改的块数）

【何时使用】
- 用户问"我写了多少笔记"、"我的笔记库有多大"
- 需要了解笔记库整体情况
- 统计写作量`,
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

/**
 * 关键词搜索统计工具定义
 */
export const KEYWORD_SEARCH_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "searchKeywordOccurrences",
    description: `统计某个关键词在笔记中出现的次数。

【参数】
- keyword: 要搜索的关键词

【返回数据】
- totalOccurrences: 总出现次数
- blocksWithKeyword: 包含该词的块数
- topBlocks: 出现次数最多的前10个块

【何时使用】
- 用户问"某个词出现了多少次"
- 需要精确统计关键词频率
- 查找某个主题的相关笔记数量`,
    parameters: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "要搜索的关键词",
        },
      },
      required: ["keyword"],
    },
  },
};

/**
 * 词频分析工具定义
 */
export const WORD_FREQUENCY_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "analyzeWordFrequency",
    description: `分析笔记中的词频分布。

【参数】
- topN: 返回前N个高频词，默认50

【返回数据】
- totalWords: 总词数
- uniqueWords: 不重复词数
- topWords: 高频词列表（词和出现次数）

【何时使用】
- 用户问"我最常用的词是什么"
- 分析写作习惯和主题偏好
- 了解笔记内容分布`,
    parameters: {
      type: "object",
      properties: {
        topN: {
          type: "number",
          description: "返回前N个高频词，默认50",
        },
      },
    },
  },
};

/**
 * 自定义分析脚本工具定义
 */
export const CUSTOM_ANALYSIS_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "executeCustomAnalysis",
    description: `执行自定义 JavaScript 分析代码来处理笔记数据。

【何时使用】
- 预置工具无法满足的复杂分析需求
- 需要自定义统计逻辑
- 需要组合多种分析

【可用变量】
- notesData: 笔记数据数组，每个元素包含 { id, content, created, modified, type, tags }
- console.log(): 输出结果

【代码示例】
\`\`\`javascript
// 统计包含"重要"的笔记数量
let count = 0;
for (const note of notesData) {
  if (note.content && note.content.includes("重要")) {
    count++;
  }
}
console.log({ importantNotes: count });
\`\`\`

【注意】
- 代码在沙箱中执行，只能访问 notesData 和基本 JS 功能
- 执行超时 30 秒
- 使用 console.log 输出结果`,
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要执行的 JavaScript 分析代码",
        },
        description: {
          type: "string",
          description: "分析目的的简短描述",
        },
      },
      required: ["code"],
    },
  },
};

/**
 * 通用代码执行工具 - Code Interpreter
 * 让 AI 可以写 JS 代码来解决计算、数据处理等问题
 */
export const CODE_INTERPRETER_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "runCode",
    description: `执行 JavaScript 代码来完成计算、数据处理等任务。类似 Code Interpreter。

【何时使用】
- 数学计算：BMI、贷款利息、单位换算、复杂公式
- 日期计算：两个日期相差多少天、某天是星期几
- 数据处理：排序、过滤、统计、格式转换
- 字符串处理：提取、替换、编码解码
- 任何需要精确计算而非估算的场景

【可用功能】
- Math：所有数学函数（Math.sqrt, Math.pow, Math.sin 等）
- Date：日期处理
- JSON：JSON 解析和序列化
- String/Array/Object：标准方法
- console.log()：输出结果

【注意】
- 代码在安全沙箱中执行
- 不能访问网络、文件系统
- 超时 30 秒
- 用 console.log 输出结果`,
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要执行的 JavaScript 代码",
        },
      },
      required: ["code"],
    },
  },
};

/**
 * Python 代码执行工具 - 使用 Pyodide 在浏览器中运行 Python
 */
export const PYTHON_INTERPRETER_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "runPython",
    description: `执行 Python 代码来完成计算、数据处理等任务。

【特点】
- 使用 Pyodide 在浏览器中运行真正的 Python
- 无需用户安装 Python，开箱即用
- 首次使用需要加载运行时（约10MB，会缓存）

【何时使用】
- 复杂数学计算、科学计算
- 数据分析和处理
- 字符串处理、正则表达式
- 任何需要 Python 语法的场景
- 用户明确要求用 Python

【可用功能】
- Python 标准库（math, datetime, json, re, collections 等）
- 可加载 numpy, pandas 等科学计算库
- print() 输出结果

【代码示例】
\`\`\`python
# BMI 计算
weight = 70  # kg
height = 1.75  # m
bmi = weight / (height ** 2)
if bmi < 18.5:
    category = "偏瘦"
elif bmi < 24:
    category = "正常"
elif bmi < 28:
    category = "偏胖"
else:
    category = "肥胖"
print(f"BMI: {bmi:.2f}, 分类: {category}")
\`\`\`

\`\`\`python
# 等额本息贷款计算
from math import pow

principal = 1000000  # 贷款本金 100万
annual_rate = 0.042  # 年利率 4.2%
months = 360  # 贷款期限 30年

monthly_rate = annual_rate / 12
monthly_payment = principal * monthly_rate * pow(1 + monthly_rate, months) / (pow(1 + monthly_rate, months) - 1)
total_payment = monthly_payment * months
total_interest = total_payment - principal

print(f"月供: {monthly_payment:.2f} 元")
print(f"总还款: {total_payment:.2f} 元")
print(f"总利息: {total_interest:.2f} 元")
\`\`\`

【注意】
- 首次执行需要加载 Pyodide（约5-10秒）
- 不能访问本地文件系统
- 用 print() 输出结果`,
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要执行的 Python 代码",
        },
      },
      required: ["code"],
    },
  },
};

/**
 * 执行笔记统计分析
 */
export async function executeNotesStatsTool(): Promise<string> {
  console.log("[ScriptAnalysisTool] Executing analyzeNotesStats");

  try {
    const stats = await analyzeNotesStats();
    
    return `✅ 笔记库统计分析完成

**整体数据：**
- 📝 总块数：${stats.totalBlocks.toLocaleString()}
- 📊 总字符数：${stats.totalCharacters.toLocaleString()}
- 📖 总词数：${stats.totalWords.toLocaleString()}

**块类型分布：**
${Object.entries(stats.blocksByType)
  .sort((a, b) => b[1] - a[1])
  .map(([type, count]) => `- ${type}: ${count.toLocaleString()}`)
  .join("\n")}

**最近活动：**
- 今天修改：${stats.recentActivity.today} 个块
- 本周修改：${stats.recentActivity.thisWeek} 个块
- 本月修改：${stats.recentActivity.thisMonth} 个块`;
  } catch (e: any) {
    console.error("[ScriptAnalysisTool] Error:", e);
    return `❌ 分析失败：${e.message}`;
  }
}

/**
 * 执行关键词搜索统计
 */
export async function executeKeywordSearchTool(args: { keyword: string }): Promise<string> {
  const { keyword } = args;
  
  if (!keyword || keyword.trim() === "") {
    return "❌ 请提供要搜索的关键词";
  }

  console.log(`[ScriptAnalysisTool] Searching keyword: "${keyword}"`);

  try {
    const result = await searchKeywordOccurrences(keyword);
    
    let response = `✅ 关键词 "${keyword}" 统计完成

**统计结果：**
- 🔢 总出现次数：${result.totalOccurrences.toLocaleString()}
- 📄 包含该词的块数：${result.blocksWithKeyword.toLocaleString()}`;

    if (result.topBlocks.length > 0) {
      response += `\n\n**出现最多的块（前${result.topBlocks.length}个）：**`;
      for (const block of result.topBlocks) {
        response += `\n- [Block #${block.id}](orca-block:${block.id}) (${block.occurrences}次)`;
        if (block.content) {
          response += `\n  > ${block.content.substring(0, 100)}${block.content.length > 100 ? "..." : ""}`;
        }
      }
    }

    return response;
  } catch (e: any) {
    console.error("[ScriptAnalysisTool] Error:", e);
    return `❌ 搜索失败：${e.message}`;
  }
}

/**
 * 执行词频分析
 */
export async function executeWordFrequencyTool(args: { topN?: number }): Promise<string> {
  const topN = args.topN || 50;

  console.log(`[ScriptAnalysisTool] Analyzing word frequency (top ${topN})`);

  try {
    const result = await analyzeWordFrequency(topN);
    
    let response = `✅ 词频分析完成

**整体统计：**
- 📊 总词数：${result.totalWords.toLocaleString()}
- 🔤 不重复词数：${result.uniqueWords.toLocaleString()}

**高频词 Top ${Math.min(topN, result.topWords.length)}：**`;

    // 分列显示
    const columns = 3;
    const perColumn = Math.ceil(result.topWords.length / columns);
    
    for (let i = 0; i < Math.min(20, result.topWords.length); i++) {
      const { word, count } = result.topWords[i];
      response += `\n${i + 1}. **${word}** (${count})`;
    }

    if (result.topWords.length > 20) {
      response += `\n\n... 还有 ${result.topWords.length - 20} 个高频词`;
    }

    return response;
  } catch (e: any) {
    console.error("[ScriptAnalysisTool] Error:", e);
    return `❌ 分析失败：${e.message}`;
  }
}

/**
 * 执行自定义分析脚本
 */
export async function executeCustomAnalysisTool(args: {
  code: string;
  description?: string;
}): Promise<string> {
  const { code, description } = args;

  if (!code || code.trim() === "") {
    return "❌ 请提供分析代码";
  }

  console.log(`[ScriptAnalysisTool] Executing custom analysis: ${description || "unnamed"}`);

  try {
    // 获取笔记数据
    const { blocks, totalCount, truncated } = await getNotesDataForAnalysis();
    
    // 执行脚本
    const result = await executeScript(code, {
      notesData: blocks,
      totalCount,
      truncated,
    });

    if (truncated) {
      return formatExecutionResult(result) + `\n\n⚠️ 注意：笔记数据已截断，只分析了前 ${blocks.length} 个块（共 ${totalCount} 个）`;
    }

    return formatExecutionResult(result);
  } catch (e: any) {
    console.error("[ScriptAnalysisTool] Error:", e);
    return `❌ 执行失败：${e.message}`;
  }
}

/**
 * 执行通用代码 - Code Interpreter (JavaScript)
 */
export async function executeCodeInterpreterTool(args: {
  code: string;
}): Promise<string> {
  const { code } = args;

  if (!code || code.trim() === "") {
    return "❌ 请提供要执行的代码";
  }

  console.log("[CodeInterpreter] Executing JavaScript code");

  try {
    const result = await executeScript(code, {});

    if (!result.success) {
      return `❌ JavaScript 执行失败

**错误：** ${result.error}

**执行时间：** ${result.executionTime}ms`;
    }

    return `✅ JavaScript 执行成功

**执行时间：** ${result.executionTime}ms

**结果：**
\`\`\`
${result.output || "(无输出)"}
\`\`\``;
  } catch (e: any) {
    console.error("[CodeInterpreter] Error:", e);
    return `❌ 执行失败：${e.message}`;
  }
}

/**
 * 执行 Python 代码 - 使用 Pyodide
 */
export async function executePythonTool(args: {
  code: string;
}): Promise<string> {
  const { code } = args;

  if (!code || code.trim() === "") {
    return "❌ 请提供要执行的 Python 代码";
  }

  console.log("[PythonInterpreter] Executing Python code");

  // 提示用户正在加载（首次会比较慢）
  const isLoaded = isPyodideLoaded();
  const loadingHint = isLoaded ? "" : "\n\n⏳ 首次运行需要加载 Python 运行时，请稍候...";

  try {
    const result = await executePython(code);

    if (!result.success) {
      return `❌ Python 执行失败

**错误：**
\`\`\`
${result.error}
\`\`\`

**执行时间：** ${result.executionTime}ms`;
    }

    return `✅ Python 执行成功

**执行时间：** ${result.executionTime}ms

**结果：**
\`\`\`
${result.output}
\`\`\``;
  } catch (e: any) {
    console.error("[PythonInterpreter] Error:", e);
    return `❌ Python 执行失败：${e.message}`;
  }
}

/**
 * 获取所有脚本分析相关工具
 */
export function getScriptAnalysisTools(): OpenAITool[] {
  return [
    PYTHON_INTERPRETER_TOOL,  // Python 执行（功能最强，放第一个）
    CODE_INTERPRETER_TOOL,    // JavaScript 执行（更快，无需加载）
    NOTES_STATS_TOOL,
    KEYWORD_SEARCH_TOOL,
    WORD_FREQUENCY_TOOL,
    CUSTOM_ANALYSIS_TOOL,
  ];
}

/**
 * 处理脚本分析工具调用
 */
export async function handleScriptAnalysisTool(
  toolName: string,
  args: any
): Promise<string | null> {
  switch (toolName) {
    case "runPython":
      return executePythonTool(args);
    
    case "runCode":
      return executeCodeInterpreterTool(args);
    
    case "analyzeNotesStats":
      return executeNotesStatsTool();
    
    case "searchKeywordOccurrences":
      return executeKeywordSearchTool(args);
    
    case "analyzeWordFrequency":
      return executeWordFrequencyTool(args);
    
    case "executeCustomAnalysis":
      return executeCustomAnalysisTool(args);
    
    default:
      return null;
  }
}
