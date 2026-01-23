/**
 * Property utility functions for Orca Note
 * Provides property extraction from blocks and their references
 */

import { PropType } from "./query-types";
import { extractTitle, extractContent } from "./text-utils";
import { unwrapBackendResult, throwIfBackendError } from "./block-utils";

export interface BlockRefSummary {
  id: number;
  title: string;
  content: string;
}

type ExpandBlockRefOptions = {
  blockMap?: Map<number, any>;
  allowedIds?: Set<number>;
  collectIds?: Set<number>;
};

const DELETED_BLOCK_TITLE = "(已删除)";

function toBlockRefId(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildRefTargetMap(block: any): Map<number, number> {
  const map = new Map<number, number>();
  if (!block || !Array.isArray(block.refs)) return map;

  for (const ref of block.refs) {
    const refId = toBlockRefId(ref?.id);
    const targetId = toBlockRefId(ref?.to);
    if (refId === null || targetId === null) continue;
    if (!map.has(refId)) {
      map.set(refId, targetId);
    }
  }

  return map;
}

function addBlockRefPropertyNames(list: any, out: Set<string>): void {
  if (!Array.isArray(list)) return;
  for (const prop of list) {
    if (!prop || typeof prop !== "object") continue;
    const name = typeof prop.name === "string" ? prop.name.trim() : "";
    if (!name) continue;
    const type = Number((prop as any).type);
    if (type === PropType.BlockRefs) {
      out.add(name.toLowerCase());
    }
  }
}

function collectBlockRefPropertyNames(block: any): Set<string> {
  const names = new Set<string>();
  if (!block || typeof block !== "object") return names;

  addBlockRefPropertyNames(block.properties, names);

  if (Array.isArray(block.refs)) {
    for (const ref of block.refs) {
      addBlockRefPropertyNames(ref?.data, names);
    }
  }

  if (Array.isArray(block.backRefs)) {
    for (const ref of block.backRefs) {
      addBlockRefPropertyNames(ref?.data, names);
    }
  }

  return names;
}

function buildBlockRefSummary(blockId: number, block: any | undefined): BlockRefSummary {
  if (!block) {
    return { id: blockId, title: DELETED_BLOCK_TITLE, content: "" };
  }
  return {
    id: blockId,
    title: extractTitle(block),
    content: extractContent(block),
  };
}

export async function batchFetchBlocks(ids: Array<number | string>): Promise<Map<number, any>> {
  const normalized: number[] = [];
  const seen = new Set<number>();

  for (const id of ids) {
    const parsed = toBlockRefId(id);
    if (parsed === null || seen.has(parsed)) continue;
    seen.add(parsed);
    normalized.push(parsed);
  }

  if (normalized.length === 0) return new Map();

  const result = await orca.invokeBackend("get-blocks", normalized);
  const payload = unwrapBackendResult<any>(result);
  throwIfBackendError(payload, "get-blocks");

  const blocks = Array.isArray(payload) ? payload : [];
  const map = new Map<number, any>();
  for (const block of blocks) {
    if (block && typeof block.id === "number") {
      map.set(block.id, block);
    }
  }
  return map;
}

/**
 * 展开 block-ref 类型属性，将块 ID 数组转换为块摘要数组（支持 ref.id -> ref.to 映射）。
 */
export async function expandBlockRefProperties(
  propertyValues: Record<string, any> | undefined,
  block: any,
  options: ExpandBlockRefOptions = {}
): Promise<Record<string, any> | undefined> {
  if (!propertyValues || typeof propertyValues !== "object") return propertyValues;

  const blockRefNames = collectBlockRefPropertyNames(block);
  if (!blockRefNames.size) return propertyValues;

  const { blockMap, allowedIds, collectIds } = options;
  const shouldExpand = Boolean(blockMap);
  let didChange = false;
  const expanded: Record<string, any> = shouldExpand ? { ...propertyValues } : propertyValues;
  const refTargetMap = buildRefTargetMap(block);
  const loggedRefIds = new Set<number>();

  for (const [name, value] of Object.entries(propertyValues)) {
    if (!blockRefNames.has(name.toLowerCase())) continue;
    const list = Array.isArray(value) ? value : value == null ? [] : [value];

    if (collectIds) {
      for (const item of list) {
        const id = toBlockRefId(item);
        if (id === null) continue;
        const resolved = refTargetMap.get(id);
        if (resolved !== undefined) {
          if (shouldExpand && !loggedRefIds.has(id)) {
            console.log(
              `[expandBlockRefProperties] Resolving ref ${id} to block ${resolved}`
            );
            loggedRefIds.add(id);
          }
          collectIds.add(resolved);
        } else {
          collectIds.add(id);
        }
      }
    }

    if (!shouldExpand) continue;

    const nextList = list.map((item) => {
      const id = toBlockRefId(item);
      if (id === null) return item;
      const resolved = refTargetMap.get(id);
      const targetId = resolved ?? id;
      if (resolved !== undefined && !loggedRefIds.has(id)) {
        console.log(
          `[expandBlockRefProperties] Resolving ref ${id} to block ${resolved}`
        );
        loggedRefIds.add(id);
      }
      if (allowedIds && !allowedIds.has(targetId)) return item;
      return buildBlockRefSummary(targetId, blockMap?.get(targetId));
    });

    expanded[name] = nextList;
    didChange = true;
  }

  if (!shouldExpand || !didChange) return propertyValues;
  return expanded;
}

/**
 * Find property value in a properties array by name (case-insensitive fallback)
 */
export function findPropertyValueInList(list: any, propertyName: string): any | undefined {
  if (!Array.isArray(list)) return undefined;
  const target = String(propertyName ?? "").trim();
  if (!target) return undefined;

  const exact = list.find((p: any) => p && typeof p.name === "string" && p.name === target);
  if (exact && "value" in exact) return exact.value;

  const lowered = target.toLowerCase();
  const ci = list.find((p: any) => p && typeof p.name === "string" && p.name.toLowerCase() === lowered);
  if (ci && "value" in ci) return ci.value;

  return undefined;
}

/**
 * Extract a specific property value from a block, checking properties, refs, and backRefs
 */
export function extractPropertyValueFromBlock(block: any, propertyName: string): any | undefined {
  const fromProps = findPropertyValueInList(block?.properties, propertyName);
  if (fromProps !== undefined) return fromProps;

  const refs = Array.isArray(block?.refs) ? block.refs : [];
  for (const ref of refs) {
    const fromRef = findPropertyValueInList(ref?.data, propertyName);
    if (fromRef !== undefined) return fromRef;
  }

  const backRefs = Array.isArray(block?.backRefs) ? block.backRefs : [];
  for (const ref of backRefs) {
    const fromRef = findPropertyValueInList(ref?.data, propertyName);
    if (fromRef !== undefined) return fromRef;
  }

  return undefined;
}

/**
 * Build a property values object from a list of property names
 */
export function buildPropertyValues(block: any, names: string[]): Record<string, any> | undefined {
  const out: Record<string, any> = {};
  const seen = new Set<string>();

  for (const nameRaw of names) {
    const name = String(nameRaw ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const value = extractPropertyValueFromBlock(block, name);
    if (value !== undefined) out[name] = value;
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * Pick the best block object for property extraction from block/tree pair
 */
export function pickBlockForPropertyExtraction(block: any, tree: any): any {
  if (block && typeof block === "object") return block;
  if (!tree) return block;

  if (Array.isArray(tree)) {
    const candidate = tree.find((item) => item && typeof item === "object");
    return candidate ?? block;
  }

  if (tree && typeof tree === "object" && typeof (tree as any).block === "object") {
    return (tree as any).block;
  }

  if (tree && typeof tree === "object") return tree;

  return block;
}

/**
 * Extract all property values from a block, including properties from refs and backRefs.
 * This collects all tag properties (like priority, date, status) attached to the block.
 * @param block - The block object to extract properties from
 * @returns Record of property name to value, or undefined if no properties found
 */
export function extractAllProperties(block: any): Record<string, any> | undefined {
  if (!block || typeof block !== "object") return undefined;

  const out: Record<string, any> = {};
  const seen = new Set<string>();

  // Helper to add a property if not already seen
  const addProperty = (prop: any) => {
    if (!prop || typeof prop !== "object") return;
    const name = prop.name;
    if (typeof name !== "string" || !name.trim()) return;
    if (seen.has(name)) return;
    seen.add(name);
    if ("value" in prop && prop.value !== undefined) {
      out[name] = prop.value;
    }
  };

  // 1. Extract from direct properties
  if (Array.isArray(block.properties)) {
    for (const prop of block.properties) {
      addProperty(prop);
    }
  }

  // 2. Extract from refs (tag properties are usually stored here)
  if (Array.isArray(block.refs)) {
    for (const ref of block.refs) {
      if (Array.isArray(ref?.data)) {
        for (const prop of ref.data) {
          addProperty(prop);
        }
      }
    }
  }

  // 3. Extract from backRefs
  if (Array.isArray(block.backRefs)) {
    for (const ref of block.backRefs) {
      if (Array.isArray(ref?.data)) {
        for (const prop of ref.data) {
          addProperty(prop);
        }
      }
    }
  }

  return Object.keys(out).length ? out : undefined;
}
