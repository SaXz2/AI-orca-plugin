# Change: Add skill precheck hook and tool instructions helper

## Why
Skill activation can be inconsistent and tool usage guidance is currently bundled in long prompts. Users want a lightweight way for the model to fetch usage for a single tool and a precheck step that surfaces skill matches before executing.

## What Changes
- Add a dedicated tool instructions helper that returns usage for one specific tool by name.
- Add an optional skill precheck hook that runs before assistant responses and surfaces matched skills with rationale.
- Show precheck results in chat and require in-chat confirmation before executing the suggested skill action.

## Impact
- Affected specs: `execute-skills`
- Affected code: `src/services/ai-tools.ts`, `src/views/AiChatPanel.tsx`, `src/store/tool-store.ts`, `src/store/skill-store.ts`, `src/settings/ai-chat-settings.ts`, `module-docs/06-ai-tools.md`
