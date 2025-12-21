/**
 * AI Tools Module
 * Defines available tools for AI and executes tool calls
 */

import type { OpenAITool } from "./openai-client";
import { searchBlocksByTag, searchBlocksByText, queryBlocksByTag } from "./search-service";
import { parsePropertyFilters } from "../utils/query-filter-parser";

/**
 * AI Tool definitions for OpenAI function calling
 */
export const TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "searchBlocksByTag",
      description: "Search for notes/blocks that have a specific tag. Use this when the user asks to find notes with a particular tag or category.",
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "The tag name to search for (e.g., '爱情', 'work', 'ideas')",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
        required: ["tagName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBlocksByText",
      description: "Search for notes/blocks containing specific text or keywords. Use this when the user wants to find notes by content.",
      parameters: {
        type: "object",
        properties: {
          searchText: {
            type: "string",
            description: "The text or keywords to search for",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
        required: ["searchText"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "queryBlocksByTag",
      description: "Advanced query for blocks with a specific tag and property filters. Use this when the user wants to filter notes by tag properties (e.g., 'find tasks with priority >= 8', 'find notes without a category'). This supports property comparisons like >=, >, <, <=, ==, !=, 'is null', 'not null'.",
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "The tag name to query for (e.g., 'task', 'note', 'project')",
          },
          tag: {
            type: "string",
            description: "Alias of tagName (some clients/models may send `tag` instead).",
          },
          properties: {
            type: "array",
            description: "Array of property filters to apply",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Property name (e.g., 'priority', 'category', 'author')",
                },
                op: {
                  type: "string",
                  description: "Comparison operator: '>=', '>', '<=', '<', '==', '!=', 'is null', 'not null', 'includes', 'not includes'",
                },
                value: {
                  description: "Value to compare against (can be string, number, or boolean). Not required for 'is null' and 'not null' operators.",
                },
              },
              required: ["name", "op"],
            },
          },
          property_filters: {
            type: "string",
            description: "Optional compact filter string like \"priority == 6\" or \"priority >= 8 and category is null\". Prefer `properties` when possible.",
          },
          propertyFilter: {
            type: "string",
            description: "Alias of `property_filters` (some clients/models may send `propertyFilter`).",
          },
          filter: {
            type: "string",
            description: "Alias of `property_filters` (some clients/models may send `filter`).",
          },
          query: {
            type: "string",
            description: "Alias of `property_filters` (some clients/models may send `query` like \"priority > 5\" along with `tagName`/`tag`).",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
        required: ["tagName"],
      },
    },
  },
];

/**
 * Format a property value for display
 */
function formatPropValue(value: any): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > 120 ? `${s.slice(0, 117)}...` : s;
  } catch {
    return String(value);
  }
}

/**
 * Execute a tool call and return the result
 * @param toolName - Name of the tool to execute
 * @param args - Arguments passed to the tool
 * @returns Result string to send back to AI
 */
export async function executeTool(toolName: string, args: any): Promise<string> {
  try {
    if (toolName === "searchBlocksByTag") {
      // Support multiple parameter names: tagName, tag, query
      const tagName = args.tagName || args.tag || args.query;
      const maxResults = args.maxResults || 50;

      if (!tagName) {
        console.error("[Tool] Missing tag name parameter");
        return "Error: Missing tag name parameter";
      }

      const results = await searchBlocksByTag(tagName, Math.min(maxResults, 50));

      if (results.length === 0) {
        return `No notes found with tag "${tagName}".`;
      }

      // Format with clickable block links
      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');  // Escape brackets
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} note(s) with tag "${tagName}":\n${summary}`;
    } else if (toolName === "searchBlocksByText") {
      // Support multiple parameter names: searchText, text, query, queries
      let searchText = args.searchText || args.text || args.query || args.queries;

      // Handle array parameters (AI sometimes sends ["text"] instead of "text")
      if (Array.isArray(searchText)) {
        searchText = searchText[0];
      }

      const maxResults = args.maxResults || 50;

      if (!searchText || typeof searchText !== "string") {
        console.error("[Tool] Missing or invalid search text parameter");
        return "Error: Missing search text parameter";
      }

      const results = await searchBlocksByText(searchText, Math.min(maxResults, 50));

      if (results.length === 0) {
        return `No notes found containing "${searchText}".`;
      }

      // Format with clickable block links
      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');  // Escape brackets
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} note(s) containing "${searchText}":\n${summary}`;
    } else if (toolName === "queryBlocksByTag") {
      // Advanced query with property filters
      let tagName = typeof args.tagName === "string"
        ? args.tagName
        : (typeof args.tag === "string" ? args.tag : undefined);

      const queryText = typeof args.query === "string" ? args.query : undefined;
      const propertyFiltersInput = args.property_filters
        ?? args.propertyFilters
        ?? args.propertyFilter
        ?? args.property_filter
        ?? args.filters
        ?? args.filter;
      let properties: any[] = [];

      if (Array.isArray(args.properties)) {
        properties = args.properties;
      } else if (args.properties && typeof args.properties === "object") {
        properties = [args.properties];
      } else if (typeof args.properties === "string") {
        properties = parsePropertyFilters(args.properties);
      }

      if (propertyFiltersInput !== undefined) {
        properties = [...properties, ...parsePropertyFilters(propertyFiltersInput)];
      }

      // Handle flat parameter format: { property, operator, value }
      // Some AI models send single property filter as flat args instead of properties array
      if (properties.length === 0 && args.property && args.operator) {
        const opMap: Record<string, string> = {
          ">=": ">=", ">": ">", "<=": "<=", "<": "<",
          "==": "==", "=": "==", "!=": "!=", "<>": "!=",
          "is null": "is null", "isnull": "is null", "null": "is null",
          "not null": "not null", "notnull": "not null", "not_null": "not null",
          "includes": "includes", "contains": "includes",
          "not includes": "not includes", "not_includes": "not includes",
        };
        const normalizedOp = opMap[String(args.operator).toLowerCase()] ?? args.operator;
        properties = [{
          name: args.property,
          op: normalizedOp,
          value: args.value,
        }];
        console.log("[queryBlocksByTag] Converted flat args to properties:", properties);
      }

      if (queryText && queryText.trim()) {
        if (tagName) {
          const trimmedTag = String(tagName).trim();
          const trimmedQuery = queryText.trim();
          if (trimmedQuery !== trimmedTag) {
            const parsedFromQuery = parsePropertyFilters(trimmedQuery);
            if (parsedFromQuery.length === 0) {
              return "Error: Unable to parse property filters from `query`. Use `properties` array or a string like \"priority == 6\".";
            }
            properties = [...properties, ...parsedFromQuery];
          }
        } else {
          const parsedFromQuery = parsePropertyFilters(queryText);
          if (parsedFromQuery.length > 0) {
            properties = [...properties, ...parsedFromQuery];
          } else {
            tagName = queryText;
          }
        }
      }
      const maxResults = args.maxResults || 50;

      if (!tagName) {
        console.error("[Tool] Missing tag name parameter");
        return "Error: Missing tag name parameter";
      }

      if (propertyFiltersInput !== undefined && properties.length === 0) {
        return "Error: Unable to parse property filters. Use `properties` array or a string like \"priority == 6\".";
      }

      const results = await queryBlocksByTag(tagName, {
        properties,
        maxResults: Math.min(maxResults, 50),
      });

      if (results.length === 0) {
        const filterDesc = properties.length > 0
          ? ` with filters: ${properties.map((p: any) => `${p.name} ${p.op} ${p.value ?? ''}`).join(', ')}`
          : '';
        return `No notes found with tag "${tagName}"${filterDesc}.`;
      }

      // Format with clickable block links
      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');  // Escape brackets
        const body = r.fullContent ?? r.content;
        const propValues = (r as any).propertyValues && typeof (r as any).propertyValues === "object"
          ? (r as any).propertyValues
          : null;
        const propSuffix = propValues && Object.keys(propValues).length > 0
          ? ` (${Object.entries(propValues).map(([k, v]) => `${k}=${formatPropValue(v)}`).join(", ")})`
          : "";
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})${propSuffix}\n${body}`;
      }).join("\n\n");

      const filterDesc = properties.length > 0
        ? ` (filtered by: ${properties.map((p: any) => `${p.name} ${p.op} ${p.value ?? ''}`).join(', ')})`
        : '';
      return `Found ${results.length} note(s) with tag "${tagName}"${filterDesc}:\n${summary}`;
    } else {
      console.error("[Tool] Unknown tool:", toolName);
      return `Unknown tool: ${toolName}`;
    }
  } catch (error: any) {
    console.error("[Tool] Error:", error);
    return `Error executing ${toolName}: ${error?.message ?? error ?? "unknown error"}`;
  }
}
