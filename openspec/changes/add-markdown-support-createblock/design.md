# Technical Design: Markdown Support in createBlock

## Problem Analysis

### Current Implementation (ai-tools.ts:984-1067)

```typescript
// Prepare content fragments
const contentFragments = [{ t: "t", v: content }];

// ... navigation logic ...

// Insert block using editor command
await orca.commands.invokeEditorCommand(
  "core.editor.insertBlock",
  null,
  refBlock,
  position,
  contentFragments,  // ❌ Plain text only
);
```

**Issue**: `contentFragments` contains raw text without Markdown parsing.

### Orca's Markdown Parser

Orca provides `core.editor.batchInsertText` (Core-Editor-Commands.md:51-74):

```typescript
await orca.commands.invokeEditorCommand(
  "core.editor.batchInsertText",
  cursor,
  refBlock,
  position,
  text,           // String content
  skipMarkdown,   // Boolean (default: false) ✅
  skipTags,       // Boolean (default: false)
);
```

**Key Feature**: When `skipMarkdown = false`, Orca automatically:
- Parses `**bold**` → bold formatting
- Parses `*italic*` → italic formatting
- Parses `[[links]]` → wiki-links
- Parses `` `code` `` → inline code
- Parses other Markdown syntax as per Orca's implementation

## Solution

### Approach: Replace insertBlock with batchInsertText

**Advantages:**
1. ✅ Leverages Orca's battle-tested Markdown parser
2. ✅ No custom parsing logic needed
3. ✅ Consistent with manual paste behavior
4. ✅ Handles edge cases (nested formatting, escaping, etc.)

**Trade-offs:**
- `batchInsertText` processes multi-line text by creating multiple blocks (one per line)
- For single-line content (99% of createBlock use cases), behavior is identical
- Multi-line content would create sibling blocks instead of single block with newlines

**Decision**: Proceed with `batchInsertText` because:
- Most AI createBlock calls are single-line (e.g., "Add a todo: **Review PR**")
- Multi-line content creating multiple blocks is often the *desired* behavior
- If users need multi-line single-block, they can use `\\n` escape sequences

### Implementation Changes

**File**: `src/services/ai-tools.ts`

**Location**: Line ~1039-1067 (createBlock case in executeTool)

**Change**:

```typescript
// OLD CODE (remove):
const contentFragments = [{ t: "t", v: content }];
await orca.commands.invokeEditorCommand(
  "core.editor.insertBlock",
  null,
  refBlock,
  position,
  contentFragments,
);

// NEW CODE (replace with):
await orca.commands.invokeEditorCommand(
  "core.editor.batchInsertText",
  null,                    // cursor (not needed for programmatic insert)
  refBlock,                // reference block
  position,                // position
  content,                 // text content (Markdown will be parsed)
  false,                   // skipMarkdown = false (enable Markdown parsing)
  false,                   // skipTags = false (preserve tag extraction)
);
```

**Return Value Handling**:
- `insertBlock` returns `newBlockId: DbId`
- `batchInsertText` returns `DbId[]` (array of created block IDs)
- Update return message to use first block ID: `newBlockId = result[0]`

### Preserved Logic

**Keep unchanged:**
1. ✅ Smart navigation logic (ai-tools.ts:987-1036)
2. ✅ Error handling (missing ref, invalid position)
3. ✅ Parameter parsing (refBlockId, pageName, position, content)
4. ✅ Page name resolution (getPageByName)
5. ✅ Dual-path block fetching (state → backend fallback)

### Edge Cases

| Scenario | Behavior | Notes |
|----------|----------|-------|
| Plain text `"Hello"` | Creates plain text block | ✅ No regression |
| Markdown `"**Bold**"` | Creates block with bold text | ✅ New feature |
| Multi-line `"Line1\\nLine2"` | Creates 2 blocks (Line1, Line2) | ⚠️ Behavior change |
| Empty string `""` | Error: "Content cannot be empty" | ✅ Existing validation |
| Escape sequences `"\\*not italic\\*"` | Orca handles escaping | ✅ Delegates to Orca |

**Multi-line Note**: If this becomes a problem, we can add a parameter `parseMarkdown: boolean = true` in the future. For now, simpler is better (YAGNI principle).

## Testing Strategy

### Manual Tests

1. **Bold formatting**: `createBlock({ refBlockId: 100, content: "**Important note**" })`
   - Verify: Block created with bold text
2. **Mixed formatting**: `createBlock({ refBlockId: 100, content: "Review [[Project A]] by *tomorrow*" })`
   - Verify: Link and italic rendering
3. **Plain text**: `createBlock({ refBlockId: 100, content: "Regular text" })`
   - Verify: No regression, works as before

### Automated Tests

No new unit tests required (delegating to Orca's tested parser).

If needed in future, add test:
```typescript
// tests/createBlock-markdown.test.ts
it("should parse Markdown in createBlock content", async () => {
  const result = await executeTool("createBlock", {
    refBlockId: 100,
    content: "**bold** and *italic*"
  });
  // Assert: result contains success message
});
```

## Migration Path

**None needed** - This is a pure enhancement, not a breaking change.

Existing calls like:
```typescript
createBlock({ refBlockId: 100, content: "Plain text" })
```
Continue to work identically (Markdown parser treats plain text as-is).

## Rollback Plan

If issues arise:
1. Revert `batchInsertText` → `insertBlock` change
2. Restore `contentFragments` construction
3. No data migration needed (blocks already created are unaffected)

## Future Enhancements (Out of Scope)

- Add `parseMarkdown: boolean` parameter to allow disabling Markdown (if users need it)
- Support custom `repr` parameter for block types (code blocks, headings, etc.)
- Batch creation API for creating multiple formatted blocks at once

These are deferred per KISS/YAGNI principles until user demand is proven.
