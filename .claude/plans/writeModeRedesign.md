# Write mode redesign

Status: v1 built 2026-10-02, awaiting browser testing. Written 2026-10-01 from a question session with the owner.

## Why

The current Write mode (`src/modules/write/`) stores a Chapter as a list of Blocks, and every Block is a beat instruction glued to its own chunk of prose. You write inside one small box per beat. The owner's verdict: beats and plot are fine ideas, but this layout makes them hard to understand and writing in little boxes feels bad.

The target feel is NovelAI's writing mode or OpenWrite: one long document you type into, with the AI continuing or reworking text in place.

## What gets thrown away

Everything in the old mode, data included. Existing Stories and Chapters are deleted, with no conversion. Clearing site data is an acceptable answer (see CLAUDE.md: imported data and IndexedDB contents are disposable).

Gone:

- The `Chapter` record and its `blocks`, per-block swipes, `guideSend`, and the `chapters` table.
- `PlotLayout`, the outline dialogs, `WeightPicker`, beat weights, bulk beats.
- The budget ladder in `core/prompt/chapterGuide.ts` that degrades old prose into beat lines.
- Story fields: `themes`, `genre`, `tone`, `setting`, `targetWords`, `capsCollapsed`, `paramOverrides` (per-story sampler overrides).

Kept from the old `Story`: title, cover image (3:4 crop), cast, lorebooks (with the existing on/off/dropped handling), story width setting, and export. `direction` survives as the Author's Note (below). Premise and ending survive as plot fields.

## Mental model

### The document

A story is one continuous plain-text document. There are no separate chapter records.

Chapters are markdown headings inside the text: a line starting with `# ` is a chapter heading. Headings are used for navigation and export. Beats are not tied to them.

Formatting is live-styled: `*italics*` and `**bold**` show styled with their markers dimmed, but the stored text stays plain markdown. What's stored is exactly what the model sees.

No provenance tracking. AI text looks the same as typed text. (A tint was considered and dropped.)

### Plot = premise + beats + ending

- Premise: where the story starts.
- Ending: where it's meant to land.
- Beats: the path between them.

A beat is a to-do item for the AI: one line saying something that should happen ("Mara finds the letter"). Beats are an ordered checklist.

- The user ticks a beat off when they're happy the text covers it. The app never ticks beats on its own judgement.
- The model is fed the first unticked beat as the current one, plus the next few as lookahead, so it writes toward the current beat without painting itself into a corner.
- Beats are guidance only. They don't own any prose and aren't anchored to a position in the document. Editing prose never touches beats, and vice versa.
- Beats are reorderable with `app/useDragReorder.ts` (rows hold an input, so use `handleProps` + `dropProps`).

### Author's Note

One text box, a standing instruction that is sent on every generation. It replaces the old `direction` field. There is no separate "Memory" box (NovelAI's Memory is a block pinned to the top of context; lorebooks already do that job here). Where the note lands in the prompt is the stack's decision.

### Cast and lorebooks

The cast stays. Attached characters' card text reaches the prompt through the stack (e.g. `{{cast}}`), and their lorebooks join the story's lorebooks, as today. Standalone lorebooks attach directly as today.

## Generating text

Two first-class interactions.

### Continue

A button/hotkey generates at the cursor, streaming inline into the document.

- At the end of the document, the model continues.
- With the cursor mid-document, the model gets the text before the cursor and the text after it as "what follows", and writes a bridge. The app only supplies the two halves. Whether and how the after-text is used is the stack's choice.

### Selection actions

Select text, pick an action. v1 actions:

- Rewrite, with an optional typed instruction
- Expand
- Shorten / tighten

The result replaces the selection.

### Retry and swipes

Only the most recent generation (continue or selection action) can be retried. Retrying keeps alternates, with left/right swipe arrows to move between them. As soon as the user types, the last generation is committed and its swipes are dropped. The app has to remember the span of the last insertion internally even though nothing tints it.

### Length

The stack defines what Short / Medium / Long mean (value and unit: words, tokens, sentences). The length control is a stack variable by convention: a `length`-kind var named `length` is shown as the length control in the Write toolbar, with S/M/L presets and a box to type a number. The app adds no built-in length field. A stack that doesn't declare it gets no length control.

## Prompt building

Write mode uses a prompt stack, same machinery as Chat (`core/prompt/stackTemplate.ts`, `template.ts`). The app supplies values; the template owns every word the model sees. Values the app provides, names to be settled at build time:

- the document text before the cursor, and the text after it
- premise, ending, current beat, next few beats
- Author's Note
- cast card text
- lorebook entries (via `worldInfo`)
- `action` (`continue`, `rewrite`, `expand`, `shorten`), `selection`, and the user's rewrite instruction

Selection actions live in the same template, branched with `{% if action == 'rewrite' %}` and so on. No separate misc prompts, no hardcoded action wording.

Story metadata (genre, tone, setting, themes) is gone from the app. A stack that wants those knobs declares them as `{% var %}` variables.

### Chat vs text completion

Both connection types work. Text completion gets the raw document (through `flattenPrompt` and the connection's instruct template as usual); chat completion gets an instruction wrapper. The user doesn't have to care which. In practice this lives in the stack and the existing chat/text plumbing, not in Write-specific code.

### Context overflow

When the document doesn't fit, trim from the top and keep the most recent text that fits. No summarising, no degrading to beats. Lorebooks and the Author's Note carry older facts.

## Screens

### Story list

A list/grid of stories (title, cover), as today. Open one to write.

### Writing screen

The document takes the main area. Write mode reuses the left panel for its own controls, the same way Chat contributes panels to the left sidebar: premise, beats, ending, Author's Note, cast, lorebooks, length control, other stack variables. On mobile the panel is a drawer that slides over the editor, as in Chat.

Story width setting stays. Export stays (the document as markdown/txt).

## Deferred (not v1)

- AI-suggested beats: a button that proposes the next few beats from premise, ending and text so far.
- Running the post-processing pass (`core/agent`) on Write generations and selection actions.

## Settled 2026-10-02 (formerly open questions)

- Variable names the app passes to the stack: `{{before}}`, `{{after}}`, `{{selection}}`, `{{beat}}`
  (current), `{{nextBeats}}`, `{{doneBeats}}`, `{{premise}}`, `{{ending}}`, `{{note}}` (Author's
  Note), `{{cast}}`, `{{action}}`, `{{instruction}}` (rewrite instruction).
- Lookahead: every unticked beat after the current one goes in `{{nextBeats}}`. A template that
  wants fewer can slice the list.
- Ticked beats are sent as `{{doneBeats}}`, and the template decides whether to use them.
- Length: a new var kind, `length`, with three presets, a unit and a default:
  `{% var length length 50|150|400 words = 150 %}`. The Write toolbar shows S/M/L plus a number
  box for a var of this kind named `length`. Elsewhere it renders as a number box.
- Editor: CodeMirror 6. It must feel like a plain text editor by the end, not a code editor: no
  gutter or line numbers, prose font, soft wrapping, no code-style selection or active-line look.
- Hotkeys: Ctrl+Enter continues at the cursor, Ctrl+Shift+Enter retries the last generation,
  Alt+Left/Alt+Right swipe.
