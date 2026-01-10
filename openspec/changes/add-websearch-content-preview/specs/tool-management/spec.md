## ADDED Requirements
### Requirement: Tool Panel Search Toggles
The system SHALL expose webSearch and imageSearch toggles inside the Tool Panel.

#### Scenario: User disables web search
- **WHEN** the user disables webSearch in the Tool Panel
- **THEN** webSearch tools are not offered to the model
- **AND** UI indicates webSearch is disabled

#### Scenario: User disables image search
- **WHEN** the user disables imageSearch in the Tool Panel
- **THEN** imageSearch tools are not offered to the model
- **AND** UI indicates imageSearch is disabled