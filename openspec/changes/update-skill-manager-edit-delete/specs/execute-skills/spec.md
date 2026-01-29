## ADDED Requirements
### Requirement: Skill edit modal
The system SHALL provide an edit modal for `skills.md` with markdown preview.

#### Scenario: Edit skill content
- **WHEN** the user opens a skill for editing and saves changes
- **THEN** the updated `skills.md` is persisted and the skill list reflects the updated title/description

### Requirement: Skill deletion
The system SHALL allow users to delete skills from the manager with confirmation.

#### Scenario: Delete a skill
- **WHEN** the user confirms deletion
- **THEN** the skill is removed from storage and from the available skill list

## MODIFIED Requirements
### Requirement: Skill registry
The system SHALL load a combined list of built-in and user-defined skill definitions and expose them to the runtime, while deferring full content loading until execution.

#### Scenario: Skill list uses metadata only
- **WHEN** the skill manager renders the list
- **THEN** it uses only the metadata (title/description) without loading full instruction content

### Requirement: Skill storage structure
The system SHALL store skills under a plugin `Skills/` directory with a fixed structure: `Skills/<skillName>/skills.md`.

#### Scenario: Rename skill updates folder
- **WHEN** the user saves a skill with a new name
- **THEN** the skill folder is renamed to match the new name and the content is updated
