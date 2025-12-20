/**
 * Search service for Orca Note
 * Provides search functionality for blocks by tags and text content
 */

export interface SearchResult {
  id: number;
  title: string;
  content: string;
  created?: Date;
  modified?: Date;
  tags?: string[];
}

/**
 * Search blocks by tag name
 * @param tagName - The tag name to search for
 * @param maxResults - Maximum number of results to return (default: 50)
 * @returns Array of search results
 */
export async function searchBlocksByTag(
  tagName: string,
  maxResults: number = 50
): Promise<SearchResult[]> {
  console.log("[searchBlocksByTag] Called with:", { tagName, maxResults });

  try {
    // Validate input
    if (!tagName || typeof tagName !== "string") {
      console.error("[searchBlocksByTag] Invalid tagName:", tagName);
      return [];
    }

    // Use orca.invokeBackend to search for blocks with the specified tag
    console.log("[searchBlocksByTag] Calling orca.invokeBackend with tags:", [tagName]);
    const blocks = await orca.invokeBackend("get-blocks-with-tags", [tagName]);
    console.log("[searchBlocksByTag] Got blocks:", blocks);

    if (!Array.isArray(blocks)) {
      console.warn("[searchBlocksByTag] Result is not an array:", blocks);
      return [];
    }

    // Sort by modified date (most recent first) and limit results
    const sortedBlocks = blocks
      .sort((a: any, b: any) => {
        const aTime = a.modified ? new Date(a.modified).getTime() : 0;
        const bTime = b.modified ? new Date(b.modified).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, maxResults);

    // Transform to SearchResult format
    return sortedBlocks.map((block: any) => ({
      id: block.id,
      title: extractTitle(block),
      content: extractContent(block),
      created: block.created ? new Date(block.created) : undefined,
      modified: block.modified ? new Date(block.modified) : undefined,
      tags: block.aliases || [],
    }));
  } catch (error: any) {
    console.error(`Failed to search blocks by tag "${tagName}":`, error);
    throw new Error(`Tag search failed: ${error?.message ?? error ?? "unknown error"}`);
  }
}

/**
 * Search blocks by text content
 * @param searchText - The text to search for
 * @param maxResults - Maximum number of results to return (default: 50)
 * @returns Array of search results
 */
export async function searchBlocksByText(
  searchText: string,
  maxResults: number = 50
): Promise<SearchResult[]> {
  console.log("[searchBlocksByText] Called with:", { searchText, maxResults });

  try {
    // Validate input
    if (!searchText || typeof searchText !== "string") {
      console.error("[searchBlocksByText] Invalid searchText:", searchText);
      return [];
    }

    // Use orca.invokeBackend to search for blocks containing the text
    console.log("[searchBlocksByText] Calling orca.invokeBackend with text:", searchText);
    const blocks = await orca.invokeBackend("search-blocks-by-text", searchText);
    console.log("[searchBlocksByText] Got blocks:", blocks);

    if (!Array.isArray(blocks)) {
      console.warn("[searchBlocksByText] Result is not an array:", blocks);
      return [];
    }

    // Sort by modified date (most recent first) and limit results
    const sortedBlocks = blocks
      .sort((a: any, b: any) => {
        const aTime = a.modified ? new Date(a.modified).getTime() : 0;
        const bTime = b.modified ? new Date(b.modified).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, maxResults);

    // Transform to SearchResult format
    return sortedBlocks.map((block: any) => ({
      id: block.id,
      title: extractTitle(block),
      content: extractContent(block),
      created: block.created ? new Date(block.created) : undefined,
      modified: block.modified ? new Date(block.modified) : undefined,
      tags: block.aliases || [],
    }));
  } catch (error: any) {
    console.error(`Failed to search blocks by text "${searchText}":`, error);
    throw new Error(`Text search failed: ${error?.message ?? error ?? "unknown error"}`);
  }
}

/**
 * Extract title from block (first line or first N characters)
 */
function extractTitle(block: any): string {
  const text = safeText(block);
  if (!text) return "(untitled)";

  // Get first line or first 50 characters
  const firstLine = text.split("\n")[0];
  return firstLine.length > 50 ? firstLine.substring(0, 50) + "..." : firstLine;
}

/**
 * Extract content preview from block
 */
function extractContent(block: any): string {
  const text = safeText(block);
  if (!text) return "";

  // Return first 200 characters as preview
  return text.length > 200 ? text.substring(0, 200) + "..." : text;
}

/**
 * Extract safe text from block
 */
function safeText(block: any): string {
  if (!block) return "";
  if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) => (f?.t === "text" && typeof f.v === "string" ? f.v : ""))
      .join("")
      .trim();
  }
  return "";
}
