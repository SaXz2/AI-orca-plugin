## ADDED Requirements
### Requirement: Built-in skill restore action
The system SHALL provide a restore action that re-enables built-in skills by clearing the disabled built-in list and reloading defaults without affecting user-defined skills.

#### Scenario: Restore built-in skills
- **WHEN** the user clicks "Restore built-in skills" in the skill manager
- **THEN** the disabled built-in list is cleared and built-in skills reappear after reload

#### Scenario: Preserve user skills
- **WHEN** the restore action runs
- **THEN** user-defined skills remain unchanged
