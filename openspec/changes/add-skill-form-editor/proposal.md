# Change: Add simplified skill form editor

## Why
Editing skills by hand requires YAML and manual placeholders, which is slow for users who just want to pick a tool and fill parameters.

## What Changes
- Add a simplified form mode in the skill edit modal with a tool dropdown and parameter inputs.
- Allow marking parameters as fixed values or user inputs and generate the corresponding `skills.md`.
- Keep the existing markdown editor as the advanced mode.

## Impact
- Affected specs: `execute-skills`
- Affected code: `src/views/SkillManagerModal.tsx`, `src/services/skill-service.ts`, `src/services/ai-tools.ts`
