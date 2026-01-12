export type PythonFilePayload = {
  path: string;
  base64: string;
};

export type PythonRunOptions = {
  code: string;
  packages?: string[];
  input?: any;
  files?: PythonFilePayload[];
};

export type PythonRunResult = {
  output: string;
  runtime: "backend" | "pyodide" | "local-server";
};

export type LocalPythonFileOptions = {
  file: string;
  args?: string[];
  timeout?: number;
  cwd?: string;
};

// 本地 Python 服务器配置
const LOCAL_PYTHON_SERVER_URL = "http://127.0.0.1:18765";
let localServerAvailable: boolean | null = null;

/**
 * 检查本地 Python 服务器是否可用
 */
async function checkLocalServer(): Promise<boolean> {
  if (localServerAvailable !== null) {
    return localServerAvailable;
  }
  
  try {
    const response = await fetch(`${LOCAL_PYTHON_SERVER_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    localServerAvailable = response.ok;
    if (localServerAvailable) {
      console.log("[PythonRuntime] Local Python server is available");
    }
    return localServerAvailable;
  } catch {
    localServerAvailable = false;
    return false;
  }
}

/**
 * 重置本地服务器状态（用于重新检测）
 */
export function resetLocalServerStatus(): void {
  localServerAvailable = null;
}

/**
 * 通过本地服务器执行 Python 代码
 */
async function runWithLocalServer(options: PythonRunOptions): Promise<string> {
  const response = await fetch(`${LOCAL_PYTHON_SERVER_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: options.code,
      input: options.input ?? null,
      timeout: 30,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Local server error: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (!result.ok) {
    return `Python error: ${result.error || "Unknown error"}\n${result.stderr || ""}`;
  }
  
  const parts = [result.stdout, result.stderr].filter(Boolean);
  return parts.join("\n").trim() || "Python executed.";
}

/**
 * 通过本地服务器执行 Python 文件
 */
export async function runLocalPythonFile(options: LocalPythonFileOptions): Promise<PythonRunResult> {
  // 检查本地服务器
  const serverAvailable = await checkLocalServer();
  if (!serverAvailable) {
    throw new Error(
      "本地 Python 服务器未运行。\n\n" +
      "请先启动服务器：\n" +
      "  python scripts/python-server.py\n\n" +
      "或在插件目录运行：\n" +
      "  python python-server.py"
    );
  }
  
  const response = await fetch(`${LOCAL_PYTHON_SERVER_URL}/run-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file: options.file,
      args: options.args || [],
      timeout: options.timeout || 60,
      cwd: options.cwd,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Local server error: ${response.status}`);
  }
  
  const result = await response.json();
  
  if (!result.ok) {
    const output = `Python error: ${result.error || "Unknown error"}\n${result.stderr || ""}`;
    return { output, runtime: "local-server" };
  }
  
  const parts = [result.stdout, result.stderr].filter(Boolean);
  const output = parts.join("\n").trim() || "Python executed.";
  return { output, runtime: "local-server" };
}

let pyodidePromise: Promise<any> | null = null;
const pyodidePackages = new Set<string>();

/**
 * 获取 Pyodide 的本地路径
 * 在 Orca 插件环境中，需要找到插件的 dist 目录
 */
function getPyodideIndexURL(): string {
  // 方法1: 使用 import.meta.url（ES Module 环境）
  try {
    const moduleUrl = import.meta.url;
    if (moduleUrl) {
      const baseUrl = moduleUrl.substring(0, moduleUrl.lastIndexOf("/") + 1);
      console.log("[Pyodide] Using import.meta.url base:", baseUrl);
      return baseUrl + "pyodide/";
    }
  } catch (e) {
    console.log("[Pyodide] import.meta.url not available");
  }

  // 方法2: 从 document.currentScript 获取
  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (currentScript?.src) {
    const baseUrl = currentScript.src.substring(0, currentScript.src.lastIndexOf("/") + 1);
    console.log("[Pyodide] Using currentScript base:", baseUrl);
    return baseUrl + "pyodide/";
  }

  // 方法3: 遍历所有 script 标签查找插件脚本
  const scripts = document.getElementsByTagName("script");
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].src;
    // 查找包含 plugins 路径的脚本
    if (src && src.includes("plugins") && (src.includes("index") || src.includes("main"))) {
      const baseUrl = src.substring(0, src.lastIndexOf("/") + 1);
      console.log("[Pyodide] Using script tag base:", baseUrl);
      return baseUrl + "pyodide/";
    }
  }

  // 方法4: 尝试从 location 构建路径（针对 file:// 协议）
  if (typeof location !== "undefined" && location.href.startsWith("file://")) {
    // Orca 插件通常在用户文档目录
    const userHome = location.href.includes("Documents/orca/plugins");
    if (userHome) {
      // 尝试从 href 中提取插件路径
      const match = location.href.match(/(file:\/\/\/.*?\/plugins\/[^/]+\/dist\/)/);
      if (match) {
        console.log("[Pyodide] Using location match:", match[1]);
        return match[1] + "pyodide/";
      }
    }
  }

  // 回退：使用相对路径
  console.log("[Pyodide] Falling back to relative path");
  return "./pyodide/";
}

async function loadPyodideRuntime(): Promise<any> {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = (async () => {
    const indexURL = getPyodideIndexURL();
    console.log("[Pyodide] Loading from path:", indexURL);

    // 检查是否已经加载过
    const existing = (window as any).loadPyodide;
    if (typeof existing === "function") {
      console.log("[Pyodide] Using existing loadPyodide");
      return existing({ indexURL });
    }

    // 尝试动态导入
    try {
      // 使用 pyodide npm 包的浏览器入口
      const { loadPyodide } = await import("pyodide");
      console.log("[Pyodide] Module imported, initializing with indexURL:", indexURL);
      const pyodide = await loadPyodide({ indexURL });
      console.log("[Pyodide] Initialized successfully");
      return pyodide;
    } catch (importErr) {
      console.warn("[Pyodide] Module import failed:", importErr);
      
      // 回退：通过 script 标签加载
      return new Promise((resolve, reject) => {
        const scriptUrl = `${indexURL}pyodide.js`;
        console.log("[Pyodide] Trying script tag:", scriptUrl);
        
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = true;
        script.onload = () => {
          const loader = (window as any).loadPyodide;
          if (typeof loader !== "function") {
            reject(new Error("Pyodide loader is unavailable after script load"));
            return;
          }
          console.log("[Pyodide] Script loaded, initializing...");
          loader({ indexURL })
            .then((pyodide: any) => {
              console.log("[Pyodide] Initialized successfully via script tag");
              resolve(pyodide);
            })
            .catch(reject);
        };
        script.onerror = (e) => {
          console.error("[Pyodide] Script load error:", e);
          reject(new Error(`Failed to load Pyodide script from ${scriptUrl}`));
        };
        document.head.appendChild(script);
      });
    }
  })();

  return pyodidePromise;
}

function formatRuntimeOutput(payload: any): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;

  const stdout = typeof payload.stdout === "string" ? payload.stdout : "";
  const stderr = typeof payload.stderr === "string" ? payload.stderr : "";
  const result = payload.result !== undefined ? String(payload.result) : "";

  const parts = [stdout, stderr, result].filter(Boolean);
  return parts.join("\n").trim();
}

async function runWithBackend(options: PythonRunOptions): Promise<string> {
  const payload = {
    code: options.code,
    packages: options.packages ?? [],
    input: options.input ?? null,
    files: options.files ?? [],
  };

  const result = await orca.invokeBackend("python-exec", payload);
  if (!result) {
    throw new Error("Backend Python returned no result");
  }

  if (typeof result === "object" && result.ok === false) {
    return formatRuntimeOutput(result) || `Python error: ${result.error ?? "Unknown error"}`;
  }

  return formatRuntimeOutput(result) || "Python executed.";
}

async function ensurePyodidePackages(pyodide: any, packages: string[]): Promise<void> {
  const pending = packages.filter((pkg) => pkg && !pyodidePackages.has(pkg));
  if (pending.length === 0) return;

  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install(pending);
  pending.forEach((pkg) => pyodidePackages.add(pkg));
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function writePyodideFiles(pyodide: any, files: PythonFilePayload[]): Promise<void> {
  for (const file of files) {
    const normalized = file.path.replace(/\\/g, "/");
    const dir = normalized.split("/").slice(0, -1).join("/");
    if (dir) {
      pyodide.FS.mkdirTree(dir);
    }
    const bytes = decodeBase64(file.base64);
    pyodide.FS.writeFile(normalized, bytes);
  }
}

async function runWithPyodide(options: PythonRunOptions): Promise<string> {
  const pyodide = await loadPyodideRuntime();
  await ensurePyodidePackages(pyodide, options.packages ?? []);

  if (options.files && options.files.length > 0) {
    await writePyodideFiles(pyodide, options.files);
  }

  // 将输入数据序列化为 JSON 字符串，然后再次 JSON.stringify 以便在 Python 中作为字符串字面量使用
  const inputJsonStr = JSON.stringify(JSON.stringify(options.input ?? null));
  const codeJsonStr = JSON.stringify(options.code);

  // Python 代码：先 json.loads 解析输入字符串，然后执行用户代码
  const wrapped = `
import json, sys, io, traceback

__skill_stdout = io.StringIO()
__skill_stderr = io.StringIO()
__skill_input = json.loads(${inputJsonStr})
input = __skill_input
input_data = __skill_input

_stdout = sys.stdout
_stderr = sys.stderr
sys.stdout = __skill_stdout
sys.stderr = __skill_stderr

try:
    exec(${codeJsonStr}, globals())
except Exception:
    traceback.print_exc()
finally:
    sys.stdout = _stdout
    sys.stderr = _stderr

__skill_output = {"stdout": __skill_stdout.getvalue(), "stderr": __skill_stderr.getvalue()}
if "result" in globals():
    try:
        __skill_output["result"] = result
    except Exception:
        __skill_output["result"] = None

__skill_output_json = json.dumps(__skill_output, default=str)
`;

  await pyodide.runPythonAsync(wrapped);
  const outputJson = pyodide.globals.get("__skill_output_json");
  if (typeof outputJson === "string") {
    const parsed = JSON.parse(outputJson);
    return formatRuntimeOutput(parsed) || "Python executed.";
  }

  return "Python executed.";
}

export async function runPythonStep(options: PythonRunOptions): Promise<PythonRunResult> {
  // 优先级：本地服务器 > Orca 后端 > Pyodide
  
  // 1. 尝试本地 Python 服务器
  const serverAvailable = await checkLocalServer();
  if (serverAvailable) {
    try {
      console.log("[PythonRuntime] Using local Python server");
      const output = await runWithLocalServer(options);
      return { output, runtime: "local-server" };
    } catch (err) {
      console.warn("[PythonRuntime] Local server failed:", err);
      // 继续尝试其他方式
    }
  }
  
  // 2. 尝试 Orca 后端
  try {
    const output = await runWithBackend(options);
    return { output, runtime: "backend" };
  } catch (err) {
    const message = String((err as any)?.message ?? err);
    // 扩展回退条件：后端不可用、返回空结果、不支持等情况都回退到 Pyodide
    const fallbackHint = /python-exec|unsupported|not supported|unknown|not implemented|no result|backend.*returned/i;
    if (!fallbackHint.test(message)) {
      throw err;
    }
    console.log("[PythonRuntime] Backend unavailable, falling back to Pyodide:", message);
  }
  
  // 3. 回退到 Pyodide
  const output = await runWithPyodide(options);
  return { output, runtime: "pyodide" };
}

/**
 * 获取插件 dist 目录的本地路径
 */
function getPluginDistPath(): string {
  try {
    const moduleUrl = import.meta.url;
    if (moduleUrl) {
      // file:///C:/Users/xxx/Documents/orca/plugins/AI/dist/main.js
      // -> C:\Users\xxx\Documents\orca\plugins\AI\dist\
      const baseUrl = moduleUrl.substring(0, moduleUrl.lastIndexOf("/") + 1);
      if (baseUrl.startsWith("file:///")) {
        return baseUrl.substring(8).replace(/\//g, "\\");
      }
      return baseUrl;
    }
  } catch (e) {
    console.log("[PythonRuntime] Cannot get dist path from import.meta.url");
  }
  return "";
}

/**
 * 获取 Python 服务器脚本的路径
 */
export function getPythonServerScriptPath(): string {
  const distPath = getPluginDistPath();
  if (distPath) {
    return distPath + "scripts\\python-server.py";
  }
  return "scripts/python-server.py";
}

/**
 * 获取 Python 服务器启动脚本的路径 (Windows .bat - 有窗口)
 */
export function getPythonServerBatPath(): string {
  const distPath = getPluginDistPath();
  if (distPath) {
    return distPath + "scripts\\start-python-server.bat";
  }
  return "scripts/start-python-server.bat";
}

/**
 * 获取 Python 服务器静默启动脚本的路径 (Windows .vbs - 无窗口)
 */
export function getPythonServerVbsPath(): string {
  const distPath = getPluginDistPath();
  if (distPath) {
    return distPath + "scripts\\start-python-server-silent.vbs";
  }
  return "scripts/start-python-server-silent.vbs";
}

/**
 * 启动本地 Python 服务器
 */
export async function startPythonServer(): Promise<{ success: boolean; message: string }> {
  // 先检查是否已经在运行
  const alreadyRunning = await checkLocalServer();
  if (alreadyRunning) {
    return { success: true, message: "Python 服务器已在运行" };
  }
  
  // 使用 .bat 文件启动（有窗口）
  const batPath = getPythonServerBatPath();
  const pyPath = getPythonServerScriptPath();
  console.log("[PythonRuntime] Starting Python server via:", batPath);
  
  try {
    // 使用 shell-open 打开 .bat 文件（Windows 会在新终端窗口运行）
    await orca.invokeBackend("shell-open", batPath);
    
    // 等待服务器启动（最多等待 8 秒）
    for (let i = 0; i < 16; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      resetLocalServerStatus();
      const running = await checkLocalServer();
      if (running) {
        return { success: true, message: "Python 服务器已启动" };
      }
    }
    
    return { 
      success: false, 
      message: `服务器启动超时。请确保已安装 Python，并手动运行脚本：\n${pyPath}` 
    };
  } catch (err: any) {
    return { 
      success: false, 
      message: `启动失败: ${err.message}\n\n请手动运行：python "${pyPath}"` 
    };
  }
}

/**
 * 获取本地服务器状态
 */
export async function getPythonServerStatus(): Promise<{
  running: boolean;
  pythonVersion?: string;
  cwd?: string;
}> {
  try {
    const response = await fetch(`${LOCAL_PYTHON_SERVER_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        running: true,
        pythonVersion: data.python_version,
        cwd: data.cwd,
      };
    }
  } catch {
    // 服务器未运行
  }
  
  return { running: false };
}

/**
 * 停止本地 Python 服务器
 */
export async function stopPythonServer(): Promise<{ success: boolean; message: string }> {
  const status = await getPythonServerStatus();
  if (!status.running) {
    return { success: true, message: "服务器未运行" };
  }
  
  try {
    await fetch(`${LOCAL_PYTHON_SERVER_URL}/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // 服务器关闭时连接会断开，这是正常的
  }
  
  // 等待确认关闭
  await new Promise(resolve => setTimeout(resolve, 500));
  resetLocalServerStatus();
  
  const stillRunning = await checkLocalServer();
  if (stillRunning) {
    return { success: false, message: "服务器关闭失败" };
  }
  
  return { success: true, message: "Python 服务器已停止" };
}

/**
 * 读取本地文件
 */
export async function readLocalFile(path: string, encoding = "utf-8"): Promise<string> {
  const serverAvailable = await checkLocalServer();
  if (!serverAvailable) {
    throw new Error("本地 Python 服务器未运行");
  }
  
  const response = await fetch(`${LOCAL_PYTHON_SERVER_URL}/read-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, encoding }),
  });
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "读取文件失败");
  }
  
  return result.content;
}

/**
 * 写入本地文件
 */
export async function writeLocalFile(
  path: string, 
  content: string, 
  options?: { encoding?: string; createDirs?: boolean }
): Promise<void> {
  const serverAvailable = await checkLocalServer();
  if (!serverAvailable) {
    throw new Error("本地 Python 服务器未运行");
  }
  
  const response = await fetch(`${LOCAL_PYTHON_SERVER_URL}/write-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      content,
      encoding: options?.encoding || "utf-8",
      createDirs: options?.createDirs || false,
    }),
  });
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "写入文件失败");
  }
}

export type DirEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
};

/**
 * 列出目录内容
 */
export async function listLocalDir(path: string, pattern?: string): Promise<DirEntry[]> {
  const serverAvailable = await checkLocalServer();
  if (!serverAvailable) {
    throw new Error("本地 Python 服务器未运行");
  }
  
  const response = await fetch(`${LOCAL_PYTHON_SERVER_URL}/list-dir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, pattern }),
  });
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "列出目录失败");
  }
  
  return result.entries;
}

/**
 * 删除本地文件或目录
 */
export async function deleteLocalFile(
  path: string, 
  options?: { recursive?: boolean }
): Promise<{ type: "file" | "directory" }> {
  const serverAvailable = await checkLocalServer();
  if (!serverAvailable) {
    throw new Error("本地 Python 服务器未运行");
  }
  
  const response = await fetch(`${LOCAL_PYTHON_SERVER_URL}/delete-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      recursive: options?.recursive || false,
    }),
  });
  
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "删除失败");
  }
  
  return { type: result.type };
}
