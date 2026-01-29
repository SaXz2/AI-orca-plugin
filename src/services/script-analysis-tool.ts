/**
 * Script Analysis Tool for AI
 * 
 * 为 AI 提供数据分析能力的工具定义和实现。
 * 让 AI 可以通过执行代码来分析数据、进行计算。
 * 支持 JavaScript 和 Python 代码执行
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
import { runPythonStep, runLocalPythonFile, readLocalFile, writeLocalFile, listLocalDir, deleteLocalFile } from "./python-runtime";

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
 * Python 代码执行工具
 * 让 AI 可以写 Python 代码来解决计算、数据处理等问题
 */
export const PYTHON_INTERPRETER_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "runPythonCode",
    description: `执行 Python 代码来完成计算、数据分析等任务。

【何时使用】
- 数学计算：复杂公式、统计分析、科学计算
- 数据处理：pandas 数据分析、numpy 数值计算
- 字符串处理：正则表达式、文本分析
- 日期时间：datetime 处理
- 任何 Python 更擅长的场景（如数据科学、机器学习预处理）

【可用功能】
- 标准库：math, datetime, json, re, collections, itertools 等
- 可安装包：numpy, pandas, scipy 等（通过 packages 参数指定）
- print()：输出结果
- result 变量：设置此变量的值会作为返回结果

【参数】
- code: Python 代码（必填）
- packages: 需要安装的包列表（可选），如 ["numpy", "pandas"]
- input: 传入代码的输入数据（可选），在代码中通过 input 或 input_data 变量访问

【注意】
- 代码在 Pyodide（浏览器端 Python）或后端 Python 中执行
- 不能访问本地文件系统
- 用 print() 输出结果，或设置 result 变量`,
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "要执行的 Python 代码",
        },
        packages: {
          type: "array",
          items: { type: "string" },
          description: "需要安装的 Python 包列表，如 [\"numpy\", \"pandas\"]",
        },
        input: {
          type: "object",
          description: "传入代码的输入数据，在代码中通过 input 或 input_data 变量访问",
        },
      },
      required: ["code"],
    },
  },
};

/**
 * 本地 Python 脚本执行工具
 * 执行用户本地的 .py 文件
 */
export const LOCAL_PYTHON_SCRIPT_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "runLocalPythonScript",
    description: `执行用户本地的 Python 脚本文件（.py）。

【前提条件】
用户需要先启动本地 Python 服务器：
  python scripts/python-server.py

【何时使用】
- 用户要求运行本地的 .py 文件
- 用户提供了脚本路径
- 需要执行复杂的本地 Python 项目

【参数】
- file: Python 脚本的完整路径（必填），如 "D:/scripts/analysis.py"
- args: 命令行参数列表（可选），如 ["--input", "data.csv"]
- timeout: 超时时间秒数（可选），默认 60 秒
- cwd: 工作目录（可选），默认为脚本所在目录

【注意】
- 需要本地 Python 服务器运行
- 脚本在用户本地 Python 环境中执行
- 可以访问本地文件系统
- 可以使用本地安装的所有 Python 包`,
    parameters: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Python 脚本的完整路径，如 \"D:/scripts/analysis.py\"",
        },
        args: {
          type: "array",
          items: { type: "string" },
          description: "命令行参数列表",
        },
        timeout: {
          type: "number",
          description: "超时时间（秒），默认 60",
        },
        cwd: {
          type: "string",
          description: "工作目录，默认为脚本所在目录",
        },
      },
      required: ["file"],
    },
  },
};

/**
 * 读取本地文件工具
 */
export const READ_LOCAL_FILE_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "readLocalFile",
    description: `读取用户本地文件的内容。

【前提条件】
需要本地 Python 服务器运行。

【何时使用】
- 用户要求查看本地文件内容
- 需要读取 Python 脚本进行分析或修改
- 读取配置文件、数据文件等

【参数】
- path: 文件的完整路径（必填），如 "D:/scripts/test.py"
- encoding: 文件编码（可选），默认 "utf-8"`,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "文件的完整路径",
        },
        encoding: {
          type: "string",
          description: "文件编码，默认 utf-8",
        },
      },
      required: ["path"],
    },
  },
};

/**
 * 写入本地文件工具
 */
export const WRITE_LOCAL_FILE_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "writeLocalFile",
    description: `写入内容到用户本地文件。

【前提条件】
需要本地 Python 服务器运行。

【何时使用】
- 用户要求创建或修改本地文件
- 保存生成的 Python 脚本
- 修改配置文件

【参数】
- path: 文件的完整路径（必填），如 "D:/scripts/new_script.py"
- content: 要写入的内容（必填）
- encoding: 文件编码（可选），默认 "utf-8"
- createDirs: 是否自动创建目录（可选），默认 false

【注意】
- 会覆盖已存在的文件
- 写入前请确认用户同意`,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "文件的完整路径",
        },
        content: {
          type: "string",
          description: "要写入的内容",
        },
        encoding: {
          type: "string",
          description: "文件编码，默认 utf-8",
        },
        createDirs: {
          type: "boolean",
          description: "是否自动创建不存在的目录",
        },
      },
      required: ["path", "content"],
    },
  },
};

/**
 * 列出目录内容工具
 */
export const LIST_LOCAL_DIR_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "listLocalDir",
    description: `列出用户本地目录的内容。

【前提条件】
需要本地 Python 服务器运行。

【何时使用】
- 用户要求查看某个目录下的文件
- 需要了解项目结构
- 查找特定类型的文件

【参数】
- path: 目录路径（必填），如 "D:/projects"
- pattern: 文件名过滤（可选），如 ".py" 只显示包含 .py 的文件`,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "目录路径",
        },
        pattern: {
          type: "string",
          description: "文件名过滤模式",
        },
      },
      required: ["path"],
    },
  },
};

/**
 * 删除本地文件工具
 */
export const DELETE_LOCAL_FILE_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "deleteLocalFile",
    description: `删除用户本地的文件或目录。

【前提条件】
需要本地 Python 服务器运行。

【何时使用】
- 用户要求删除本地文件
- 清理临时文件
- 删除不需要的目录

【参数】
- path: 文件或目录的完整路径（必填），如 "D:/temp/old_file.py"
- recursive: 是否递归删除目录（可选），默认 false。设为 true 可删除非空目录

【注意】
- 删除操作不可恢复，请谨慎使用
- 删除非空目录需要设置 recursive: true
- 删除前请确认用户同意`,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "文件或目录的完整路径",
        },
        recursive: {
          type: "boolean",
          description: "是否递归删除目录（删除非空目录时需要设为 true）",
        },
      },
      required: ["path"],
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
 * 执行 Python 代码 - Python Interpreter
 */
export async function executePythonInterpreterTool(args: {
  code: string;
  packages?: string[];
  input?: any;
}): Promise<string> {
  const { code, packages, input } = args;

  if (!code || code.trim() === "") {
    return "❌ 请提供要执行的 Python 代码";
  }

  console.log("[PythonInterpreter] Executing Python code", { packages, hasInput: !!input });

  try {
    const startTime = Date.now();
    const result = await runPythonStep({
      code,
      packages: packages || [],
      input: input || null,
    });
    const executionTime = Date.now() - startTime;

    const runtimeLabels: Record<string, string> = {
      "backend": "后端 Python",
      "pyodide": "Pyodide (浏览器)",
      "local-server": "本地 Python 服务器",
    };
    const runtimeLabel = runtimeLabels[result.runtime] || result.runtime;

    return `✅ Python 执行成功

**运行环境：** ${runtimeLabel}
**执行时间：** ${executionTime}ms
${packages && packages.length > 0 ? `**已加载包：** ${packages.join(", ")}` : ""}

**结果：**
\`\`\`
${result.output || "(无输出)"}
\`\`\``;
  } catch (e: any) {
    console.error("[PythonInterpreter] Error:", e);
    return `❌ Python 执行失败：${e.message}

**提示：**
- 检查代码语法是否正确
- 确保使用 print() 输出结果
- 如需使用第三方包，请在 packages 参数中指定`;
  }
}

/**
 * 执行本地 Python 脚本
 */
export async function executeLocalPythonScriptTool(args: {
  file: string;
  args?: string[];
  timeout?: number;
  cwd?: string;
}): Promise<string> {
  const { file, args: scriptArgs, timeout, cwd } = args;

  if (!file || file.trim() === "") {
    return "❌ 请提供 Python 脚本路径";
  }

  console.log("[LocalPythonScript] Executing:", file, scriptArgs);

  try {
    const startTime = Date.now();
    const result = await runLocalPythonFile({
      file,
      args: scriptArgs,
      timeout,
      cwd,
    });
    const executionTime = Date.now() - startTime;

    return `✅ Python 脚本执行成功

**脚本：** ${file}
${scriptArgs && scriptArgs.length > 0 ? `**参数：** ${scriptArgs.join(" ")}` : ""}
**执行时间：** ${executionTime}ms

**输出：**
\`\`\`
${result.output || "(无输出)"}
\`\`\``;
  } catch (e: any) {
    console.error("[LocalPythonScript] Error:", e);
    return `❌ 脚本执行失败：${e.message}`;
  }
}

/**
 * 读取本地文件
 */
export async function executeReadLocalFileTool(args: {
  path: string;
  encoding?: string;
}): Promise<string> {
  const { path, encoding } = args;

  if (!path || path.trim() === "") {
    return "❌ 请提供文件路径";
  }

  console.log("[ReadLocalFile] Reading:", path);

  try {
    const content = await readLocalFile(path, encoding);
    const lines = content.split("\n").length;
    
    return `✅ 文件读取成功

**路径：** ${path}
**行数：** ${lines}

**内容：**
\`\`\`
${content}
\`\`\``;
  } catch (e: any) {
    console.error("[ReadLocalFile] Error:", e);
    return `❌ 读取失败：${e.message}`;
  }
}

/**
 * 写入本地文件
 */
export async function executeWriteLocalFileTool(args: {
  path: string;
  content: string;
  encoding?: string;
  createDirs?: boolean;
}): Promise<string> {
  const { path, content, encoding, createDirs } = args;

  if (!path || path.trim() === "") {
    return "❌ 请提供文件路径";
  }

  if (content === undefined || content === null) {
    return "❌ 请提供要写入的内容";
  }

  console.log("[WriteLocalFile] Writing:", path);

  try {
    await writeLocalFile(path, content, { encoding, createDirs });
    const lines = content.split("\n").length;
    
    return `✅ 文件写入成功

**路径：** ${path}
**行数：** ${lines}
**大小：** ${content.length} 字符`;
  } catch (e: any) {
    console.error("[WriteLocalFile] Error:", e);
    return `❌ 写入失败：${e.message}`;
  }
}

/**
 * 列出目录内容
 */
export async function executeListLocalDirTool(args: {
  path: string;
  pattern?: string;
}): Promise<string> {
  const { path, pattern } = args;

  if (!path || path.trim() === "") {
    return "❌ 请提供目录路径";
  }

  console.log("[ListLocalDir] Listing:", path);

  try {
    const entries = await listLocalDir(path, pattern);
    
    if (entries.length === 0) {
      return `📁 目录 ${path} 为空${pattern ? `（过滤: ${pattern}）` : ""}`;
    }
    
    const dirs = entries.filter(e => e.isDir);
    const files = entries.filter(e => !e.isDir);
    
    let result = `📁 目录 ${path}\n\n`;
    
    if (dirs.length > 0) {
      result += `**目录 (${dirs.length})：**\n`;
      for (const d of dirs) {
        result += `- 📁 ${d.name}/\n`;
      }
      result += "\n";
    }
    
    if (files.length > 0) {
      result += `**文件 (${files.length})：**\n`;
      for (const f of files) {
        const size = f.size < 1024 ? `${f.size} B` : 
                     f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` :
                     `${(f.size / 1024 / 1024).toFixed(1)} MB`;
        result += `- 📄 ${f.name} (${size})\n`;
      }
    }
    
    return result;
  } catch (e: any) {
    console.error("[ListLocalDir] Error:", e);
    return `❌ 列出目录失败：${e.message}`;
  }
}

/**
 * 删除本地文件或目录
 */
export async function executeDeleteLocalFileTool(args: {
  path: string;
  recursive?: boolean;
}): Promise<string> {
  const { path, recursive } = args;

  if (!path || path.trim() === "") {
    return "❌ 请提供文件或目录路径";
  }

  console.log("[DeleteLocalFile] Deleting:", path, { recursive });

  try {
    const result = await deleteLocalFile(path, { recursive });
    
    const typeLabel = result.type === "directory" ? "目录" : "文件";
    return `✅ ${typeLabel}已删除：${path}`;
  } catch (e: any) {
    console.error("[DeleteLocalFile] Error:", e);
    return `❌ 删除失败：${e.message}`;
  }
}

/**
 * 获取所有脚本分析相关工具
 */
export function getScriptAnalysisTools(): OpenAITool[] {
  return [
    CODE_INTERPRETER_TOOL,       // JavaScript 执行
    PYTHON_INTERPRETER_TOOL,     // Python 执行
    LOCAL_PYTHON_SCRIPT_TOOL,    // 本地 Python 脚本
    READ_LOCAL_FILE_TOOL,        // 读取本地文件
    WRITE_LOCAL_FILE_TOOL,       // 写入本地文件
    DELETE_LOCAL_FILE_TOOL,      // 删除本地文件
    LIST_LOCAL_DIR_TOOL,         // 列出目录
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
    case "runCode":
      return executeCodeInterpreterTool(args);
    
    case "runPythonCode":
      return executePythonInterpreterTool(args);
    
    case "runLocalPythonScript":
      return executeLocalPythonScriptTool(args);
    
    case "readLocalFile":
      return executeReadLocalFileTool(args);
    
    case "writeLocalFile":
      return executeWriteLocalFileTool(args);
    
    case "deleteLocalFile":
      return executeDeleteLocalFileTool(args);
    
    case "listLocalDir":
      return executeListLocalDirTool(args);
    
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
