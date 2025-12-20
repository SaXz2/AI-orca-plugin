# Search Service Changelog

## 2025-12-20 - Major Fixes & Optimizations

### ✅ Fixed Critical Issues

1. **Search API Data Format Incompatibility**
   - Added `unwrapBlocks()` to handle `[aliasMatches, contentMatches]` tuples from `search-blocks-by-text`
   - Fixed empty search results issue

2. **Content Extraction Failure**
   - Updated `safeText()` to support `t: "t"` shorthand (in addition to `t: "text"`)
   - Fixed empty content in search results

3. **AI Tool Call Parameter Handling**
   - Added array parameter support (`["text"]` → `"text"`)
   - Support multiple parameter names: `searchText`, `text`, `query`, `queries`

### 🎯 New Features

- **Child Blocks Retrieval**: Both `searchBlocksByTag` and `searchBlocksByText` now fetch complete block trees (parent + children)
- **Token Optimization**: Streamlined output format (removed redundant tags, dates, formatting)
- **Robust Error Handling**: Graceful degradation for API failures

### 📝 Code Changes

**Modified Files**:
- `src/services/search-service.ts`: Added `unwrapBlocks()`, enhanced `safeText()`, integrated `get-block-tree` calls
- `src/views/AiChatPanel.tsx`: Updated tool parameter handling, output formatting

**New Files**:
- `TROUBLESHOOTING.md`: Comprehensive guide for common issues

### 📊 Performance Impact

**Token Savings**: ~60% reduction per search result
- Before: ~120 tokens/item (with date, tags, multi-line formatting)
- After: ~40-50 tokens/item (compact, content-focused)

**Example**:
```
Before (50 results): ~6000 tokens
After (50 results):  ~2000-2500 tokens
Saved:              ~3500-4000 tokens (60%)
```

### 🔧 Technical Details

**API Response Formats Handled**:
```typescript
// search-blocks-by-text
[aliasMatches[], contentMatches[]]  // Unwrap and merge

// get-blocks-with-tags
blocks[] or [count, blocks[]]       // Handle both formats

// get-block-tree
[status, tree] or tree              // Unwrap if needed
```

**Content Fragment Types**:
```typescript
// Standard format
{ t: "text", v: "content" }

// Shorthand (now supported)
{ t: "t", v: "content" }
```

### 📚 Documentation Updates

- Updated `CLAUDE.md` with Search Service module and API usage notes
- Created `TROUBLESHOOTING.md` with detailed problem-solution mappings
- Added inline comments explaining data transformations

### 🧪 Testing Notes

**Verified Scenarios**:
- ✅ Search by tag with child blocks
- ✅ Search by text with child blocks
- ✅ Array parameter conversion
- ✅ Multiple parameter name aliases
- ✅ Empty result handling
- ✅ API error graceful degradation

---

For troubleshooting guidance, see [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).
