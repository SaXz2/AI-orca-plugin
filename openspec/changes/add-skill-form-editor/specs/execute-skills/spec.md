## ADDED Requirements
### Requirement: Skill form editor
The system SHALL provide a simplified form mode in the skill editor that allows users to select a tool, fill parameters, and generate `skills.md` without manually writing YAML.

#### Scenario: Build a skill from a tool form
- **WHEN** the user selects a tool and fills parameters in the form mode
- **THEN** the editor generates `skills.md` content that matches the selected tool and parameter values

#### Scenario: Mark parameters as inputs
- **WHEN** the user marks a parameter as an input instead of a fixed value
- **THEN** the generated `skills.md` uses a `{{param}}` placeholder and includes an input definition
