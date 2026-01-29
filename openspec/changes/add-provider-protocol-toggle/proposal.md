# Change: Add provider protocol toggle (OpenAI vs Anthropic)

## Why
- Current requests always assume OpenAI chat/completions; Anthropic-style endpoints (e.g., messages) 404 even when users set API URL/Key.
- Users need to pick the correct protocol per provider to call their gateway without errors.

## What Changes
- Add a provider-level protocol setting (OpenAI-compatible vs Anthropic-compatible).
- Update request builders to honor the chosen protocol when constructing URLs/bodies.
- Surface the protocol choice in the model/provider configuration UI.

## Impact
- Affected specs: knowledge-base
- Affected code: settings schema, model/provider config UI, request builders (chat stream, multi-model, extraction/portrait services)
