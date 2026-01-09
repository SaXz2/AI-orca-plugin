## Context
Chat responses can use webSearch results, but the UI does not surface sources inline or in a floating card like ChatGPT.

## Goals / Non-Goals
- Goals: show inline source badges and a floating source card panel anchored near the clicked badge for webSearch results.
- Non-Goals: add citations for local note references; change search providers or ranking.

## Decisions
- Decision: represent sources as message-level metadata linked to webSearch tool results.
- Decision: show badges at paragraph ends and open a floating panel near the badge on hover.
- Decision: show one source at a time in the panel with navigation controls when multiple sources are grouped.
- Decision: badge label uses the source domain (or display name) and shows `+N` when multiple sources are grouped.

## Risks / Trade-offs
- Mapping sources to text may be approximate; start with paragraph-level attribution.

## Migration Plan
- Add new metadata fields with backwards-compatible defaults.
- Render badges only when sources are present.

## Open Questions
- None.
