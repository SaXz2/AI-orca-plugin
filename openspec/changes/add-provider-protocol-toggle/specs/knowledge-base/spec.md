## ADDED Requirements
### Requirement: Provider protocol selection
The system SHALL allow configuring each AI provider with a protocol type (OpenAI-compatible or Anthropic-compatible) and MUST construct API URLs/bodies accordingly to avoid endpoint mismatches.

#### Scenario: User sets Anthropic-compatible provider
- **GIVEN** a provider configured with protocol set to Anthropic-compatible and a valid API URL/key
- **WHEN** the user sends a chat or portrait/extraction request through that provider
- **THEN** the request SHALL target the Anthropic-compatible path/body format (e.g., messages) instead of OpenAI chat/completions and SHALL not fail due to path mismatch
