# Prompt assembly

Anything that changes what the model receives goes through this folder. Stack templates and
variables are documented in `modules/prompts/README.md`.

## Entry points

- `buildPrompt`: chat.
- `buildStoryPrompt`: Write. The app supplies `{{before}}`/`{{after}}`/`{{selection}}`,
  `{{action}}`, the plan and the note. The template owns every word. `{{before}}` is trimmed from
  the top to fit.
- `flattenPrompt`: turns messages into one string for text-completion connections.

## Pieces

- `stackTemplate.ts`: a stack is one template. `{% var %}` declarations, `{% message %}` and
  `{% depth %}` tags, `{{ history }}`, and `templateProblems` for the editor.
- `template.ts`: `{% if %}` tags and a stack's `{{variables}}`. Comments (`{# #}`, plus ST's
  `{{// }}`) are removed first via `stripComments`.
- `swapTokens.ts`: `{{char}}`, `{{user}}` and other tokens.
- `worldInfo.ts`: lorebook entry matching.
- `dice.ts`: inline `{{roll::1d20}}` (fresh per occurrence) and the `dice` variable kind (rolled
  once per send).
- `rewrite.ts`, `miscPrompts.ts`, `xeniaPrompts.ts`: utility prompts.

## Token budget

`budget.ts` counts tokens and trims history. `loadTokenizer` is async and `countTokens` is sync,
and both have to stay that way. `tokenizers.ts` and `autoTokenizer.ts` pick which tokenizer counts.
`tokenizerCache.ts` downloads a vocabulary from jsDelivr on a button press; it's one of the
deliberate outward calls.

## Text completion

The format is `InstructTemplate` on the connection (`core/params/paramDef.ts`). `flattenPrompt` is
its only reader: role sequences, first/last turn overrides, newline wrapping, speaker names,
`{{char}}`/`{{user}}` in the sequences, and the prefill.

`templatePresets` in `paramDef.ts` ships the formats (ChatML, Llama 3, Mistral, ...). That's a
deliberate exception to "nothing ships": an instruct format is a fact about a model, not the
user's taste. The special-token flags (`add_bos_token`, `ban_eos_token`, ...) are ordinary
`ParamDef` rows rather than template fields.

## Reasoning

`reasoning.ts` finds a think block's offsets. Nothing splits the stored reply: the text is kept
whole, `Message.reasoningEnd` records where the block ends, and `MessageBubble` splits at render.
Only a block at the very front counts. An unclosed one runs to the end.
