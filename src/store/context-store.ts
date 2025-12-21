import type { DbId } from "../orca.d.ts";
import { safeText } from "../utils/text-utils";

const { proxy } = (window as any).Valtio as {
  proxy: <T extends object>(obj: T) => T;
};

/**
 * Context reference types (simplified: only page and tag, no block-level)
 */
export type ContextRef =
  | { kind: "page"; rootBlockId: DbId; title: string }
  | { kind: "tag"; tag: string };

export function contextKey(ref: ContextRef): string {
  switch (ref.kind) {
    case "page":
      return `page:${ref.rootBlockId}`;
    case "tag":
      return `tag:${normalizeTagName(ref.tag)}`;
  }
}

export function normalizeTagName(tag: string): string {
  const trimmed = tag.trim();
  if (trimmed.startsWith("#")) return trimmed.slice(1);
  return trimmed;
}

type ContextStore = {
  selected: ContextRef[];
};

export const contextStore = proxy<ContextStore>({
  selected: [],
});

export function addContext(ref: ContextRef): boolean {
  const key = contextKey(ref);
  if (contextStore.selected.some((c) => contextKey(c) === key)) return false;
  contextStore.selected = [...contextStore.selected, ref];
  return true;
}

/**
 * Add current active page as context
 */
export function addCurrentPage(rootBlockId: DbId, title: string): boolean {
  return addContext({ kind: "page", rootBlockId, title });
}

/**
 * Add a page by ID (fetches title from orca.state.blocks)
 */
export function addPageById(rootBlockId: DbId): boolean {
  const block = (orca.state.blocks as any)?.[rootBlockId];
  const title = safeText(block) || `Page ${rootBlockId}`;
  return addContext({ kind: "page", rootBlockId, title });
}

/**
 * Add a tag as context
 */
export function addTagContext(tag: string): boolean {
  const normalized = normalizeTagName(tag);
  if (!normalized) return false;
  return addContext({ kind: "tag", tag: normalized });
}

export function removeContext(key: string): void {
  contextStore.selected = contextStore.selected.filter((c) => contextKey(c) !== key);
}

export function clearContexts(): void {
  contextStore.selected = [];
}

/**
 * Get display label for a context ref (used in chips)
 */
export function getDisplayLabel(ref: ContextRef): string {
  switch (ref.kind) {
    case "page":
      return ref.title || `Page ${ref.rootBlockId}`;
    case "tag":
      return `#${ref.tag}`;
  }
}
