# Post-processing v2

## Why this version

The pass cleans up sentences, but it does nothing about what makes RP replies bad: repeated openers,
closers, and gestures across turns, and replies that stall. Detection, labels, and nudges were
considered and dropped, because models rarely take hints or copy good examples. This version does
three things instead:

1. Force variety at generation. Acrostic draws a random shape and random starting letters, and the
   model fills them in.
2. Give stalling a manual lever: beat chips you ask for.
3. Fix the tooling. Post-processing gets its own module, stacks you can share, a pipeline view, and
   a rule builder that works.

## Decisions

| Topic | Decision |
|---|---|
| Post-processing stacks | A named, exportable config. A chat picks one |
| Stack contents | Acrostic, word swaps, style checks, rules, tries. Each stage has its own on/off switch |
| Global (not in stack) | Enabled, style, connection override. The connection holds keys, so it stays out of anything shareable |
| Home | A new `postProcessing` module in the sidebar. The Settings tab is removed |
| Chat panel | On/off for this chat and stack select. Nothing else |
| Acrostic | A stack stage. Requires post-processing on. Every reply while the stage is on |
| Randomized swipe | A "Randomized swipe" item in the message's Quick actions dropdown. The default swipe stays normal |
| Acrostic template | Letters, shape, and beat slots. Dialogue and beat slots get no letter |
| Acrostic output | Tagged plain text lines, parsed in code. JSON optional per stack |
| Acrostic display | Hold, then show |
| Acrostic draw | Weighted letters, never reusing the previous reply's first letter or shape, and shape taken from recent replies with jitter |
| After acrostic | The full pass runs. Rules may break letters |
| Stalling | Replaced by Ideas (settled 2026-09-15): a feature separate from post-processing, chat-only. A global switch and its own connection in the Chat sidebar's Ideas section. "Suggest ideas" above the input makes three chips, with an X to clear them. The request and the "Next, develop this" line are misc prompts (`ideas`, `ideaNext`), editable per stack. Part E below describes the first version |
| Detection, labels, metrics, pace | Dropped |
| Rule engine | Extend Word types (pattern). Words mode is removed. Regex stays |
| Rule builder | One builder. Start from a sample sentence. Each word chip cycles exact, word type, or any, with a per-chip count. All fields visible, no "More" section |
| Default rules | Convert to Word types where they can be expressed. The rest stay regex |
| Tester | Pick a chat and run the stack over it. Hit counts per rule, nothing stored |
| Tester acrostic fit | Skipped. Revisit after acrostic lands (settled 2026-09-15) |
| Slot classification | Dialogue: the sentence contains a quotation. Thought: wrapped whole in `*…*` or `_…_`. Action: the rest |
| Alternation in default rules | Rules that need either/or stay one regex rule, not split into several Word types rules |
| Acrostic connection | The chat's own connection |
| Acrostic seed | Stored per swipe, alongside the template and fit |
| Acrostic scope | Continue skips it. Narrator, multiplayer turns and self-reply runs treat it like any other reply |
| Acrostic retry | Once, same template, with a note that the last reply lost its tags. Then normal generation, noted in `passSummaries` |
| Acrostic on text completion | Prefill the first tag. JSON mode is hidden |
| GBNF | Per-connection switch with the field name (`grammar`, `grammar_string`, `guided_grammar`). Grammar built from the template forces tags in order and each lettered line's opening letter, sent through `extra` |
| GBNF backup | Instruction, prefilled first tag, and the parser. The parser runs either way |

---

## Part A: post-processing stacks

### Data
- New Dexie table `postStacks`: `id, ownerId, name, config, createdAt, updatedAt`. Raise
  `db.version` from 18 to 19 in the single schema block and add `postStacks` to `TableName`. Indexes:
  `id, ownerId`.
- `PostStackConfig`:
  ```ts
  interface PostStackConfig {
    acrostic: AcrosticConfig          // has its own enabled
    swaps: { enabled: boolean; lexicon: LexiconEntry[] }
    lint: LintConfig                  // already has enabled
    rules: { enabled: boolean; list: Rule[] }
    maxTries: number
  }
  ```
- `AgentConfig` (settingsStore) shrinks to `enabled`, `style`, `connectionId`, and
  `defaultStackId`.
- `Chat.postStackId?: string`. `ChatAgent` keeps `enabled` and `display`.
- `resolvePostStack(chat, agent, stacks)`: uses the chat's stack, then the default stack, then
  `defaultPostStack()`. Checked by `checkPostStack.ts`.
- No migration. Existing global rules reset to defaults, which is acceptable for a WIP.

### Store and files
- `core/stores/postStackStore.ts`, following the prompt stack store. Components never touch Dexie.
- `modules/postProcessing/postStackFile.ts`, following `stackFile.ts`:
  `{ format: 'nessu-post-stack', version: 1, name, config }`, with `reid` on import. The format has
  no connection field.

### Runtime
- `agentPass` (`chatStore.ts:87`) resolves the stack and assembles the object `runAgent` expects.
  `runAgent` skips stages whose `enabled` is false. Its signature stays the same.

---

## Part B: acrostic

### Config
```ts
interface AcrosticConfig {
  enabled: boolean
  paragraphs: [number, number]
  sentencesPerParagraph: [number, number]
  beatSlots: number                 // default 1
  jsonMode: boolean
}
```

### Draw: `core/agent/acrostic/draw.ts` (pure, seeded)
- Window: the last 10 assistant replies, stopping at a `divider` message, using the active swipe
  with the reasoning stripped. The helper is `acrostic/window.ts`.
- Shape: the mean paragraph count and mean sentences per paragraph from `sentences()`, plus or minus
  1 jitter, clamped to config. Redraw if it equals the previous reply's shape.
- Slot types: `action`, `dialogue`, `thought`, `beat`, weighted by the window's mix. `beatSlots`
  are forced to `beat` and never placed last.
- Letters: only `action` and `thought` slots get a letter. The table of sentence-initial letter
  frequencies lives in `acrostic/letters.ts`, with X, Z, and Q near zero. The first lettered slot
  never gets the previous reply's first letter.
- `checkAcrostic.ts` asserts: the shape differs from the previous reply, dialogue and beat slots
  have no letter, the beat count is right, no beat slot is last, the first letter differs, and the
  same seed gives the same template.

### Call: `core/prompt/acrosticPrompt.ts`
- It starts from the chat's normal `buildPrompt` output and adds an `appendSystem` instruction with
  the tagged template:
  ```
  Write your reply by filling each line. Keep the tag, then the sentence.
  [1.1|action|M]
  [1.2|dialogue]
  [2.1|beat]   introduces a new event, choice, or reveal
  [2.2|thought|R]
  A letter means the sentence starts with that letter.
  ```
- With `jsonMode`, it passes `extra: { response_format: { type: 'json_object' } }` and asks for
  `{ "lines": [{ "id", "text" }] }`.
- It sends through `sendMessage` and accumulates the chunks, like `agentPass`'s `complete`. The
  connectors don't change.

### Parse: `core/agent/acrostic/parse.ts`
- Finds lines by tag id and ignores junk between them. Missing lines are dropped, and paragraphs
  are joined with blank lines.
- Letter fit is recorded but not enforced.
- If fewer than half the lines are found, it retries once, then falls back to normal generation and
  notes it in `passSummaries`.
- Content stores the assembled prose, never the tags.
- `checkAcrosticParse.ts` covers junk between lines, a missing line, a JSON reply, and the
  threshold.

### Store
- `Message.acrostics?: ({ template, fit } | undefined)[]`, parallel to swipes. It is a plain field,
  so there's no version bump.

### Wiring
- Send and regenerate (`chatStore.ts` ~900-1046): when the pass and the acrostic stage are both on,
  `generateAcrostic` replaces the streamed `sendMessage` step. The rest is unchanged: `agentPass`,
  then `regenerated` or the new-message path.
- Display: the reply is forced to `hold`, reusing the Writing marker.
- "Randomized swipe": an item in the `MessageBubble` Quick actions dropdown. It calls regenerate with
  `{ acrostic: true }`, needs post-processing on, and works whether the stage is on or off.

---

## Part C: rule engine, extending Word types

Words mode goes away. Everything the builder makes is Word types DSL, so the pattern engine needs
what Words mode had.

### What the tagger does today (checked 2026-09-15)
Test run of compromise on "She didn't smile, and he won't go." and "I can't — they're here. It's
fine; you'd know.":

- Punctuation is never its own term. It sits in the previous term's `post` (`", "`, `" — "`,
  `"; "`). `CompromiseTagger` (`tagger.ts:61`) never sees a punctuation token, so the comment about
  dropping them is misleading. Line 84 only drops symbol or number terms. Word tokens keep their
  `start`/`end`, so the punctuation is recoverable as the text between one token's `end` and the
  next token's `start`.
- Contractions split into two terms. `didn't` gives `{ text: "didn't", implicit: "did" }` followed
  by `{ text: "", implicit: "not" }`. The same holds for won't/can't (will, can + not),
  they're (they + are), it's (it + is), and you'd (you + would). The second term has empty text, so
  `tagger.ts:78` (`if (!surface) return`) throws it away. Today "didn't" is one token tagged
  verb/aux and the "not" is gone.

### Matcher changes (`core/hammer`)
1. Punctuation tokens, built from gaps. After tagging, `CompromiseTagger` scans the gap between
   consecutive word tokens and emits one token per punctuation mark (`,` `;` `—` `.` `…` quotes)
   with pos `punct` and exact offsets. Whitespace gets no token. `[word]` and POS tags never match
   `punct`. Between two consecutive matchers, any run of `punct` tokens is skipped, so separators
   stay flexible.
2. A literal punctuation matcher. A DSL literal like `,` or `—` matches a `punct` token with that
   text. This allows rules that need a comma (the reason `default-noun-adj-tail` is regex today).
3. Contractions, from compromise's own `implicit`. No hand table. A contraction becomes two tokens
   sharing the contraction's char span: `did` (pos verb) and `not` (pos from its tags), both with
   `contraction: true`. Literals match on the implicit words, so `did not` matches both "did not"
   and "didn't". A DSL literal `didn't` gets expanded at compile time by running it through the
   tagger, which gives the same two words. Rule: a match may not start or end in the middle of a
   contraction pair. Otherwise a rule on `not` would rewrite the whole of "didn't". Token text for
   the leading half stays `didn't` for display, with a new `word` field holding `did` for matching.
   `checkContractions.ts` covers didn't, won't, they're, it's, you'd, and a match that would split a
   pair.
4. `[clause]`. It matches one or more non-`punct` tokens up to the next `punct` token or the end of
   the sentence.
5. Sentence limit. Matches still never cross a sentence. Words mode could, and this is a known
   loss. Rules that need to cross stay regex.
6. Replacement groups. `$n` is one group per chip. The builder shows each chip's `$n` so
   replacements are written against what's visible.

### Checks
- `hammer/checkPunctuation.ts`: flexible separators, literal comma, `[word]` skipping punctuation.
- `hammer/checkContractions.ts`: both directions, and case.
- `hammer/checkClause.ts`: stops at a comma, and at the end of the sentence.

### Removal
- Delete `literal` from `Rule.match`, plus `example.ts`, `ExampleEditor.tsx`, `slots`, and
  `regexOverride`. No migration.

### Converting the defaults
- Go through the 33 regex defaults in `agentConfig.ts:63-114`. Convert each one the extended DSL
  expresses exactly and keep the rest as regex, with a `ponytail:` comment naming what the DSL
  lacks, such as lookahead or crossing sentences.
- Before switching over, each converted rule gets a check line comparing its hits with the old
  regex on 2 sample sentences, in `agent/checkDefaultRules.ts`.

---

## Part D: the Post-processing module

### Registration
- `modules/postProcessing/index.ts` calls `registerModule({ id: 'postProcessing', label:
  'Post-processing', icon, route: '/post-processing', component: lazy(...) })` and is imported in
  `main.tsx`.
- Remove the `agent` tab from `settings/tabs.ts`, and move or delete `AgentPanel.tsx`,
  `RulesPanel.tsx`, and `RuleCardHead.tsx`.

### Layout
Three columns inside `.screenBody`: the stack list, the pipeline, and the tester.

```
+-------------+-------------------------------------+------------------+
| Stacks      | [On] Style: Stylized  Connection: - | Tester           |
|  Default *  | Stack: Default                      | Chat: [pick]     |
|  Grim       | Acrostic on . 12 swaps . 3 checks . | [Run]            |
|  + New      |   28 rules                          |                  |
|  Import     |-------------------------------------| reply text with  |
|             | v [x] Acrostic   Every reply . 1 beat| highlighted hits |
|             | > [x] Word swaps 12 . 5 fired        |                  |
|             | > [x] Style checks 3 . 2 fired       |                  |
|             | > [x] Rules  28 . 19 fired           |                  |
+-------------+-------------------------------------+------------------+
```

- Stack list: select, new, duplicate, rename, delete, import, export. A star marks the default, and
  each entry shows "Used by N chats".
- Header: the global master switch, style, and connection. Below that, the stack name and a row of
  chips summarizing the stages.
- Stages follow execution order: Acrostic, Word swaps, Style checks, Rules. Each header has an
  on/off switch and a summary line with its contents, plus hits after a tester run. Expanding a
  stage shows its editor.
- Rules stage: grouped by action (Swap, Delete, Rewrite). Rules with 0 hits after a run are dimmed.
- Narrow screens (the breakpoint in `cssConventions.md`): the columns stack, with the tester last.

### Tester
- Pick a chat and press Run. It runs the stack over that chat's assistant replies in memory. There
  are no requests: rewrites show as "would rewrite" and are not sent. Nothing is stored.
- Output: a hit count for each rule, style check, and swap, fed into the stage summaries. The reply
  list highlights hits, and clicking a hit scrolls the pipeline to its rule.
- While a rule is open, the tester highlights only that rule's hits, and a count sits beside the
  editor. Counts update as you edit, debounced.
- Acrostic isn't exercised by the tester, because drawing a template needs a request.
- `explain.ts` is extended to take a list of replies and return per-rule counts. It's checked by
  `checkExplain.ts`.

### Rule editor
Top to bottom, all fields visible:
1. Sample: a text field for the sentence to catch, prefilled when the rule comes from chat.
2. Builder: the sample tagged into chips. Clicking a chip cycles its state:
   - Exact: matches that word (or its contraction pair).
   - Word type: shows the tagged type (noun, verb, adj...), and a small select changes it.
   - Any: matches any word.
   - Punctuation chips appear too, and toggle between exact and ignored.
   - Each non-exact chip has a count select: 1, 1-4, or to punctuation (`[clause]`).
   - Each chip shows its `$n`. Chips never merge.
3. The pattern: the generated DSL, read-only, with an "Edit as regex" button that converts to regex
   mode with a warning that the builder is left behind.
4. Case-sensitive.
5. Action: Swap (replacement), Delete, or Rewrite (note, whole paragraph).
6. Label: auto-named from the sample until you rename it.
7. Enabled, copy, delete.

Changing the sample re-tags it and resets the chips, and says so in the hint: "Changing the sample
resets the word choices." That fixes the old problem of slots silently shifting onto the wrong
words.

Regex rules show a plain text field in place of the builder.

### Rules from chat
- Select text in a message, then "Make rule". A popover beside the message shows the sample, the
  action select, and the note or replacement, with Save and "Open in Post-processing".
- Save creates an all-exact rule in the chat's resolved stack. "Open in Post-processing" saves,
  navigates to the module with that rule open, and scrolls to it. Today's flow lands at the end of
  the list with nothing open.

### Chat panel (`AgentChatPanel.tsx`)
- "Post-processing in this chat" (on/off override), the stack select, and "Use the global settings"
  to reset. Display mode stays where it is for the Default style.

---

## Part E: beat chips

- A "Suggest beats" button near the chat input, shown when post-processing is on.
- It makes one request through the agent connection. The input is the acrostic window and the last
  user message. The instruction: 3 next beats, each under 12 words, developing only people, objects,
  and threads already in the chat. It returns tagged lines, parsed like acrostic.
- Chips appear above the input. Picking one holds it for the next send, and picking it again clears
  it. Your text is untouched.
- On send, `appendSystem` adds "Next, develop this: <beat>". It shows in the request snapshot and
  lasts for one send (transient chatStore state, not persisted).
- Chips clear on send.
- `checkBeats.ts` covers the parser.

---

## Build order

1. **Stacks: data, store, resolve, file export.** Everything below is configured per stack.
2. **Module shell.** Registration, stack list, header, and stage list with switches, using the
   existing stage editors moved over as they are. Remove the Settings tab. After this, nothing is
   broken and everything has its new home.
3. **Chat panel: stack select.**
4. **Matcher extensions and their checks.** Pure engine work, before any UI depends on it.
5. **Rule editor with the builder.** Remove Words mode. Adds "rules from chat" with the popover.
6. **Tester over a chat, with hit counts and per-rule highlighting.** Needs the new editor's rule
   shape.
7. **Convert default rules.** Needs 4 to express them and 6 to see their hits.
8. **Acrostic draw and parse with checks.**
9. **Acrostic generation, stage editor, and Randomized swipe.**
10. **Beat chips.** Reuses the acrostic window and tagged-line parser.

Acrostic comes after the tooling because judging it needs the tester and stacks to toggle it. If you
want to feel acrostic sooner, steps 8 and 9 can move to just after step 2. They only need stacks.

## Out of scope
- Turn checks, badges, labels, metrics, pace, nudges.
- Checks for acting for `{{user}}` and character drift.
- Tool calling or json_schema in connectors.
- Per-chat overrides of stack contents. Upgrade path: `Chat.postStackOverrides`, following
  `Chat.agent`.
- Acrostic and beat chips in Write mode.

## Open questions
- Some contractions are ambiguous. "It's" can be "it is" or "it has", and "'d" can be "would" or
  "had". Compromise's `implicit` is a guess. A rule written as `it has` may miss an "it's" that
  compromise read as "it is". Step 4 decides whether that's acceptable or whether a literal should
  match either reading.
- Should the tester simulate acrostic fit on existing replies, e.g. how varied openers already are?
  It's skipped for now.
- Should "Suggest beats" work when post-processing is off for the chat? The plan says no.
