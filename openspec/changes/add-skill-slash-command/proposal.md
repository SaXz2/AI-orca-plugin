# Change: Add /skill command and inline skill confirmation

## Why
Skill creation currently requires manual file editing, and skill execution confirmation uses a modal dialog that disrupts the chat flow. Users want the AI to draft skills directly (without writing prompts themselves) and approve skill execution directly in the conversation.

## What Changes
- Add a `/skill` slash command that asks the AI to draft a new skill based on a user-provided request (if any) or recent conversation context.
- Show a chat-inline confirmation prompt for skill execution (not a modal).
- Limit inline confirmations to skill execution only; other tool confirmations remain unchanged.

## Impact
- Affected specs: `execute-skills`
- Affected code: `src/views/AiChatPanel.tsx`, `src/views/MessageItem.tsx` (or message UI component), `src/services/skill-service.ts`, `src/store/skill-store.ts`
