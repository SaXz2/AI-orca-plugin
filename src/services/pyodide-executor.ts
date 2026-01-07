/**
 * Pyodide Executor - 在浏览器中运行 Python
 * 
 * 使用 Pyodide (Python compiled to WebAssembly) 实现浏览器内 Python 执行
 * 无需用户安装 Python，开箱即用
 */

// Pyodide 实例
let pyodideInstance: any = null;
let pyodideLoading: Promise<any> | null = null;

// Pyodide CDN 地址
const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/";

/**
 * 加载 Pyodide
 */
async function loadPyodide(): Promise<any> {
  // 如果已经加载，直接返回
  if (pyodideInstance) {
    return pyodideInstance;
  }

  // 如果正在加载，等待加载完成
  if (pyodideLoading) {
    return pyodideLoading;
  }

  console.log("[Pyodide] Loading Pyodide from CDN...");

  pyodideLoading = (async () => {
    try {
      // 动态加载 Pyodide 脚本
      if (!(window as any).loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `${PYODIDE_CDN}pyodide.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Pyodide script"));
          document.head.appendChild(script);
        });
      }

      // 初始化 Pyodide
      pyodideInstance = await (window as any).loadPyodide({
        indexURL: PYODIDE_CDN,
      });

      console.log("[Pyodide] Pyodide loaded successfully");
      
      // 预装一些常用包（可选，会增加加载时间）
      // await pyodideInstance.loadPackage(["numpy", "pandas"]);
      
      return pyodideInstance;
    } catch (e) {
      console.error("[Pyodide] Failed to load Pyodide:", e);
      pyodideLoading = null;
      throw e;
    }
  })();

  return pyodideLoading;
}

/**
 * 检查 Pyodide 是否已加载
 */
export function isPyodideLoaded(): boolean {
  return pyodideInstance !== null;
}

/**
 * 检查 Pyodide 是否正在加载
 */
export function isPyodideLoading(): boolean {
  return pyodideLoading !== null && pyodideInstance === null;
}

/**
 * 执行 Python 代码
 */
export async function executePython(code: string): Promise<{
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}> {
  const startTime = Date.now();

  try {
    const pyodide = await loadPyodide();

    // 捕获 stdout
    let stdout = "";
    pyodide.setStdout({
      batched: (text: string) => {
        stdout += text + "\n";
      },
    });

    // 捕获 stderr
    let stderr = "";
    pyodide.setStderr({
      batched: (text: string) => {
        stderr += text + "\n";
      },
    });

    // 执行代码
    const result = await pyodide.runPythonAsync(code);

    // 组合输出
    let output = stdout.trim();
    if (result !== undefined && result !== null) {
      const resultStr = String(result);
      if (resultStr && resultStr !== "None") {
        output = output ? `${output}\n${resultStr}` : resultStr;
      }
    }

    // 如果有 stderr 但没有抛出异常，也加到输出里
    if (stderr.trim()) {
      output = output ? `${output}\n[stderr] ${stderr.trim()}` : `[stderr] ${stderr.trim()}`;
    }

    return {
      success: true,
      output: output || "(无输出)",
      executionTime: Date.now() - startTime,
    };
  } catch (e: any) {
    console.error("[Pyodide] Execution error:", e);
    
    // 提取 Python 错误信息
    let errorMsg = e.message || String(e);
    
    // Pyodide 的错误信息通常包含完整的 traceback
    if (errorMsg.includes("Traceback")) {
      // 保留完整的 traceback，但格式化一下
      errorMsg = errorMsg.replace(/\\n/g, "\n");
    }

    return {
      success: false,
      output: "",
      error: errorMsg,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * 预加载 Pyodide（可在插件启动时调用，提前加载）
 */
export async function preloadPyodide(): Promise<boolean> {
  try {
    await loadPyodide();
    return true;
  } catch {
    return false;
  }
}

/**
 * 加载额外的 Python 包
 */
export async function loadPythonPackage(packageName: string): Promise<boolean> {
  try {
    const pyodide = await loadPyodide();
    await pyodide.loadPackage(packageName);
    console.log(`[Pyodide] Package "${packageName}" loaded`);
    return true;
  } catch (e) {
    console.error(`[Pyodide] Failed to load package "${packageName}":`, e);
    return false;
  }
}

/**
 * 获取已加载的包列表
 */
export async function getLoadedPackages(): Promise<string[]> {
  if (!pyodideInstance) return [];
  
  try {
    const packages = pyodideInstance.loadedPackages;
    return Object.keys(packages);
  } catch {
    return [];
  }
}

/**
 * 清理 Pyodide 缓存
 * 会清除浏览器中缓存的 Pyodide 运行时，下次使用需要重新下载
 */
export async function clearPyodideCache(): Promise<boolean> {
  try {
    // 重置实例
    pyodideInstance = null;
    pyodideLoading = null;

    // 清理 Cache Storage（Pyodide 的主要缓存位置）
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes("pyodide") || name.includes("wasm")) {
          await caches.delete(name);
          console.log(`[Pyodide] Deleted cache: ${name}`);
        }
      }
    }

    // 清理 IndexedDB（Pyodide 包缓存）
    if ("indexedDB" in window) {
      const databases = await indexedDB.databases?.() || [];
      for (const db of databases) {
        if (db.name && (db.name.includes("pyodide") || db.name.includes("emscripten"))) {
          indexedDB.deleteDatabase(db.name);
          console.log(`[Pyodide] Deleted IndexedDB: ${db.name}`);
        }
      }
    }

    console.log("[Pyodide] Cache cleared successfully");
    return true;
  } catch (e) {
    console.error("[Pyodide] Failed to clear cache:", e);
    return false;
  }
}

/**
 * 获取 Pyodide 缓存大小估算
 */
export async function getPyodideCacheSize(): Promise<string> {
  try {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(1);
      const quotaMB = ((estimate.quota || 0) / 1024 / 1024).toFixed(0);
      return `已用 ${usedMB} MB / 配额 ${quotaMB} MB`;
    }
    return "无法获取";
  } catch {
    return "无法获取";
  }
}
