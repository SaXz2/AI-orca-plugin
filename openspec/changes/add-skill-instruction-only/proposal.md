# Change: Support Instruction-Only Skills

## Why
Users expect skills to run with just title/description/instructions; requiring tool steps blocks normal prompt-only workflows.

## What Changes
- Allow skills with zero steps to be loaded.
- Execute instruction-only skills by returning their instruction text as the result.
- Keep existing tool/python step execution unchanged.

## Impact
- Affected specs: skills
- Affected code: src/services/skill-service.ts
