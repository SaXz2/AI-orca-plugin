## ADDED Requirements
### Requirement: Instruction-Only Skills
The system SHALL allow skills with no steps and execute them using their instruction text.

#### Scenario: Instruction-only skill executes
- **WHEN** a skill defines name/description/instruction but no steps
- **THEN** the skill is registered and returns its instruction text as the execution result

#### Scenario: Step-based skills unchanged
- **WHEN** a skill defines one or more steps
- **THEN** it executes steps and returns the formatted step results plus instruction text