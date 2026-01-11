## Context
The plugin exposes low-level tools (search/query/etc.) directly to the model. Users want a higher-level skill layer that is user-defined, groups tool usage into workflows, and requires confirmation before execution.

## Goals / Non-Goals
- Goals:
  - Let users define skills that wrap one or more existing tools.
  - Present skills to the model for implicit selection, then ask the user before execution.
  - Reuse existing tool execution logic and preserve tool results formatting.
  - Provide default skills that represent user-facing tasks (not tool names).
  - Store skills on disk under a fixed plugin `Skills/` folder for sharing.
  - Provide a plugin-data fallback store when backend file APIs are unavailable (persist `skills.md` only).
  - Support Python steps with a dual runtime: backend execution when available, Pyodide fallback with lazy loading and caching.
- Non-Goals:
  - Full visual skill builder or marketplace.
  - Arbitrary scripting runtime or code execution in skills.
  - Cross-skill branching or loops in v1.

## Decisions
- Represent skills as data objects with `id`, `name`, `description`, optional `inputs`, and ordered `steps` (tool/script + args template).
- Expose skills to the model as tool definitions with a `skill_` prefix to avoid name collisions.
- Add a skill confirmation prompt that runs once per skill call and bypasses per-tool confirmations for steps.
- Store user-defined skills in a plugin `Skills/` directory with a fixed three-layer structure and `skills.md`.
- Keep raw tools available for internal flows (e.g., agentic RAG) while adding a separate skill surface for user-facing tasks.
- Execute Python steps using a runtime adapter: call backend Python execution if available; otherwise load Pyodide from CDN and use `micropip` to install dependencies.
- Add import/export to `.zip` with selected skill folders and a directory layout compatible with Claude-style skills.
- Fall back to plugin data storage when `plugin-fs-*` APIs are unavailable, persisting only `skills.md`.

## Risks / Trade-offs
- Extra prompt tokens when skills are added to the tool list.
- Double-confirmation risk if tool-level prompts are not bypassed for skill steps.
- User-defined skills may be invalid or reference disabled tools; validation is required.
- Pyodide runtime size adds latency for first use; lazy loading mitigates but does not remove this.
- Backend Python may be unavailable on some hosts; fallback must be reliable and clearly surfaced.

## Migration Plan
- No data migration required; initialize with default skills if none exist.
- Existing tool execution remains intact; skill layer wraps it.

## Open Questions
- Where should the skill management UI live (ToolPanel vs new modal)?
- What is the minimal input schema for skill parameters (templates vs typed inputs)?
- How should skills.md express metadata vs instructions to reflect the three-layer model?
