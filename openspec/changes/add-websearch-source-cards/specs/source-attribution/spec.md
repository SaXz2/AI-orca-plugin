## ADDED Requirements
### Requirement: Web Search Source Badges
The system SHALL display inline source badges in assistant messages when webSearch results are used.

#### Scenario: Assistant response with web search sources
- **WHEN** a response is generated after webSearch tool results are available
- **THEN** the message shows inline source badges at the end of the relevant paragraph(s)
- **AND** each badge references one or more web search results
- **AND** the badge label uses the source domain or display name, with `+N` when multiple sources are grouped

### Requirement: Source Card Panel
The system SHALL show a floating card panel anchored near the clicked badge for the sources referenced by a badge.

#### Scenario: User hovers a source badge
- **WHEN** the user hovers a source badge
- **THEN** a floating panel appears near the badge showing source title, domain, snippet, and URL
- **AND** the panel updates to reflect the hovered badge
- **AND** when multiple sources are grouped, the panel offers navigation controls to switch sources

### Requirement: Web Search Only
The system SHALL limit source badges to webSearch results and SHALL NOT display badges for local note references.

#### Scenario: Message without web search sources
- **WHEN** a message contains only local note references or no sources
- **THEN** no source badges are shown
