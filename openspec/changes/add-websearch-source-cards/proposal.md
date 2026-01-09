# Change: Add web search source badges and cards

## Why
Users want ChatGPT-style source attribution after web search so they can verify and open sources quickly.

## What Changes
- Add inline source badges to assistant messages when webSearch results are used.
- Show a floating source card panel anchored near the hovered badge with title, domain, snippet, and URL.
- When multiple sources are grouped, show navigation controls to switch sources (one card at a time).
- Limit source attribution to webSearch results only (no local note citations).
- Ensure UI styling follows Orca theme variables.

## Impact
- Affected specs: source-attribution (new)
- Affected code: message rendering, webSearch tool handling, UI panels/styles
