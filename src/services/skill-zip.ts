import { zipSync, unzipSync } from "fflate";
import type { SkillDefinition } from "./skill-service";
import { getSkillsRootPath, listDir, mkdirs, readBinaryFile, writeBinaryFile } from "./skill-fs";

async function collectFiles(relativeDir: string): Promise<string[]> {
  const entries = await listDir(relativeDir);
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = `${relativeDir}/${entry.name}`.replace(/\\/g, "/");
    if (entry.isDir) {
      files.push(...await collectFiles(entryPath));
    } else {
      if (entryPath.toLowerCase().endsWith("/skills.md")) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function downloadZip(bytes: Uint8Array, filename: string): void {
  const buffer = bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : new Uint8Array(bytes).buffer;
  const blob = new Blob([buffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportSkillsZip(skills: SkillDefinition[]): Promise<void> {
  if (skills.length === 0) return;

  const zipEntries: Record<string, Uint8Array> = {};
  const root = getSkillsRootPath();

  for (const skill of skills) {
    const skillPath = `${root}/${skill.folderName}`.replace(/\\/g, "/");
    const files = await collectFiles(skillPath);
    for (const filePath of files) {
      const bytes = await readBinaryFile(filePath);
      if (!bytes) continue;
      zipEntries[filePath] = bytes;
    }
  }

  const zipped = zipSync(zipEntries, { level: 6 });
  const filename = `skills-export-${new Date().toISOString().slice(0, 10)}.zip`;
  downloadZip(zipped, filename);
}

export async function importSkillsZip(file: File): Promise<number> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buffer);
  const root = `${getSkillsRootPath()}/`;
  const seenSkills = new Set<string>();

  for (const [path, data] of Object.entries(entries)) {
    const normalized = path.replace(/\\/g, "/");
    if (!normalized.startsWith(root)) continue;
    if (!normalized.toLowerCase().endsWith("/skills.md")) continue;

    const dir = normalized.split("/").slice(0, -1).join("/");
    if (dir) {
      await mkdirs(dir);
    }

    await writeBinaryFile(normalized, data);

    const skillName = normalized.slice(root.length).split("/")[0];
    if (skillName) seenSkills.add(skillName);
  }

  return seenSkills.size;
}
