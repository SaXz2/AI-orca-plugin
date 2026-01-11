# Change: Add multi-step skill form with localized labels

## Why
The simplified skill editor needs to support multiple tool steps with drag sorting and clear localized labels so users can build skills without writing YAML.

## What Changes
- Add multi-step tool configuration in simplified form mode, including add, delete, and drag-and-drop reorder.
- Display tools and parameters with user-friendly Chinese labels (fall back to tool descriptions when no label is provided).
- Generate `skills.md` with ordered steps based on the simplified form.

## Impact
- Affected specs: `execute-skills`
- Affected code: `src/views/SkillManagerModal.tsx`, `src/services/ai-tools.ts`, `src/services/skill-service.ts`
