import { zipSync, unzipSync } from "fflate";
import type { SkillDefinition } from "../types/skill";
import { serializeSkillMd, parseSkillMd, createSkill } from "./skill-service";

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

/**
 * Exports skills as a ZIP file containing SKILL.md files.
 * Each skill is exported as a separate SKILL.md file.
 * 
 * @param skills - Array of skills to export
 */
export async function exportSkillsZip(skills: SkillDefinition[]): Promise<void> {
  if (skills.length === 0) return;

  const zipEntries: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  for (const skill of skills) {
    // Serialize skill to SKILL.md format
    const content = serializeSkillMd(skill.metadata, skill.instruction);
    const bytes = encoder.encode(content);
    
    // Use skill name as filename (sanitized)
    const safeName = skill.metadata.name.replace(/[\\/:*?"<>|]/g, "_").trim();
    const filename = `${safeName}/SKILL.md`;
    zipEntries[filename] = bytes;
  }

  const zipped = zipSync(zipEntries, { level: 6 });
  const filename = `skills-export-${new Date().toISOString().slice(0, 10)}.zip`;
  downloadZip(zipped, filename);
}

/**
 * Imports skills from a ZIP file containing SKILL.md files.
 * 
 * @param file - ZIP file to import
 * @returns Number of skills imported
 */
export async function importSkillsZip(file: File): Promise<number> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buffer);
  const decoder = new TextDecoder();
  let importedCount = 0;

  for (const [path, data] of Object.entries(entries)) {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    
    // Look for SKILL.md files
    if (!normalized.endsWith("/skill.md") && !normalized.endsWith("skill.md")) {
      continue;
    }

    try {
      const content = decoder.decode(data);
      const { metadata, instruction } = parseSkillMd(content);
      
      // Create skill in IndexedDB
      await createSkill(metadata.name, metadata.description, instruction);
      importedCount++;
    } catch (err) {
      console.error(`Failed to import skill from ${path}:`, err);
    }
  }

  return importedCount;
}
