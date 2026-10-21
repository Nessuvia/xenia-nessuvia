# CLAUDE.md: Xenia Nessuvia

This file holds the house rules. Feature details live next to the code (see Feature docs).

## What this is

A local-first character chat app that runs in the browser. All data lives in the user's browser.
There are no accounts and no backend of ours.

Every path that leaves the tab is deliberate, and each outward-facing file says why in its header:

- The model endpoint. OpenAI-compatible, hosted or localhost, with the user's own key.
- The multiplayer relay, a Centrifugo instance the user runs (`relay/`). Broadcast and presence
  only. Nothing is stored there and API keys stay out of it.
- The user's own Dropbox app folder, when sync is on.
- jsDelivr, for a tokenizer vocabulary on a button press. Public files, no key, no user text.

`xenia.nessuvia.com` as a connection URL is a sentinel answered in the browser
(`core/connectors/sentinel.ts`). Every outward call site checks `isSentinel` first.

The build ships as static assets behind a Cloudflare Worker (`src/index.js`, `wrangler.jsonc`) and
installs as a PWA.

Every record carries an `ownerId`, hardcoded to `"local"`. It reserves room for a multi-user
backend later. Build nothing around it now.

This codebase is a WIP. Imported data and existing IndexedDB contents are disposable. Skip
migrations and back-compat shims for old records. Clearing site data is a fine answer.

## Stack

Vite · React 19 + TypeScript · plain CSS · React Router · Zustand · Dexie (IndexedDB) · pnpm.
`package.json` is the dependency list. Icons come from `@remixicon/react`.

## Layout

```
/src
  /app       shell: sidebar, routing, module registry, shared components and hooks
  /core      logic with no screen of its own, one folder per concern
    /storage   Dexie and the storage interface; the only importer of Dexie
    /stores    Zustand stores
    /...       prompt, connectors, multiplayer, sync, palette, params, ...
  /modules   one folder per screen or feature: index.ts registers it, plus its components and .css
  /assets    testAssets/ holds fixtures for check scripts; nothing there ships
/relay       self-hosted Centrifugo relay config, scripts and setup guide
/scripts     agent-test.sh and other dev tools
/public      static files served as-is
```

New logic goes in `core`, UI in `modules`. A few stores still import parsers and bundled files
from their module (`charactersStore`, `stacksStore`, `lorebooksStore`). Don't add more.

Modules self-register by calling `registerModule` from their `index.ts`, and the sidebar and router
both derive from that registry. Adding a feature means adding a folder and importing it in
`main.tsx`. Never edit a central list of screens. `app/moduleRegistry.ts` documents what a module
can declare.

Before building a component or hook, check `/app`. A second copy of a pattern is a nudge. The third
is the cue to hoist it there.

## Feature docs

A feature that needs more explanation than its code and header comments gives has a `README.md` in
its folder (`core/prompt/README.md`, `modules/prompts/README.md`, ...). Before working in a folder,
read its README if it has one.

When you change how a feature works, update its README in the same change. When you add a feature
or seam with rules a newcomer would trip on, give it a README. Keep a README to what isn't obvious
from the code: where things live, the non-obvious rules, how to extend it. Don't list every file;
that goes stale.

Feature details don't go in this file. This file is for rules that hold everywhere.

## Rules

- camelCase everywhere: variables, functions, filenames. Components are PascalCase. Exceptions only
  where the platform forces otherwise (CSS class names, HTML attributes, route-named files like
  `core/tour/tours/`).
- Plain functions rather than classes. State lives in Zustand stores. Avoid inheritance, factories,
  and any abstraction layer with one implementation.
- Write TypeScript like JavaScript. Interfaces for data shapes and for function signatures where
  they prevent real mistakes. No generics gymnastics, no decorators.
- **A component never touches Dexie.** `core/storage` is the only importer of Dexie, no exceptions.
- **The send path never calls `fetch` from a component.** It goes store → connector. The few files
  outside `core/connectors` that talk outward each say why in their header. Don't add one without
  the same kind of comment.
- **Model output and imported cards are untrusted input.** Render them as React elements, never via
  `dangerouslySetInnerHTML`. This origin holds API keys in localStorage. User markup has exactly one
  vetted route, described in `core/palette/README.md`.
- **Store what the model said.** Formatting is a display concern. Never rewrite stored content.
- **A field shows exactly what the user typed.** Two things break that and put the caret at the end:
  a value that comes back from a store after an `await` (update state first, then write), and a
  value rebuilt from a different shape on every keystroke. A field that stores a list uses
  `app/ListInput.tsx`. Any other converted value keeps its own raw-text draft the same way.
- A file that a `check*` script imports uses explicit `.ts` extensions in its own imports. Node
  strips types rather than resolving like Vite.
- Data rules (schema version, dirty tracking, what goes in a backup, where preferences go) are in
  `core/storage/README.md`. Read it before adding a table, a field, or a localStorage key.

## Specificity

Before wiring up any edit, ask what scope it should change. The same control can sensibly write to
any of these levels, and the right one is a design decision rather than an accident of which record
was closest to hand:

- a single message
- a single chat
- all chats with a character
- all chats using a prompt stack / connection / persona
- everything (a global default)

Write to the narrowest level that matches what the user meant, and make the level obvious in the
UI. A knob that silently edits a wider scope than it appears to is the failure mode to watch for.
When a level is chosen for expedience rather than intent, leave a comment naming the level and the
upgrade path (e.g. per-chat override).

## Style

Keep styling light until the polishing phase. A screen that works and looks plain is done.

**Before writing or editing any `.css` file or any `className`, read
[`.claude/cssConventions.md`](.claude/cssConventions.md).** It's the full rulebook, and its last
section is a checklist to run against any diff that touches CSS. The headline: no hardcoded colors,
no invented spacing values, no invented `z-index` numbers, a class on every element you style, and
nothing shared between two tabs living in a module stylesheet.

Three layout rules hold on every page. Nothing scrolls sideways. Every top-level page starts with
`<PageHeader>`. Every field and button takes its size from the `--field*`, `--buttonPad` and
`--numberWidth` vars in `index.css`.

Never stand in an emoji or a unicode glyph for an icon. Typography characters (`...`, `·`, `→`) are
fine.

## UI copy

Every string a user reads (labels, buttons, placeholders, hints, empty states, errors) is plain and
boring. State what the thing does and stop. Leave out the pitch, the personality and the
reassurance.

Write the shortest sentence that carries the fact. Then check it against these tells:

- The rhetorical triple and its shorter cousin, the negated pair: "no requests, no spend", "not a
  warning, not a block", "faster, simpler, cheaper". State the positive fact: "Requests aren't
  sent."
- The em-dash aside that adds a flourish rather than information.
- Words that praise the feature: seamlessly, simply, just, effortlessly, powerful, robust, smart.
- Explaining why a design is good, or what it saves the user, in copy that should only say what it
  does.

`"Replies come from a local generator. Requests are not sent."` is good. `"Replies come from a local
lorem ipsum generator instead of the connection — streamed as real SSE, so nothing else changes. No
requests, no spend."` is the thing to avoid.

This covers user-visible text. Code comments explain reasoning and can breathe.

## Builds

`main` is what's live. Workers Builds deploys every commit that lands there. Never commit to `main`
directly: work on a branch and merge it in. There's no version number; the sidebar shows the date
and short hash of the commit a build came from.

`pnpm-workspace.yaml` pins which install scripts may run and explains the `packageManager` pin in
`package.json`.

## Verifying work

Run `scripts/agent-test.sh` to typecheck and run every `check*` script. It prints one line when
clean. Pass a substring to run a subset (`scripts/agent-test.sh turnOrder`), `-v` for untruncated
failures, `--build` for the full Vite build before handing off.

The checks are plain `node --experimental-strip-types` scripts with `assert`. There's no test
framework. Don't add one unasked. When you add non-trivial logic (a branch, a loop, a parser, a
security path), add one `check*.ts` next to it: the smallest thing that fails if the logic breaks.
Trivial one-liners need no check.

**Then stop and hand off.** The user tests in the browser personally. Don't launch a browser, don't
drive the Chrome tools, and don't leave `npx pnpm dev` running unless asked. Report that the build
and checks are clean and say what's ready to look at. Don't close with a question or an offer of
next steps.

`npx pnpm lint` (oxlint) exists from the Vite template and isn't enforced. Don't run it or add lint
gates unless asked.
