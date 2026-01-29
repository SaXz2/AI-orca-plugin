## Context
Users want higher skill activation rates and less prompt bloat from tool descriptions. The solution should keep tool guidance on-demand and add a precheck that surfaces skill matches before execution.

## Goals / Non-Goals
- Goals:
  - Provide a single-tool usage helper that returns only the requested tool guidance.
  - Add a precheck hook that identifies likely skills before the main response.
  - Require in-chat confirmation for matched skill actions.
- Non-Goals:
  - Changing existing tool schemas or skill execution semantics.
  - Exposing raw tool parameters in the precheck summary.

## Decisions
- Decision: add a `tool_instructions` helper tool that accepts `toolName` and returns usage for only that tool.
- Decision: add a `skill_precheck_enabled` toggle in settings and store.
- Decision: display the precheck as a chat message with a fixed summary format and confirm/cancel actions.

### Precheck Summary Format
The precheck response shown to users should follow this structure:
- Title: "Skill Check"
- Matched skills list: "<skill name> - <short reason>"
- Proposed action: one-line description of what will happen if confirmed
- Confirmation prompt: "Use this skill?" with confirm/cancel actions

## Risks / Trade-offs
- Extra model call per message when precheck is enabled.
- If the precheck is too verbose, it could add UI noise; keep it brief.

## Migration Plan
- Default the precheck toggle to off to preserve current behavior.
- Ensure the tool helper returns empty or error output for unknown tool names.

## Open Questions
- Exact naming for the helper tool in prompts and UI (default: `tool_instructions`).
