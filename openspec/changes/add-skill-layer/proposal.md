# Change: Add a skill layer with user confirmation

## Why
The current tool layer is low-level and executes immediately. Users want a higher-level "skill" layer that wraps tools into task workflows, supports user-defined skills stored on disk, and asks for confirmation before execution (similar to Agent Skills).

## What Changes
- Add a skill registry that loads built-in and user-defined skills from a plugin `Skills/` folder (`skills.md`).
- Expose skills to the model as callable actions instead of raw tool names for user-facing tasks.
- Add a skill confirmation prompt that asks the user before running any skill.
- Execute skills as ordered steps that call existing tools and aggregate results.
- Provide default skills focused on tasks (今日回顾、知识卡片) without mirroring tool names.
- Add Python skill steps with a dual runtime: prefer backend execution when available, fallback to CDN-loaded Pyodide (micropip) with lazy loading and in-memory caching.
- Support skill import/export as `.zip` bundles using selected skill folders.
- Add a fallback storage path using `orca.plugins.setData/getData` when backend file APIs are unavailable (persist `skills.md` only).

## Impact
- Affected specs: `execute-skills` (new)
- Affected code: `src/services/ai-tools.ts`, `src/services/skill-service.ts`, `src/views/AiChatPanel.tsx`, `src/components/SkillConfirmDialog.tsx`, `src/store/skill-store.ts`, `src/settings/ai-chat-settings.ts`, `src/components/ToolPanel.tsx`, `src/services/skill-fs.ts`, `src/services/python-runtime.ts`, `module-docs/06-ai-tools.md`, `module-docs/13-plugin-api.md`
