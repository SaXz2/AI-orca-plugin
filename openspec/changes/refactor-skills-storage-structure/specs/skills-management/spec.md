# Skills Management System - Delta Spec

## ADDED Requirements

### Requirement: Skills Manager Service
The system SHALL provide a `SkillsManager` service that manages Skills with a folder-based storage structure. Each Skill is stored in a folder named after its ID, containing a `SKILL.md` file with metadata and instruction, and optional `scripts/` subfolder for script files.

#### Scenario: Create a new Skill
- **WHEN** `createSkill(skillId, metadata, instruction)` is called
- **THEN** a new Skill folder is created with `SKILL.md` containing YAML frontmatter metadata and instruction content
- **AND** the Skill is enabled by default

#### Scenario: Retrieve Skill details
- **WHEN** `getSkill(skillId)` is called
- **THEN** the system returns a `Skill` object containing id, metadata, instruction, files list, and enabled status
- **AND** metadata is parsed from SKILL.md frontmatter

#### Scenario: List all Skills
- **WHEN** `listSkills()` is called
- **THEN** the system returns an array of all Skill IDs in the skills folder
- **AND** the list is sorted alphabetically

### Requirement: Skill Metadata System
The system SHALL support YAML frontmatter in SKILL.md files to store Skill metadata including id, name, description, version, author, tags, and custom fields.

#### Scenario: Parse metadata from SKILL.md
- **WHEN** a SKILL.md file is read
- **THEN** the system extracts YAML frontmatter between `---` markers
- **AND** parses fields like `name`, `description`, `version`, `author`, `tags`
- **AND** returns remaining content as instruction text

#### Scenario: Generate SKILL.md with metadata
- **WHEN** `updateSkill()` is called with metadata and instruction
- **THEN** the system generates SKILL.md with YAML frontmatter containing all metadata fields
- **AND** appends the instruction content after the frontmatter

### Requirement: Skill File Management
The system SHALL provide operations to manage files within a Skill folder, including reading, writing, and deleting files in any location (including `scripts/` subfolder).

#### Scenario: Write a script file to Skill
- **WHEN** `writeSkillFile(skillId, "scripts/process.py", content)` is called
- **THEN** the system creates the file at `skills/[skillId]/scripts/process.py`
- **AND** creates parent directories as needed

#### Scenario: Read a script file from Skill
- **WHEN** `readSkillFile(skillId, "scripts/process.py")` is called
- **THEN** the system returns the file content as a string
- **AND** returns null if the file does not exist

#### Scenario: List files in a Skill
- **WHEN** `listSkillFiles(skillId)` is called
- **THEN** the system returns an array of `SkillFile` objects
- **AND** each object contains path, name, and isDir flag
- **AND** the list is sorted by name

#### Scenario: Delete a file from Skill
- **WHEN** `deleteSkillFile(skillId, filePath)` is called
- **THEN** the system removes the file from the Skill folder
- **AND** returns true on success, false on failure

### Requirement: Skill Enable/Disable Mechanism
The system SHALL support enabling and disabling Skills without deleting them. Disabled Skills are stored in plugin data with key `skills:disabled:[skillId]`.

#### Scenario: Check if Skill is enabled
- **WHEN** `isSkillEnabled(skillId)` is called
- **THEN** the system returns true if the Skill is enabled
- **AND** returns false if the Skill is disabled
- **AND** returns true by default if no state is stored

#### Scenario: Disable a Skill
- **WHEN** `setSkillEnabled(skillId, false)` is called
- **THEN** the system stores the disabled state in plugin data
- **AND** the Skill remains in storage but is marked as disabled

#### Scenario: Enable a Skill
- **WHEN** `setSkillEnabled(skillId, true)` is called
- **THEN** the system removes the disabled state from plugin data
- **AND** the Skill becomes available for use

### Requirement: Skill Import/Export
The system SHALL support exporting Skills to JSON format and importing Skills from JSON format for backup and sharing purposes.

#### Scenario: Export a Skill to JSON
- **WHEN** `exportSkill(skillId)` is called
- **THEN** the system returns a JSON string containing id, metadata, instruction, and enabled status
- **AND** the JSON is formatted with 2-space indentation

#### Scenario: Import a Skill from JSON
- **WHEN** `importSkill(skillId, jsonContent)` is called with valid JSON
- **THEN** the system creates a new Skill with the provided data
- **AND** sets the enabled status from the JSON
- **AND** returns true on success

### Requirement: Skill Deletion
The system SHALL support deleting entire Skill folders including all files and metadata.

#### Scenario: Delete a Skill
- **WHEN** `deleteSkill(skillId)` is called
- **THEN** the system removes the entire Skill folder and all its contents
- **AND** removes any associated disabled state
- **AND** returns true on success, false on failure

### Requirement: Storage Backend Integration
The system SHALL use `orca.plugins.setData/getData` for persistent storage, storing files with keys prefixed by `skills-fs:` to maintain compatibility with the plugin data system.

#### Scenario: Store Skill file in plugin data
- **WHEN** a Skill file is written
- **THEN** the system stores it using `orca.plugins.setData(pluginName, "skills-fs:skills/[skillId]/[filePath]", content)`
- **AND** uses base64 encoding for binary data with prefix `b64:`

#### Scenario: Retrieve Skill file from plugin data
- **WHEN** a Skill file is read
- **THEN** the system retrieves it using `orca.plugins.getData(pluginName, "skills-fs:skills/[skillId]/[filePath]")`
- **AND** decodes base64 data if the prefix `b64:` is present

## MODIFIED Requirements

### Requirement: Skill Storage
The system SHALL store Skills in a folder-based structure where each Skill is stored in a folder named after its ID, containing a `SKILL.md` file with YAML frontmatter metadata and instruction content, and optional `scripts/` subfolder for script files. This replaces the previous flat file storage model.

#### Scenario: Migrate old Skill format to new format
- **WHEN** a migration script is run
- **THEN** the system reads old `skills/[skillId]/skills.md` files
- **AND** converts them to new `skills/[skillId]/SKILL.md` format with YAML frontmatter
- **AND** preserves all metadata and instruction content
- **AND** creates a backup of the original data

#### Scenario: Store Skill with scripts
- **WHEN** a Skill contains script files
- **THEN** the system stores them in `skills/[skillId]/scripts/` subfolder
- **AND** supports any script file type (.py, .js, etc.)
- **AND** maintains the folder structure in plugin data

## REMOVED Requirements

### Requirement: Flat Skill File Storage (from old skill-fs.ts)
**Reason**: The flat file storage model is replaced by a more flexible folder-based structure that supports scripts and better organization.

**Migration**: All code using `skill-fs.ts` functions must be updated to use the new `SkillsManager` API. A migration guide will be provided.

**Deprecation timeline**:
- Phase 1: New `SkillsManager` is available alongside old `skill-fs.ts`
- Phase 2: Old `skill-fs.ts` is marked as deprecated
- Phase 3: Old `skill-fs.ts` is removed in a future release
