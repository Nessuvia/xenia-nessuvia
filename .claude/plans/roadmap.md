# Roadmap: next sessions (2026-10-20)

Two pieces of work, in this order. Loose notes to point a session at.

## 1. Remove post-processing

**Why:** few people used it, and the ones who did found it flawed. Find/replace plus tag hide/collapse
(`textRules` on stacks and globally: `ReplaceRule`, `TagRule` in `settingsStore.ts`) covers what most
people want, and find/replace is regex, so it's plenty powerful.

**Scope: all of it.**

- Delete `core/agent` (rules, runAgent, lint, flow, acrostic, VAD guard, style draw, postStack, explain,
  stage, builder) and `core/hammer`.
- Delete `modules/postProcessing` and its import in `main.tsx`.
- Delete `core/quality` except `sentences.ts` (SpoilerText uses it). That takes `lexicon`,
  `temperature`, `vad`, `vadData` and `scripts/buildVad.mjs` with it, plus any precache exclusion for
  the VAD chunk in the Vite/PWA config.
- Move `wordCount` from `core/agent/flow/words` into `core/quality` next to `sentences.ts`, and repoint
  `notes/Manuscript.tsx` and `notes/NotesView.tsx`.
- Drop the `compromise` dependency if nothing else imports it.
- Chat side: `chatStore` (`streamingPending`, `streamingStage`, the runAgent call), `swipes.ts`
  (`passOriginals`) and `checkSwipes.ts`, `modules/chat/agentSegments.ts` + its check, `AgentStream.tsx`,
  `MakeRulePopover.tsx`, the agent bits of `MessageBubble.tsx` and `ChatView.tsx`, and the CSS in
  `chat.css` that animates stylized mode.
- Settings side: `settingsStore.agent` / `setAgent`, `modules/settings/AgentChatPanel.tsx`, the
  Settings › Agent tab, and `Chat.agent` plus the agent fields on `Message` in `types.ts`.
- Stale data is fine: old chats, messages and backups carrying `agent` / `passOriginals` fields, or
  `postStack` export files, are simply ignored. No migration and no import shim.
- Docs: remove the Agent pass, Rules and Style checks entries from `CLAUDE.md` and the `compromise`
  line under Stack, and delete `.claude/plans/postProcessingV3.md` (superseded, nothing waits on it).
  The "Post-processing v3 design" memory is stale too.

**The word-swap lexicon goes as well.** The only things it does that a find/replace row doesn't are
(a) keeping a leading capital on the replacement and (b) skipping code spans and URLs. Word edges are
just `\b` in regex. Neither gap justifies keeping a second system. If people ask for case-keeping later,
it's a `keepCase` flag on `ReplaceRule`, not the lexicon coming back.

**Done when:** build and `scripts/agent-test.sh` are clean, nothing imports the deleted folders, a chat
sends and streams a reply with no agent step, and Settings has no Agent tab.

## 2. Models / connections / presets (design first, then build)

**Goal:** Connections moves out of Settings into its own nav entry and page. The move **waits for the
design**, so the page is built once in its final shape and not moved twice.

**Covers the whole shebang:** endpoints and keys, model choice, sampler params (`core/params`,
`paramDefs`), instruct templates (`InstructTemplate`, `templatePresets`, `templateFile.ts`), and the
per-connection tokenizer pick and download.

**Session 2a is a design interview, not code.** Start from a blank page. Don't bring a model of how
these should relate. The session's job is to get the user's intent and scope by asking questions until
the shape is clear (the `grill-me` skill fits), then write the agreed design into
`.claude/plans/connectionsDesign.md`. Questions it will probably need to settle:

- What's the unit someone picks in a chat: a connection, a model, a preset, or a combination?
- Which of endpoint, model, samplers, instruct format and tokenizer belong together, and which mix
  and match?
- At which scope does each one live (see Specificity in `CLAUDE.md`): global, per stack, per chat?
- How do exports split, given keys must never leave (`stripApiKeys.ts`, `templateFile.ts`)?

**Session 2b and later:** build it from that design, including the new nav entry and route, and take
the Connections section out of Settings.
