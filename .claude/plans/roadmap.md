# Roadmap: next sessions (2026-10-20)

Two pieces of work, in this order. The first is done. Loose notes to point a session at.

## 1. Remove post-processing (done 2026-10-20, branch `post-process-remove`)

Removed with it: sensors and the Decisions endpoint flag, acrostic swipes and the Grammar field, the
`postStacks` table (schema 23), `compromise`, and the VAD lexicon. Suggest ideas keeps its own copy of
the tag-line parser in `prompt/ideasPrompt.ts`; `wordCount` lives in `quality/words.ts`.

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
