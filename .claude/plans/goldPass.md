# The Gold Pass feature plan

## What it is

A second model, on a second connection, rewrites the assistant reply the first model just produced.
The first model supplies comprehension and long-term memory; the second supplies voice. The rewrite
becomes the message, so the frontier reads its own rewritten history on later turns and drifts
toward that register on its own.

This is not Second Pass. Second Pass is deterministic rules plus an optional edit request on the
*same* connection, driven by flags. Gold Pass is a different connection, a different system prompt,
a deliberately slim context window, and it runs whether or not anything was flagged. The two stack:
Second Pass cleans the first pass, Gold Pass rewrites what Second Pass produced.

## Decisions (settled with the user, do not relitigate)

| Question | Answer |
| --- | --- |
| Trigger | Per-chat on/off toggle for auto, plus a manual action on any assistant message |
| Display | Replace in place. First pass streams visibly, then is swapped for the rewrite |
| Context | Fixed slim window: character card + Gold Pass system prompt + last N messages + the text to rewrite |
| Storage | Both kept. The rewrite is canonical: it is `content`, it is what goes back to the frontier |
| Config location | Global default in Settings, per-chat override on the Chat record |
| System prompt | One bundled starter preset, behind an import button. Users write their own and move them as JSON files |
| Coasting | Not in v1. The user flips the toggle themselves |
| Surfaces | Chat only. Nothing in Write, Ask or multiplayer changes |
| Failure | Keep the original, show a quiet marker on the message with a retry action |
| Guard | Length ratio guard. Outside the band, reject the rewrite and keep the original |
| Re-run | Manual re-run always rewrites from the stored original, replacing the previous rewrite |

## Files

New: `src/core/goldPass/`

- `goldPassSettings.ts` - the settings shape and defaults, plus the resolver that merges
  global -> per-chat override. Mirror `secondPassSettings()` in `settingsStore.ts:588`.
- `buildGoldPrompt.ts` - assembles the slim window. Takes `{ character, messages, text, settings }`,
  returns `ChatMessage[]`. This is the whole context decision in one function.
- `runGoldPass.ts` - the seam. Async generator, same shape as `runSecondPass`
  (`core/secondPass/runSecondPass.ts:33`), so a call site keeps its `for await` loop.
- `lengthGuard.ts` - the ratio check, pure function, its own check script.
- `presetJson.ts` - `exportPresets`, `downloadPresets`, `parsePresetFile`. Copy the shape of
  `secondPass/ruleJson.ts`: a tolerant parser that coerces, assigns fresh ids, and rejects a bad
  file whole.
- `bundled/starterPreset.json` - one preset, the worked example. Same pattern as
  `secondPass/bundled/nessuRules.json` + `bundledRules.ts`: nothing loads it on its own, it goes
  through `parsePresetFile` behind a button like any other import.
- `bundledPreset.ts` - the one-function loader, mirroring `bundledRules()`.
- `checkGoldPrompt.ts`, `checkLengthGuard.ts`, `checkPresetJson.ts` - the check scripts.

Touched:

- `core/storage/types.ts` - two fields on `Message`.
- `core/storage/types.ts` - one field on `Chat` (the per-chat override).
- `core/stores/settingsStore.ts` - `goldPass: GoldPassSettings` + patch action + resolver hook.
- `core/stores/chatStore.ts` - wrap the three `runSecondPass` call sites; add `goldPassMessage(id)`.
- `modules/settings/` - a `GoldPassPanel.tsx` + a tab entry, next to `SecondPassPanel.tsx`.
- `modules/chat/MessageBubble.tsx` - the marker, the revert control, the manual action.
- a chat sidebar panel for the per-chat toggle and override.

No Dexie version bump. Both new `Message` fields and the `Chat` field are plain unindexed fields;
`CLAUDE.md` says that needs no bump.

## Data

On `Message`, parallel to `swipes`/`drafts`/`reasonings`, holes where Gold Pass never ran:

```ts
/** The pre-Gold-Pass text for each swipe, where a Gold Pass rewrite replaced it. `content` and
 *  `swipes[i]` hold the rewrite; this holds what the first connection actually said. Kept so a
 *  manual re-run always rewrites from the original rather than compounding, and so the user can
 *  revert. Distinct from `drafts`, which is Second Pass's pre-edit text on the same connection. */
goldOriginals?: (string | undefined)[]
/** Set when a Gold Pass attempt failed or was rejected by the length guard, parallel to `swipes`.
 *  Drives the marker and the retry action. Cleared on a successful rewrite. */
goldFailed?: (string | undefined)[]   // the reason string, for the marker's title
```

`goldFailed` holds a reason rather than a boolean so the marker can say which failure it was
(request error vs guard rejection) without a second field.

On `Chat`:

```ts
/** Per-chat Gold Pass override, merged over the global settings. `enabled` is the auto toggle and
 *  is the field the chat sidebar writes; the rest are set only if the user opens the override. */
goldPass?: Partial<GoldPassSettings>
```

Note the specificity call, per `CLAUDE.md`: the chat toggle writes the **chat** record, never the
stack and never the global default. A chat that never touches the override inherits global.

## Settings shape

```ts
export interface GoldPreset {
  id: string
  label: string
  text: string
}

export interface GoldPassSettings {
  enabled: boolean          // global default for new chats
  connectionId: string      // '' = off, nothing runs
  presets: GoldPreset[]     // ships empty, like SecondPassSettings.rules
  presetId: string          // which preset is active. '' or a stale id = nothing runs
  historyCount: number      // N: how many prior messages go in the window. Default 5
  includeCharacter: boolean // default true
  minRatio: number          // default 0.6
  maxRatio: number          // default 2.0
}
```

`presets` ships empty for the same reason `rules` and `textRules` do: a rewrite prompt is an opinion
about prose and the build has none. The user either presses the button that imports the starter
preset, writes one in the panel, or loads a JSON file someone sent them.

A `presetId` pointing at a preset that no longer exists means Gold Pass does not run, and does not
mark a failure. Same non-armed path as an empty `connectionId`.

Resolution order, exactly like Second Pass: `{ ...defaults, ...global, ...chat.goldPass }`.
If the resolved `connectionId` is empty, missing, or `isSentinel`, Gold Pass does not run and does
not mark a failure. It was never armed.

## The slim window

`buildGoldPrompt` returns, in order:

1. system: the resolved preset text, with `{{char}}`/`{{user}}` run through `swapTokens`.
2. system: the character card description, if `includeCharacter`. Description only, not the full
   `buildPrompt` assembly. The point of Gold Pass is a small cheap window on a local model.
3. the last `historyCount` messages before the one being rewritten, as normal role turns.
4. user: the text to rewrite, wrapped in a short fixed instruction line.

It must **not** call `buildPrompt`. Reusing the chat stack is the thing this feature is deliberately
not doing, and a future agent will be tempted. The token budget still applies: run the result
through `budget` against the Gold Pass connection, not the chat connection.

## Control flow

`runGoldPass(text, character, priorMessages, connection, settings, signal)` yields `StreamChunk`s.
The caller already has the first-pass text in `text` and has already shown it.

1. Build the window. Stream from `sendMessage` on the Gold Pass connection.
2. Accumulate. On abort, throw through, same as the normal send path.
3. On completion, run `lengthGuard(original, rewrite, settings)`.
4. Guard passes: yield the rewrite as the final content and report success.
   Guard fails, or the request threw: yield nothing and report the reason.

In `chatStore`, after the `runSecondPass` loop finishes and `text` is final:

- if Gold Pass resolves to armed and the chat toggle is on, set a `goldPassing: true` flag so the
  bubble can show it is working, then stream the rewrite into `streamingText`, replacing what is
  there. The user watches the first pass get overwritten. That is the intended feel.
- on success, store: `content` and `swipes[i]` = rewrite, `goldOriginals[i]` = the first pass,
  clear `goldFailed[i]`.
- on failure, store the first pass as normal and set `goldFailed[i]` to the reason.

Manual re-run, `goldPassMessage(messageId)`: source text is `goldOriginals[i] ?? swipes[i]`, so a
re-run never compounds. Prior messages are the ones before it in the chat, not the current tail.

Revert: swap `goldOriginals[i]` back into `content`/`swipes[i]` and clear the field.

Three `runSecondPass` call sites exist in `chatStore.ts` (~539 send, ~658, ~812). The continuation
path at ~942 deliberately bypasses Second Pass; it bypasses Gold Pass too, and should get a comment
saying so. Put the Gold Pass wrapping in one shared helper rather than pasting it three times.

## Length guard

```ts
lengthGuard(original: string, rewrite: string, { minRatio, maxRatio }): string | null
```

Returns null when acceptable, otherwise the reason string. Checks: rewrite is non-empty after trim;
`rewrite.length / original.length` inside `[minRatio, maxRatio]`. Character length, not tokens.
A token count here would need `loadTokenizer`, and the guard has to stay synchronous.

## UI

Settings tab, mirroring `SecondPassPanel.tsx`: connection picker, the preset list, history count,
the two ratio numbers, the global enabled default.

The preset list is the part with real work in it. A row per preset with its label and a radio or
check marking the active one, an editor for the selected preset's text, add and delete, and four
file actions matching how Second Pass rules move around today: import a JSON file, export all
presets to one, and a button that loads the starter preset through the same parser.

Chat sidebar panel: one toggle, the connection name as read-only text, and a link into Settings.
An override section, collapsed, for the rest.

Message bubble: when `goldOriginals[i]` is set, a small control to flip to the original and back.
When `goldFailed[i]` is set, a quiet marker with the reason and a retry.

Copy, per `CLAUDE.md`'s UI copy section. Write the fact and stop. `"Rewrites each reply on a second
connection."` is the right register. Do not explain why it is useful, do not write a triple.

## The starter preset

Exactly one, in `bundled/starterPreset.json`. It exists to show the mechanism, not to be the good
prompt. Keep the text short and plain: rewrite this passage in the character's voice, keep every
event and every piece of dialogue, change only the prose. That is the floor a user edits from.

Do not ship a second preset and do not tune this one for a particular register. The users who care
will write their own and trade JSON files, which is what the import and export path is for.

## Checks

- `checkGoldPrompt.ts` - window has the right turn count at several `historyCount` values, the
  system prompt is first, the text-to-rewrite is last, `includeCharacter: false` drops the card,
  and `buildPrompt` is not involved.
- `checkLengthGuard.ts` - passes in band, rejects empty, rejects truncation, rejects rambling,
  handles a zero-length original without dividing by zero.
- `checkPresetJson.ts` - a round trip through `exportPresets`/`parsePresetFile` preserves label and
  text, the bundled starter file parses, ids come out fresh, and junk input is rejected whole
  rather than half-imported. `checkRuleJson.ts` is the model to copy.

Verify with `scripts/agent-test.sh --build`. Then stop and hand off; the user tests in Chrome.

## Out of scope for v1

Coasting cadence, Write and Ask, multiplayer, side-by-side comparison, per-swipe Gold Pass on
regenerate beyond what falls out of the parallel arrays, and any automatic condition for when to
run. Do not build these.
