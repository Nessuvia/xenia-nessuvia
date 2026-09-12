# CLAUDE.md: Xenia Nessuvia

## What this is

A local-first character app that runs in the browser: chat with character cards, a Write mode for longer-form stories, an Ask scratchpad, and a multiplayer mode where guests join a host's chat from a link. All data lives in the user's browser. There are no accounts.

Four paths leave the tab:

- The model endpoint. OpenAI-compatible, hosted or localhost, with the user's own key.
- The multiplayer relay, a Centrifugo instance the user runs. Broadcast and presence only. Nothing
  is stored there. API keys stay out of it.
- The user's own S3-compatible bucket, when sync is on. No server of ours sits in the path.
- jsDelivr, for a tokenizer vocabulary, on the download button in a connection. Two public JSON
  files, no key, no user text. See `core/prompt/tokenizerCache.ts`.

`xenia.nessuvia.com` is a sentinel string. A connection pointing at it is answered in the browser with one canned line. Every outward call site checks `isSentinel` first, and that host never resolves. See `core/connectors/sentinel.ts`.

The build ships as static assets behind a Cloudflare Worker (`src/index.js`, `wrangler.jsonc`) that serves `dist` and declares no routes of its own. It installs as a PWA.

Every record carries an `ownerId`, hardcoded to `"local"`. It reserves room for a multi-user backend later. Build nothing around it now.

This codebase is a WIP. Treat imported data and existing IndexedDB contents as disposable. Skip migrations and back-compat shims for old records. Clearing site data is a fine answer.

## Stack

Vite · React 19 + TypeScript · plain CSS · React Router · Zustand · Dexie (IndexedDB) · pnpm

Runtime deps worth knowing: `@remixicon/react` (icons), `gpt-tokenizer` (bundled GPT token tables), `@lenml/tokenizers` (runs a downloaded `tokenizer.json` for other model families), `compromise` (POS tagging for the grammar hammer), `centrifuge` (multiplayer relay client), `aws4fetch` (SigV4 for bucket sync), `react-image-crop` (avatar cropping), `react-colorful` (the swatch picker in `app/ColorInput.tsx`). Dev side adds `vite-plugin-pwa` and `wrangler`.

There is no drag-and-drop library. Reordering is hand-rolled in `app/useDragReorder.ts`. Use it.
`itemProps` makes the whole row draggable and suits a row of plain content. A row holding an `input`
or a `textarea` uses `handleProps` on a drag handle and `dropProps` on the row. `draggable` on an
ancestor stops Chrome placing the caret in the field: the caret sticks at the start and clicking
between words does nothing. `modules/lorebooks/EntryRows.tsx` and the beat rows in
`modules/write/PlotLayout.tsx` are the pattern.

Plain CSS means plain CSS: one global stylesheet plus a `.css` file per module, imported directly. No utility framework, no CSS-in-JS.

## Structure

``` /src
  /app          sidebar, module registry, routing, shared components and hooks
    /skins      the structural half of a palette; see Style
  /core
    /storage    Dexie + the storage interface; the ONLY place that touches Dexie
    /connectors the model endpoint: request bodies, SSE streaming, model lists
    /stores     Zustand stores
    /prompt     prompt assembly: buildPrompt, buildStoryPrompt, budget, worldInfo, conditions
    /palette    appearance: palettes, webfonts, background HTML/CSS sanitizing
    /params     the sampler library: params as data, not code
    /hammer     grammar rules run over model output
    /secondSweep  Second Sweep: pipelines that work a finished reply over before it is stored
    /quality    scoring a candidate against the text it would replace
    /multiplayer  relay channels, session protocol, turn order, narrator
    /sync       S3 bucket push/pull and dirty-table tracking
    /settings   settings resolution helpers
  /modules
    /<name>     one folder per feature: index.ts self-registers it, plus its components and .css```

Modules self-register by calling `registerModule` from their `index.ts`. The sidebar and the router both derive from that registry. Adding a feature means adding a folder and importing it in `main.tsx`. Never edit a central list of screens. Beyond `{ id, label, icon, route, component }` a module may declare:

- `tabs`: `[hashId, label]` pairs shown as sidebar sub-items. The view reads the hash
  (`app/useHashTab.ts`).
- `plugin: true`: listed in Settings › Miscellaneous, off until enabled there.
- `chatPanels`: sections contributed to the chat sidebar, ordered by registration order in
  `main.tsx`. A panel that should stay hidden renders null. There is no visibility API.
- `decorateMessage(ctx)`: text appended to the outgoing user message before token substitution.

`component` is `lazy()` for route views. `chatPanels` stay eager and render inside the chat rather than behind a route.

Registered today: `chat`, `write`, `multiplayer`, `ask`, `slopdentifier`, `characters`, `personas`, `lorebooks`, `prompts`, `appearance`, `settings`, plus four special cases:

- `bodyMap` is a plugin. Registered, off until enabled in Settings.
- `learn` is registered in every build. The sidebar shows its button on dev only
  (`import.meta.env.DEV` in `Sidebar.tsx`), and `/learn` resolves on live with no way in.
- `sync` is registered and live. It sits under Import/Export in the rail rather than the main nav.
  `Sidebar.tsx` guards its entries with `syncModule &&`, and commenting the import out of
  `main.tsx` is the whole off switch.
- `join` is not a module. `App.tsx` mounts `/join/:sessionId` outside the app shell, and a guest
  never loads the sidebar.

## Seams: reuse these, don't reinvent

- **Prompt assembly** lives in `core/prompt`. `buildPrompt` (chat), `buildStoryPrompt` (Write),
  `budget` (token counting and history trimming; `loadTokenizer` is async, `countTokens` is sync,
  and both have to stay that way; `tokenizers`/`autoTokenizer`/`tokenizerCache` pick and fetch which
  one counts), `flattenPrompt` (text-completion connections), `swapTokens`, `worldInfo`,
  `conditions`, `chapterGuide`, `rewrite`. Anything changing what the model receives goes through
  one of these.
- **Text completion format** is `InstructTemplate` on the connection (`params/paramDef.ts`).
  `flattenPrompt` is the only reader: role sequences, first/last turn overrides, newline wrapping,
  speaker names, `{{char}}`/`{{user}}` in the sequences themselves, and the prefill.
  `templatePresets` ships the formats (ChatML, Llama 3, Mistral, Alpaca, Gemma, Command R), a
  deliberate exception to "nothing ships": an instruct format is a fact about a model rather than
  the user's taste. `params/templateFile.ts` is the standalone export, carrying no endpoint and no
  key by construction. The special-token flags (`add_bos_token`, `ban_eos_token`,
  `skip_special_tokens`) are ordinary `ParamDef` rows rather than template fields.
  `prompt/reasoning.ts` finds a think block's offsets. Nothing splits the stored reply: the text is
  kept whole, `Message.reasoningEnd` records where the block ends, and `MessageBubble` splits at
  render. Only a block at the very front counts. An unclosed one runs to the end.
- **Model calls** live in `core/connectors`. `openaiCompatible` (streaming), `dummy` (local
  generator for debugging), `buildRequestBody` + `completionUrl`, `listModels` + `modelsUrl`,
  `snapshot`.
- **Multiplayer**: `core/multiplayer/channel.ts` is the interface and `centrifugoChannel` is the
  implementation. Nothing above it touches the relay client. `protocol.ts` holds the event shapes,
  `protocolVersion` (guests reject a mismatch) and the 240 KB event cap. `hostSession`,
  `turnOrder`, `narrator`, `rosterAvatar` sit on top.
- **Sync** goes through `core/sync/syncClient.ts`, the only outward-facing file. `dirtyTables.ts`
  decides what needs pushing.
- **Appearance** uses `core/palette` for palettes, webfonts and the sanitizers, plus `app/skins` for
  the structural layer.
- **Sampler params** live in `core/params`. A param def is a row rather than code, and a new sampler
  needs no release.
- **Second Sweep** lives in `core/secondSweep`. A pipeline is a Dexie row holding an ordered list of
  stages (`gate`, `clean`, `rewrite`, `score`), each a kind plus a config blob. A new way of working
  a reply over is a JSON file rather than a release. `runPipeline` is the only entry point and it is
  chat-only. `pipeline.ts` holds the shapes, `pipelineJson` imports and exports them, `collect.ts`
  runs every detector once for the gate and the clean stage, and `core/quality` scores a candidate
  against what it would replace. The folder is flat. There is no `detect/`.
  A detector matches text: hammer patterns, free-text rules, the punctuation sweep. The checks that
  counted rather than matched (sentence sprawl, tricolons, phrases repeated from earlier replies)
  were deleted along with their settings and score weights. What a chat has actually overused is
  measured by `quality/census.ts`. `quality/sentences.ts` is all that remains of the sentence
  splitter. Which pipeline runs is a setting: global in `settingsStore.secondSweep`, overridden per
  chat on `Chat.secondSweep`.
  Nothing ships. There are no bundled pipelines, no bundled rule set, no bundled slop list. A fresh
  install has an empty library. A pipeline is written in Settings, imported from a file, or built a
  rule at a time from the Slop-dentifier.
- **Slop-dentifier** is `modules/slopdentifier`. It runs the same detectors read-only over pasted
  text and turns a finding into a `TextRule` on a pipeline the user picks. `analyse.ts` is pure and
  composes what already exists. It adds no detection of its own and makes no request.
  A 0.0.42 install's Second Pass and Gold Pass settings convert through `secondSweep/legacy.ts`
  (pure) and `stores/importLegacyPass.ts` (the storage side), behind a button in Settings › Misc.
  It is one-shot by erasing what it read rather than by setting a flag, and restoring an old backup
  offers it again. That is the one migration in this codebase and it stays opt-in.
- **Grammar hammer** lives in `core/hammer`. `tagger`, then `pattern`, then `matcher`, then
  `repair`/`strip`, with `exclusions` marking spans a rule may not touch.

## Data

Everything durable is in Dexie (`core/storage/db.ts`), currently `db.version(16)`: `characters`, `personas`, `worldInfo`, `lorebooks`, `chats`, `messages`, `promptStacks`, `stories`, `chapters`, `palettes`, `backgroundImages`, `bodyTrackers`, `bodyMaps`, `paramDefs`, `games`, `pipelines`.

- One `db.version(N).stores({...})` block, currently 16, holding the **complete** schema. The old
  chain was deleted. No block ever carried an `upgrade()` callback, and an older local DB upgrades
  straight to the current schema. Adding a table or index means editing that block and raising the
  number, then adding the name to `TableName` in `storageInterface.ts`. The number only goes up:
  IndexedDB refuses to open a database whose stored version is higher than the one requested.
  Adding an `upgrade()` callback would bring the chain back, and this codebase does not migrate.
- Adding a plain field needs no version bump: put it in `types.ts` and default it in the store's
  `newX()` factory. Indexes are only for fields you query with `find()`.
- `storage.put/remove/clear/putAll` call `markDirty` before the write, and that is how sync knows
  what changed. A whole-table replacement (restore, pull) runs inside `withDirtySuppressed`.

Three Zustand stores persist to localStorage rather than Dexie, via `zustand/middleware` `persist`: `settingsStore` (`nessuTavern.settings`, holding connections and the API keys with them), `askStore` (`nessuTavern.ask`), `blipStore` (`nessuTavern.blips`).

`core/storage/backup.ts` is the only code that reads or writes those keys for export/import. It carries `nessuTavern.settings` and `nessuTavern.ask`. Blips are unseen-reply markers and stay out. `stripApiKeys.ts` blanks `apiKey`, `accessKeyId` and `secretAccessKey` by name before a backup file leaves the browser. A backup gets emailed around, and a missed secret is the failure that matters.

**Non-portable preferences.** Small view state belonging to this browser rather than to the user's
data: whether a panel is collapsed, which rail is open, an example section dismissed. Write it
straight to `localStorage` under a `nessuTavern.*` key, with no store and no Dexie table, and leave
it out of the export. `backup.ts` reads only the three keys it names, and a new key stays out of a
backup by construction. `nessuTavern.sidebarCollapsed` (`app/Sidebar.tsx`) and
`nessuTavern.lorebooksExample` (`modules/lorebooks/EntryExample.tsx`) are the pattern. The test is
whether restoring a backup on another machine should carry it. If it shouldn't, it's a preference.

## Conventions

- camelCase everywhere: variables, functions, filenames. Exceptions only where the platform forces
  otherwise (CSS class names, HTML attributes).
- Plain functions rather than classes. State lives in Zustand stores. Avoid inheritance, factories,
  and any abstraction layer with one implementation.
- Write TypeScript like JavaScript. Interfaces for data shapes and for function signatures where
  they prevent real mistakes. Avoid generics gymnastics and decorators.
- Components read from and call into stores. **A component must never touch Dexie.** `core/storage`
  is the only importer of Dexie and that rule has no exceptions.
- The send path never calls `fetch` from a component: it goes store → connector. Five files outside
  `core/connectors` talk outward on purpose, each saying why in its header. `sync/syncClient.ts`
  (every request is SigV4-signed, and threading a signer elsewhere buys nothing),
  `multiplayer/centrifugoChannel.ts` (the relay client), the two Settings probes,
  `ConnectionEditor.tsx`'s connection test and `readContextLimit.ts`, one-shot diagnostics built
  from the connectors' own `completionUrl`/`modelsUrl`/`buildRequestBody`, and
  `prompt/tokenizerCache.ts`, which fetches a static vocabulary from a CDN on a button press. Don't
  add a sixth without the same kind of comment.
- Model output and imported character cards are untrusted input. Render them as React elements,
  never via `dangerouslySetInnerHTML`. This origin holds API keys in localStorage. User markup has
  exactly one vetted route: `palette/sanitizeHtml.ts` (a `<template>` parse against a structural
  allowlist, rejecting the whole input rather than scrubbing it) attached with `replaceChildren` in
  `PageBackground.tsx`, and `palette/scopeCss.ts` for user CSS, which wraps it in `@scope` and
  refuses it whole if a stray `}` escapes the block.
- Store what the model actually said. Formatting is a display concern. Never rewrite stored content.
- A file that a `check*` script imports uses explicit `.ts` extensions in its own imports. Node
  strips types rather than resolving like Vite. `core/params/paramDef.ts` and
  `core/multiplayer/relayConfig.ts` are the pattern.

## Specificity

Before wiring up any edit, ask what scope it should change. The same control can sensibly write to any of these levels, and the right one is a design decision rather than an accident of which record was closest to hand:

- a single message
- a single chat
- all chats with a character
- all chats using a prompt stack / connection / persona
- everything (a global default)

Write to the narrowest level that matches what the user meant, and make the level obvious in the UI. A knob that silently edits a wider scope than it appears to is the failure mode to watch for: picking a prompt option inside a chat writes back to the shared stack, and the next new chat inherits it. Fine when intended, surprising otherwise. When a level is chosen for expedience rather than intent, leave a comment naming the level and the upgrade path (e.g. per-chat override).

## Style

Keep styling light until the polishing phase. A screen that works and looks plain is done, and pixel work waits. Build the pieces so polish is cheap later.

**Before writing or editing any `.css` file or any `className`, read [`.claude/cssConventions.md`](.claude/cssConventions.md).** It is the full rulebook and the rules live there alone: the color vars, the spacing and type scales, the `z-index` ladder, the selector and class-naming rules, the breakpoint, the bans, and the skin contract. Its last section is a checklist to run against any diff that touches CSS.

The headline, to carry the shape in before you open it: no hardcoded colors, no invented spacing values, no invented `z-index` numbers, a class on every element you style, and nothing shared between two tabs living in a module stylesheet.

Icons come from `@remixicon/react`. Never stand in an emoji or a unicode glyph for an icon. Typography characters (`...`, `·`, `→`) are fine.

Shared UI patterns live in `/app` with their own `.css`, and modules import them: `CollapseButton` (chevron and rail), `Avatar`, `ColorInput`, `ColorStack`, `EntityPicker`, `TwoColumn`, `PageLoader`, `PromptPreviewPanel`, and the hooks `useCloseOnOutside` (every button dropdown uses it), `useDragReorder`, `useHashTab`, `useMediaQuery`. Second copy of a pattern is a nudge. Third is the cue to hoist it: small component, obvious props, room to grow.

## UI copy

Every string a user reads (labels, buttons, placeholders, hints, empty states, errors) is plain and boring. State what the thing does and stop. Leave out the pitch, the personality and the reassurance.

Write the shortest sentence that carries the fact. Then check it against these tells:

- The rhetorical triple and its shorter cousin, the negated pair: "no requests, no spend", "not a
  warning, not a block", "faster, simpler, cheaper". Never use either. State the positive fact:
  "Requests are not sent."
- The em-dash aside that adds a flourish rather than information.
- Words that praise the feature: seamlessly, simply, just, effortlessly, powerful, robust, smart.
- Explaining why a design is good, or what it saves the user, in copy that should only say what it
  does.

`"Replies come from a local generator. Requests are not sent."` is good. `"Replies come from a local lorem ipsum generator instead of the connection — streamed as real SSE, so nothing else changes. No requests, no spend."` is an actual string this codebase shipped, and the thing to avoid: three clauses of salesmanship for one fact.

This covers user-visible text. Code comments explain reasoning and can breathe.

## Builds

`wrangler.jsonc` deploys the built `dist`. It holds no binding beyond `ASSETS`.

`pnpm-workspace.yaml` pins which install scripts may run and explains the `packageManager` pin in `package.json`. pnpm 10 rejects that file outright.

## Verifying work

`npx pnpm build` (runs `tsc -b` then the Vite build) and the `check*` scripts must both pass. The checks are plain `node --experimental-strip-types` scripts with `assert`. `tsconfig.check.json` puts them in the `tsc -b` chain, and the build typechecks them without running their assertions. Run those separately:

Run `scripts/agent-test.sh` to typecheck and run every check* script. It prints one line when clean. Pass a substring to run a subset (`scripts/agent-test.sh turnOrder`), `-v` for untruncated failures, `--build` before handing off.

One is `.mjs` (`core/multiplayer/checkTurnOrder.mjs`). The glob above catches it. There is no test framework. Don't add one unasked.

When you add non-trivial logic (a branch, a loop, a parser, a security path), add one `check*.ts` next to it: the smallest thing that fails if the logic breaks. No frameworks, no fixtures, no per-function suites unless asked. Trivial one-liners need no check.

**Then stop and hand off.** User drives Chrome and tests in the browser personally. Don't launch a browser, don't drive the Chrome tools, and don't leave `npx pnpm dev` running in the background unless asked. Report that the build and checks are clean and say what's ready to look at.

`npx pnpm lint` (oxlint) exists from the Vite template and isn't enforced. Don't run it or add lint gates unless asked.
