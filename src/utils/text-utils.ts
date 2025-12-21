/**
 * Shared text utility functions
 * Consolidates repeated text processing functions from multiple files
 */

/**
 * Generate a unique ID using timestamp and random string
 */
export function nowId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Extract safe text from a block-like object
 * Handles both direct text property and content array formats
 */
export function safeText(block: any): string {
  if (!block) return "";
  
  // Try direct text property first
  if (typeof block.text === "string" && block.text.trim()) {
    return block.text.trim();
  }
  
  // Handle content array format (Orca block format)
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) => {
        if (!f) return "";
        // Handle various content fragment formats
        if ((f.t === "text" || f.t === "t") && typeof f.v === "string") return f.v;
        if (typeof f.v === "string") return f.v;
        return "";
      })
      .join("")
      .trim();
  }
  
  return "";
}
