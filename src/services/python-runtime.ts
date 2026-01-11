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

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/";

let pyodidePromise: Promise<any> | null = null;
const pyodidePackages = new Set<string>();

async function loadPyodideRuntime(): Promise<any> {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = new Promise((resolve, reject) => {
    const existing = (window as any).loadPyodide;
    if (typeof existing === "function") {
      existing({ indexURL: PYODIDE_CDN }).then(resolve).catch(reject);
      return;
    }

    const script = document.createElement("script");
    script.src = `${PYODIDE_CDN}pyodide.js`;
    script.async = true;
    script.onload = () => {
      const loader = (window as any).loadPyodide;
      if (typeof loader !== "function") {
        reject(new Error("Pyodide loader is unavailable"));
        return;
      }
      loader({ indexURL: PYODIDE_CDN }).then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error("Failed to load Pyodide"));
    document.head.appendChild(script);
  });

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

  const inputJson = JSON.stringify(options.input ?? null);
  const codeJson = JSON.stringify(options.code);

  const wrapped = `\nimport json, sys, io, traceback\n__skill_stdout = io.StringIO()\n__skill_stderr = io.StringIO()\n__skill_input = json.loads(${inputJson})\ninput = __skill_input\ninput_data = __skill_input\n_stdout = sys.stdout\n_stderr = sys.stderr\nsys.stdout = __skill_stdout\nsys.stderr = __skill_stderr\ntry:\n    exec(${codeJson}, globals())\nexcept Exception:\n    traceback.print_exc()\nfinally:\n    sys.stdout = _stdout\n    sys.stderr = _stderr\n__skill_output = {\"stdout\": __skill_stdout.getvalue(), \"stderr\": __skill_stderr.getvalue()}\nif \"result\" in globals():\n    try:\n        __skill_output[\"result\"] = result\n    except Exception:\n        __skill_output[\"result\"] = None\n__skill_output_json = json.dumps(__skill_output, default=str)\n`;

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
    const fallbackHint = /python-exec|unsupported|not supported|unknown|not implemented/i;
    if (!fallbackHint.test(message)) {
      throw err;
    }
    const output = await runWithPyodide(options);
    return { output, runtime: "pyodide" };
  }
}
