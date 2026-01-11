## ADDED Requirements
### Requirement: Skill creation slash command
The system SHALL support a `/skill` slash command that requests the AI to draft a new `skills.md` definition using user-provided request text when available, otherwise recent conversation context.

#### Scenario: Draft a new skill with explicit request
- **WHEN** the user sends `/skill` with request text
- **THEN** the system generates a draft `skills.md` based on that request and presents it in chat for approval before saving

#### Scenario: Draft a new skill from context
- **WHEN** the user sends `/skill` without request text
- **THEN** the system generates a draft `skills.md` from recent context and presents it in chat for approval before saving

#### Scenario: Not enough context to draft
- **WHEN** the user sends `/skill` and the system cannot infer a draft from context
- **THEN** the system asks the user for clarifying details in chat and does not save a skill yet

## MODIFIED Requirements
### Requirement: Skill confirmation
The system SHALL prompt the user to confirm before executing any skill and show the skill name and step summary in the chat conversation (not a modal).

#### Scenario: User approves a skill
- **WHEN** the model requests a skill call
- **THEN** the chat shows an inline confirmation message and the skill executes only after approval

#### Scenario: User declines a skill
- **WHEN** the user rejects the inline confirmation
- **THEN** no underlying tools are executed and the assistant receives a cancellation result
