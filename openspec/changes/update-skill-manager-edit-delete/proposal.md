# Change: Add skill edit/delete and lazy-loading behavior

## Why
Skill management lacks edit/delete flows. Users need to modify and remove skills directly from the manager, and ensure skill content is injected only when executing to reduce token usage and control context.

## What Changes
- Add edit and delete actions in the skill manager UI.
- Provide a markdown editor modal for `skills.md` with preview.
- Allow renaming skills; when the `name` changes, rename the skill folder accordingly.
- Keep skill list light: show only title/description in the manager, and load full content only on execution.

## Impact
- Affected specs: `execute-skills`
- Affected code: `src/views/SkillManagerModal.tsx`, `src/services/skill-service.ts`, `src/services/skill-fs.ts`, `src/store/skill-store.ts`
