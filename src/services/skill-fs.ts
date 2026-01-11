export type PluginFsEntry = {
  name: string;
  isDir: boolean;
};

const SKILLS_ROOT = "Skills";
const DATA_KEY_PREFIX = "skills-fs:";
const DATA_B64_PREFIX = "b64:";
const INDEX_KEY = `${DATA_KEY_PREFIX}__index__`;
const DISABLED_KEY = `${DATA_KEY_PREFIX}__disabled__`;
let pluginNameOverride = "";

const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const textDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

function normalizeRelativePath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  const safeParts: string[] = [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      throw new Error("Invalid path: traversal is not allowed");
    }
    safeParts.push(part);
  }

  return safeParts.join("/");
}

function buildPath(...parts: string[]): string {
  return normalizeRelativePath(parts.filter(Boolean).join("/"));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeText(content: string): Uint8Array {
  if (textEncoder) return textEncoder.encode(content);
  throw new Error("TextEncoder is unavailable");
}

function decodeText(bytes: Uint8Array): string {
  if (textDecoder) return textDecoder.decode(bytes);
  throw new Error("TextDecoder is unavailable");
}

function dataKey(path: string): string {
  return `${DATA_KEY_PREFIX}${path}`;
}

function isPersistedPath(path: string): boolean {
  return path.toLowerCase().endsWith("/skills.md");
}

function parseStringArray(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry)).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
    if (!textDecoder) return [];
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    try {
      const parsed = JSON.parse(textDecoder.decode(bytes));
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function parseIndexValue(raw: any): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw.map((entry) => String(entry)).filter(Boolean);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
    if (!textDecoder) return [];
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    try {
      const parsed = JSON.parse(textDecoder.decode(bytes));
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry)).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

async function readIndex(pluginName: string): Promise<string[]> {
  try {
    const raw = await orca.plugins.getData(pluginName, INDEX_KEY);
    return parseIndexValue(raw);
  } catch {
    return [];
  }
}

async function writeIndex(pluginName: string, entries: string[]): Promise<void> {
  const unique = Array.from(new Set(entries.filter(Boolean)));
  await orca.plugins.setData(pluginName, INDEX_KEY, JSON.stringify(unique));
}

async function updateIndexEntry(path: string): Promise<void> {
  if (!isPersistedPath(path)) return;
  const pluginName = getPluginName();
  const entries = await readIndex(pluginName);
  if (entries.includes(path)) return;
  entries.push(path);
  await writeIndex(pluginName, entries);
}

async function removeIndexEntry(path: string): Promise<void> {
  if (!isPersistedPath(path)) return;
  const pluginName = getPluginName();
  const entries = await readIndex(pluginName);
  const next = entries.filter((entry) => entry !== path);
  if (next.length !== entries.length) {
    await writeIndex(pluginName, next);
  }
}

async function readDisabledList(): Promise<string[]> {
  try {
    const pluginName = getPluginName();
    const raw = await orca.plugins.getData(pluginName, DISABLED_KEY);
    return parseStringArray(raw);
  } catch {
    return [];
  }
}

async function writeDisabledList(entries: string[]): Promise<void> {
  const pluginName = getPluginName();
  const unique = Array.from(new Set(entries.filter(Boolean)));
  await orca.plugins.setData(pluginName, DISABLED_KEY, JSON.stringify(unique));
}

function decodeStoredValue(raw: any): Uint8Array | null {
  if (raw === null || raw === undefined) return null;

  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);

  if (typeof raw === "string") {
    if (raw.startsWith(DATA_B64_PREFIX)) {
      return fromBase64(raw.slice(DATA_B64_PREFIX.length));
    }
    return encodeText(raw);
  }

  if (typeof raw === "object" && typeof raw.base64 === "string") {
    return fromBase64(raw.base64);
  }

  return null;
}

async function getPersistedPaths(): Promise<string[]> {
  const pluginName = getPluginName();
  const entries = new Set<string>();
  try {
    const keys = await orca.plugins.getDataKeys(pluginName);
    for (const key of keys) {
      if (key === INDEX_KEY) continue;
      if (!key.startsWith(DATA_KEY_PREFIX)) continue;
      const path = key.slice(DATA_KEY_PREFIX.length);
      if (isPersistedPath(path)) {
        entries.add(path);
      }
    }
  } catch {
    // Ignore and fall back to index-only.
  }

  const indexed = await readIndex(pluginName);
  for (const path of indexed) {
    if (isPersistedPath(path)) {
      entries.add(path);
    }
  }

  return Array.from(entries.values());
}

async function listDirFromPluginData(path: string): Promise<PluginFsEntry[]> {
  const filePaths = await getPersistedPaths();

  const prefix = path ? `${path}/` : "";
  const entries = new Map<string, PluginFsEntry>();

  for (const filePath of filePaths) {
    if (!filePath.startsWith(prefix)) continue;
    const remainder = filePath.slice(prefix.length);
    if (!remainder) continue;
    const parts = remainder.split("/");
    const name = parts[0];
    if (!name) continue;
    const isDir = parts.length > 1;
    const existing = entries.get(name);
    if (!existing || (isDir && !existing.isDir)) {
      entries.set(name, { name, isDir });
    }
  }

  return Array.from(entries.values());
}

async function existsInPluginData(path: string): Promise<boolean> {
  const filePaths = await getPersistedPaths();

  const prefix = path ? `${path}/` : "";
  return filePaths.some((filePath) => filePath === path || filePath.startsWith(prefix));
}

async function readTextFromPluginData(path: string): Promise<string | null> {
  if (!isPersistedPath(path)) return null;
  const pluginName = getPluginName();
  const raw = await orca.plugins.getData(pluginName, dataKey(path));
  const bytes = decodeStoredValue(raw);
  if (!bytes) return null;
  return decodeText(bytes);
}

async function readBinaryFromPluginData(path: string): Promise<Uint8Array | null> {
  if (!isPersistedPath(path)) return null;
  const pluginName = getPluginName();
  const raw = await orca.plugins.getData(pluginName, dataKey(path));
  return decodeStoredValue(raw);
}

async function writeBinaryToPluginData(path: string, bytes: Uint8Array): Promise<void> {
  if (!isPersistedPath(path)) {
    console.warn(`[skill-fs] Skip persisting non-skills file: ${path}`);
    return;
  }
  const pluginName = getPluginName();
  await orca.plugins.setData(pluginName, dataKey(path), `${DATA_B64_PREFIX}${toBase64(bytes)}`);
  await updateIndexEntry(path);
}

async function removeFromPluginData(path: string): Promise<void> {
  if (!isPersistedPath(path)) return;
  const pluginName = getPluginName();
  await orca.plugins.setData(pluginName, dataKey(path), null);
  await removeIndexEntry(path);
}

export function setSkillPluginName(name: string): void {
  pluginNameOverride = name;
}

function getPluginName(): string {
  if (pluginNameOverride) return pluginNameOverride;
  throw new Error("Plugin name is not available yet");
}

export function getSkillsRootPath(): string {
  return SKILLS_ROOT;
}

export function buildSkillPath(skillFolder: string, ...parts: string[]): string {
  return buildPath(SKILLS_ROOT, skillFolder, ...parts);
}

export async function listDir(relativePath: string): Promise<PluginFsEntry[]> {
  const path = normalizeRelativePath(relativePath);
  return await listDirFromPluginData(path);
}

export async function exists(relativePath: string): Promise<boolean> {
  const path = normalizeRelativePath(relativePath);
  return await existsInPluginData(path);
}

export async function mkdirs(_relativePath: string): Promise<void> {
  return;
}

export async function readTextFile(relativePath: string): Promise<string | null> {
  const path = normalizeRelativePath(relativePath);
  return await readTextFromPluginData(path);
}

export async function readBinaryFile(relativePath: string): Promise<Uint8Array | null> {
  const path = normalizeRelativePath(relativePath);
  return await readBinaryFromPluginData(path);
}

export async function writeTextFile(relativePath: string, content: string): Promise<void> {
  const path = normalizeRelativePath(relativePath);
  await writeBinaryToPluginData(path, encodeText(content));
}

export async function writeBinaryFile(relativePath: string, data: Uint8Array | ArrayBuffer): Promise<void> {
  const path = normalizeRelativePath(relativePath);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  await writeBinaryToPluginData(path, bytes);
}

export async function removeSkillFile(skillFolder: string): Promise<void> {
  const primary = buildSkillPath(skillFolder, "skills.md");
  const fallback = buildSkillPath(skillFolder, "Skills.md");
  await removeFromPluginData(primary);
  if (fallback !== primary) {
    await removeFromPluginData(fallback);
  }
}

export async function getDisabledSkillFolders(): Promise<string[]> {
  return await readDisabledList();
}

export async function disableSkillFolder(folderName: string): Promise<void> {
  const entries = await readDisabledList();
  if (entries.includes(folderName)) return;
  entries.push(folderName);
  await writeDisabledList(entries);
}

export async function clearDisabledSkillFolders(): Promise<void> {
  await writeDisabledList([]);
}
