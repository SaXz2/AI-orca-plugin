# Change: Add Markdown Syntax Support to createBlock Tool

## Why

Currently, the `createBlock` AI tool only creates blocks with plain text content, even when users provide Markdown syntax (e.g., `**bold**`, `*italic*`, `[links]`). This forces users to manually format content after block creation, reducing productivity and breaking the natural flow of AI-assisted note-taking.

Orca's editor natively supports Markdown parsing via `core.editor.batchInsertText`, but `createBlock` doesn't leverage this capability.

## What Changes

- Enhance `createBlock` tool to automatically parse Markdown syntax in `content` parameter
- Use Orca's built-in `core.editor.batchInsertText` command instead of raw content fragments
- Maintain backward compatibility with existing plain text usage
- Preserve existing navigation and error handling logic

## Impact

**Affected specs:**
- `ai-tools` - CreateBlock tool specification

**Affected code:**
- `src/services/ai-tools.ts` (executeTool function, createBlock case)

**Benefits:**
- ✅ AI can create properly formatted blocks (bold, italic, links, code, etc.)
- ✅ One-step block creation with formatting (no manual post-editing)
- ✅ Consistent with how users manually paste Markdown in Orca
- ✅ Better user experience for AI-assisted workflows

**Non-breaking:**
- Plain text content continues to work (Markdown parser handles plain text)
- All existing `createBlock` calls remain valid
- No changes to tool parameters or return format
