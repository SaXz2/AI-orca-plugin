# Change: Add built-in skill restore action

## Why
Users can accidentally delete built-in skills. Without a UI action, restoring them requires manual data cleanup.

## What Changes
- Add a "Restore built-in skills" action in the skill manager to clear the disabled built-in list and reload defaults.
- Keep user skills untouched.

## Impact
- Affected specs: `execute-skills`
- Affected code: `src/views/SkillManagerModal.tsx`, `src/services/skill-fs.ts`, `src/services/skill-service.ts`
