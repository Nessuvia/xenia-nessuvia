# Prompt stacks

A prompt stack is one Jinja-style template (`PromptStack.template`) plus the player's variable
values, an optional custom look, misc prompt overrides and text rules. Chat and Story stacks share
the table and the language; `kind` keeps them apart. The old block model (cards, block tree,
`VariablesPanel`) is gone. Don't bring it back.

Read the root `CLAUDE.md` first for the house rules (no Dexie in components, sanitizer route, copy
style, `check*` scripts). This file only covers what's specific to stacks.

## Where things live

| If you want to change | Go to |
| --- | --- |
| Template syntax: `{% var %}`, `{% message %}`, `{% depth %}`, `{{ history }}`, template errors | `core/prompt/stackTemplate.ts` |
| `{% if %}` / `elif` / comparisons, `{{variable}}` substitution, what a variable reads as | `core/prompt/template.ts` (`variableValues`, `resolveTemplate`) |
| A new variable kind | `StackVariable` in `core/storage/types.ts`, then see "Adding a variable kind" below |
| Slots like `{{ charDescription }}`, `{{ worldInfo }}`, `{% systemPrompt %}fallback{% endsystemPrompt %}` | `core/prompt/buildPrompt.ts` (`slots`, `takeFallbacks`) |
| Story stack assembly | `core/prompt/buildStoryPrompt.ts` |
| `{{char}}`, `{{user}}` and other tokens | `core/prompt/swapTokens.ts` |
| Dice (`{{roll::1d20}}`, `dice` kind) | `core/prompt/dice.ts` |
| Utility prompts (continue, rewrite, narrator, outlines...) | `core/prompt/miscPrompts.ts` (a row per prompt), UI in `MiscPromptsPanel.tsx` |
| What each kind requires (Story needs `storyContext`, has no history or depth) | `templateProblems` in `stackTemplate.ts`; `stackKinds.ts` wraps it for the editor |
| CodeMirror editor, highlighting, completion | `TemplateEditor.tsx` |
| The editor page layout (tabs `#stacks`, `#look`, `#misc`) | `StackEditor.tsx`, styles in `prompts.css` |
| The live preview beside the template | `PromptPreview.tsx` |
| The controls players see in chat and Story panels | `PromptToggles.tsx` (standard list), `VariableControl.tsx` (one control per kind) |
| Custom looks | See "Looks" below |
| Export/import of stack files | `stackFile.ts` (format `nessu-prompt-stack`, version 3) |
| Bundled/default stacks | `core/stores/stacksStore.ts` (`bundledStacks`, `defaultStack`...), JSON in `xeniaChatStack.json`, `defaultStoryStack.json` |
| SillyTavern preset import | `core/sillytavern/` (`stMacros.ts` rewrites macros to variables and `{% if %}`, `stBlock.ts` writes declarations back out) |

## Non-obvious things

- **Values are per stack, not per chat.** `PromptStack.values` is shared by every chat on the
  stack. Changing a toggle in a chat changes it for all of them. That's a known scope choice
  (see the Specificity section in the root `CLAUDE.md`); per-chat overrides are the upgrade path.
- **Declarations are the source of truth.** `stackVariables(stack)` parses the template and lays
  `values` over the defaults. A stored value that no longer fits the declaration (wrong type, removed
  dropdown option) is silently dropped by `fits`. There is no migration for renamed variables.
- **Variable ids fold to lowercase** in `variableValues` and conditions. A range becomes
  `{{id_start}}` / `{{id_end}}`. A list becomes its non-blank lines joined by `sep`. A dice variable
  is rolled once per `variableValues` call, so call it once per send.
- **Declarations are stripped before resolving.** `templateBody` removes `{% var %}` lines and
  comments. `{# #}` and ST's `{{// }}` comments go first, so a tag inside a comment is never read.
- **Card slots run through the template too.** A card's own `{% if %}` is honoured, and a blank
  slot's line collapses.
- **Stack variables beat built-in flags** (`narrator`, `char1`..`char4`, `game`, tracker values) on a
  name clash.
- **The Narrator** takes its instructions from the stack's `{% if narrator %}` branch when one
  exists, otherwise from the `narrator` misc prompt (`mentionsCondition` in `template.ts` decides).

## Variable syntax

```
{% var length slider 10 500 10 = 110 label="Length" %}
{% var wordCount range 50 500 10 = 200 400 label="Word count" %}
{% var mood dropdown calm|angry = calm info="Shown as a tooltip" %}
{% var dnd checkbox = true %}
{% var goal text = "find the key" %}
{% var hit dice = 2d6 %}
{% var banned list = "ozone|breath hitching" sep="; " %}
```

`label` and `info` work on every kind. `list` defaults to `sep=", "`; `\n` and `\t` are understood
inside `sep`. Examples of every kind are asserted in `core/prompt/checkStackTemplate.ts`.

### Adding a variable kind

1. Add the shape to `StackVariable` in `core/storage/types.ts`.
2. Parse it in `parseVar` and add the keyword to `kindNames` (`stackTemplate.ts`). Update the
   "Unknown kind" message.
3. Decide what the template sees in `variableValues` (`template.ts`).
4. Add its control in `VariableControl.tsx`. The `switch` has no default, so tsc tells you.
5. Write it back out in `declaration` in `core/sillytavern/stBlock.ts`.
6. Add a case to `checkStackTemplate.ts`.

`fits` (stackTemplate.ts) treats anything unlisted as a string. Check it if your value isn't one.

## Looks

A look is maker HTML and CSS that lays out the variables in the chat and Story panels
(`PromptStack.look`). The Look tab is `LookPanel.tsx`.

- **Rendering:** `StackLookView.tsx`. The HTML goes through `sanitizeBackgroundHtml` with
  `lookPolicy` (`core/palette/sanitizeHtml.ts`), attached with `replaceChildren`. Controls are React
  portals into the slots. The CSS is wrapped in `@scope` by `scopeBackgroundCss`.
- **Slots:** `data-var="id"` mounts that variable's control. `data-group="a, b, c"` mounts one
  dropdown over several checkboxes, turning on exactly one (`lookGroup.ts`). `data-none="Off"` adds
  an all-off option. Variables in neither are listed after the layout unless
  `look.hideUnplaced` is set.
- **CSS hooks:** the root carries every value as `data-<kebab-id>` (`lookDataAttrs` in
  `stackLook.ts`), so `:scope[data-internal-states="false"] .x { display: none }` works. Control
  classes: `.optionalBlock`, `.checkboxRow`, `.optionPick`, `.scrollPick`, `.lookGroupPick`.
- **Validation:** `lookProblems` in `stackLook.ts`. Any error falls back to the standard list
  everywhere; warnings only show in the editor.
- **Allowing a new tag or attribute:** edit `lookPolicy` in `sanitizeHtml.ts`, then update the
  Reference list in `LookPanel.tsx` and the rules in `lookPrompt.ts`. Those three must agree or the
  model writes markup the sanitizer rejects.
- **Remote URLs** need `stack.allowRemote`, which `stackFile.ts` never exports or imports.

### Ask AI for a look

`lookPrompt.ts` holds the system prompt, the request builder, the JSON schema and the reply parser.
The request sends only variable declarations (id, label, kind, value, options/bounds) and the
current look. The call
goes through `askJson` in `core/palette/generatePalette.ts`, shared with palettes: it walks the
structured-output ladder and remembers the working rung on `connection.structuredOutput`.

### Ask about the template

On the Template tab of a chat stack, Ask sends the whole template plus the Ask thread so far.
`templatePrompt.ts` wraps the template in `<template_under_review>` tags and reads the reply: the
last fenced `template` block replaces the template, with Undo. The system prompt is the `stackAsk`
row in `core/prompt/xeniaPrompts.ts`, editable in Settings › Xenia Prompts.

## Checks

`scripts/agent-test.sh` runs everything. The ones that matter here: `checkStackTemplate`,
`checkTemplate`, `checkDice`, `checkPrompt`, `checkBuildStoryPrompt`, `checkMiscPrompts`,
`checkStMacros`, `checkSillyTavern`, `checkLookGroup`, `checkLookPrompt`. Pass a substring to run a
subset: `scripts/agent-test.sh Stack`.
