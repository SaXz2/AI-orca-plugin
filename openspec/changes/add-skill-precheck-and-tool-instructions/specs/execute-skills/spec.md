## ADDED Requirements
### Requirement: Tool instructions helper
The system SHALL expose a dedicated helper tool that returns usage guidance for a single tool requested by name.

#### Scenario: Fetch a single tool's instructions
- **WHEN** the model calls the helper with `toolName` set to `createPage`
- **THEN** the result includes only the `createPage` usage and omits other tool descriptions

#### Scenario: Unknown tool
- **WHEN** the model calls the helper with a tool name that does not exist
- **THEN** the result indicates the tool is not found

### Requirement: Skill precheck hook
The system SHALL optionally run a skill precheck step before generating an assistant response and surface matched skills to the user in a concise summary (matched skill names, short reasons, and proposed action).

#### Scenario: Precheck enabled
- **WHEN** the precheck toggle is enabled and a user message arrives
- **THEN** the assistant emits a precheck summary before the main response

#### Scenario: Precheck disabled
- **WHEN** the precheck toggle is disabled
- **THEN** the assistant responds without emitting a precheck summary

### Requirement: In-chat confirmation for matched skills
The system SHALL request in-chat confirmation for the precheck's proposed skill action before executing it.

#### Scenario: User confirms the skill
- **WHEN** the user confirms the proposed skill action
- **THEN** the system executes the skill and continues the response

#### Scenario: User declines the skill
- **WHEN** the user declines the proposed skill action
- **THEN** no skill is executed and the assistant continues without tool execution
