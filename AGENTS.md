# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the plugin source. Entry point is `src/main.ts`.
- UI registration and Orca integration live in `src/ui/`.
- React view components are in `src/views/`.
- State is in `src/store/`, services in `src/services/`, settings schema in `src/settings/`.
- Utilities and localization are in `src/utils/` and `src/translations/`.
- Docs live under `module-docs/` and `plugin-docs/`. Build output goes to `dist/`.

## Build, Test, and Development Commands
- `npm run dev`: Vite dev server with hot reload for local iteration.
- `npm run build`: Type-checks with `tsc` and builds the production bundle.
- `npm run preview`: Serves the production build locally for verification.

## Coding Style & Naming Conventions
- TypeScript, 2-space indentation, `tsconfig.json` is `strict`.
- Naming patterns:
  - UI registration: `src/ui/*.ts`
  - React views: `src/views/*.tsx`
  - Stores: `src/store/*-store.ts`
  - Services: `src/services/*.ts`
- React is accessed via `window.React` and components are created with `createElement`.
- Use `--orca-color-*` CSS variables and inline styles to keep theme compatibility.

## Testing Guidelines
- No automated test framework is configured yet.
- If adding tests, use `*.test.ts` or `*.test.tsx`, place them under `src/__tests__/` or `tests/`, and add a `npm run test` script.
- Validate behavior in Orca Note (panel registration, context selection, streaming UI).

## Commit & Pull Request Guidelines
- No git history is present in this workspace, so commit conventions are not defined.
- Use concise, imperative commit messages (e.g., "Add context preview caching").
- PRs should include: summary, testing notes, and screenshots for UI changes.

## Security & Configuration Tips
- API credentials are configured via Orca settings (`src/settings/ai-chat-settings.ts`).
- Do not commit secrets; rely on user settings or environment-provided values.

## Agent-Specific Notes
- See `CLAUDE.md` for architecture and lifecycle details.
- Use `module-docs/` for module behavior and UI expectations.
