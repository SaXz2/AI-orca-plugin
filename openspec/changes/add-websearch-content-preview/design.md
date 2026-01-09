## Context
Users want web/image search controls to live inside the existing tool management panel.

## Goals / Non-Goals
- Goals: expose webSearch/imageSearch toggles inside Tool Panel and persist their settings.
- Non-Goals: changes to source card behavior or preview fetching.

## Decisions
- Decision: use the existing Tool Panel to toggle webSearch/imageSearch enablement.
- Decision: persist toggle state with other tool settings.

## Risks / Trade-offs
- None beyond standard settings persistence.

## Migration Plan
- Tool Panel toggles map to existing settings and default to current behavior.

## Open Questions
- None.
