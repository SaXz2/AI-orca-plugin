# AI Tools Capability - Spec Delta

## ADDED Requirements

### Requirement: Markdown Syntax Parsing in createBlock

The `createBlock` AI tool SHALL automatically parse Markdown syntax in the `content` parameter using Orca's built-in Markdown parser.

**Rationale**: Enable AI to create properly formatted blocks in a single operation, matching manual paste behavior and improving user productivity.

#### Scenario: Create block with bold formatting

- **GIVEN** user requests AI to create a block with bold text
- **WHEN** AI calls `createBlock({ refBlockId: 100, content: "**Important**" })`
- **THEN** system creates a new block with "Important" rendered in bold
- **AND** returns success message with block ID

#### Scenario: Create block with italic formatting

- **GIVEN** user requests AI to create a block with italic text
- **WHEN** AI calls `createBlock({ refBlockId: 100, content: "*Note*" })`
- **THEN** system creates a new block with "Note" rendered in italic
- **AND** returns success message with block ID

#### Scenario: Create block with wiki-link

- **GIVEN** user requests AI to create a block referencing another page
- **WHEN** AI calls `createBlock({ refBlockId: 100, content: "See [[Project A]]" })`
- **THEN** system creates a new block with clickable wiki-link to "Project A"
- **AND** returns success message with block ID

#### Scenario: Create block with inline code

- **GIVEN** user requests AI to create a block with code snippet
- **WHEN** AI calls `createBlock({ refBlockId: 100, content: "Use `npm install` command" })`
- **THEN** system creates a new block with "npm install" rendered as inline code
- **AND** returns success message with block ID

#### Scenario: Create block with mixed Markdown

- **GIVEN** user requests AI to create a formatted note
- **WHEN** AI calls `createBlock({ refBlockId: 100, content: "**Review** [[Design Doc]] by *Friday*" })`
- **THEN** system creates a new block with combined formatting (bold, link, italic)
- **AND** returns success message with block ID

#### Scenario: Create block with plain text (backward compatibility)

- **GIVEN** user requests AI to create a plain text block
- **WHEN** AI calls `createBlock({ refBlockId: 100, content: "Regular text" })`
- **THEN** system creates a new block with plain text (no special formatting)
- **AND** behavior is identical to previous implementation
- **AND** returns success message with block ID

### Requirement: Multi-line Content Handling

The `createBlock` tool SHALL create multiple sibling blocks when `content` contains newline characters (`\n`).

**Rationale**: Leverage Orca's `batchInsertText` behavior for consistent multi-line paste handling.

#### Scenario: Create multiple blocks from multi-line content

- **GIVEN** user provides multi-line content
- **WHEN** AI calls `createBlock({ refBlockId: 100, position: "lastChild", content: "Line 1\nLine 2" })`
- **THEN** system creates two sibling blocks as children of block 100
- **AND** first block contains "Line 1"
- **AND** second block contains "Line 2"
- **AND** both blocks are at the same hierarchy level

**Note**: This is a behavior change from the previous single-block implementation. For 99% of use cases (single-line content), there is no difference.

## MODIFIED Requirements

### Requirement: createBlock Tool Implementation

The `createBlock` tool SHALL use `core.editor.batchInsertText` command instead of `core.editor.insertBlock` with the following parameters:
- `cursor`: `null` (programmatic insert doesn't need cursor context)
- `refBlock`: Resolved reference block
- `position`: User-specified position (`before`, `after`, `firstChild`, `lastChild`)
- `text`: User-provided content string
- `skipMarkdown`: `false` (enable Markdown parsing)
- `skipTags`: `false` (preserve tag extraction from content)

**Return Value**: The tool SHALL return the first block ID from the array returned by `batchInsertText`.

**Unchanged Behavior**:
- Navigation logic (smart page detection, panel management)
- Error handling (missing ref, invalid position)
- Parameter parsing and validation
- Page name resolution via `getPageByName`

#### Scenario: Internal command usage

- **GIVEN** createBlock receives valid parameters
- **WHEN** executing block creation
- **THEN** system calls `orca.commands.invokeEditorCommand("core.editor.batchInsertText", null, refBlock, position, content, false, false)`
- **AND** returns first created block ID in success message

## REMOVED Requirements

None. This change is purely additive and maintains backward compatibility with all existing createBlock usage.

---

## Cross-Reference

**Related Capabilities**: None (isolated change to AI tools)

**Dependencies**:
- Orca Core API: `core.editor.batchInsertText` command
- Orca Core API: Markdown parsing subsystem (built-in, no plugin dependency)

**Migration**: None required (non-breaking enhancement)
