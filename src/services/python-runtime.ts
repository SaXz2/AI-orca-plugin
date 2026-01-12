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
  runtime: "backend" | "pyodide";
};

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
    const output = await runWithPyodide(options);
    return { output, runtime: "pyodide" };
  }
}
