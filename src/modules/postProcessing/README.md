# Post-processing

Post-processing edits an assistant reply after it streams in. It removes LLM habits in code, sends flagged passages to a model for rewrites, then smooths the whole reply. The UI says "Post-processing". The code says `agent`.

## Where things live

| Path | Holds |
| --- | --- |
| `src/modules/postProcessing/` | The screen: stack list, stage editors, rules panel, rule builder, tester, stack file import and export |
| `src/core/agent/agentConfig.ts` | `AgentConfig` (global switch, style, connection, default stack) and `defaultRules()` |
| `src/core/agent/postStack.ts` | `PostStackConfig`, `defaultPostStackConfig()`, `runStages()`, stack resolution |
| `src/core/agent/runAgent.ts` | The engine and its single entry point |
| `src/core/agent/rules.ts` | The `Rule` type and regex compiling |
| `src/core/hammer/` | Matching: tagger, pattern DSL, matcher, strip and repair, exclusions |
| `src/core/agent/lint/`, `lintRules.ts` | Style checks written as code |
| `src/core/agent/flow/`, `flowRules.ts` | Message detectors |
| `src/core/agent/vadGuard.ts`, `dialogueGuard.ts` | Guards on whole-reply rewrites |
| `src/core/agent/explain.ts` | The tester: runs the in-code steps and reports hits, with zero model calls |
| `src/core/agent/stage.ts` | Marked runs for the Stylized animation |
| `src/core/stores/swipes.ts` | `passOriginals`: the pre-pass text kept beside each swipe |

## Two layers of config

`AgentConfig` lives in `settingsStore`. It holds what stays on this machine: the master switch, the style (Default or Stylized), the connection for rewrite calls, and `defaultStackId`.

A post-processing stack holds everything the pass does. Stacks are Dexie rows. A user keeps several, duplicates them, and exports them as JSON files (`postStackFile.ts`, format `nessu-post-stack`). A stack file carries a name and a config, and it is safe to share.

`resolvePostStack` picks the stack in this order: the chat's own stack, `defaultStackId`, then `defaultPostStackConfig()`. `Chat.agent` overrides the switch and the display mode per chat.

Each stored stack owns a copy of its rules. Edits to `defaultRules()` reach new stacks and the built-in fallback.

## The pipeline

`runAgent(reply, run, complete)` takes the reply, an `AgentRun` from `runStages()`, and a `complete` function from `chatStore`. The engine stays pure, and the store owns the connector.

1. **Swaps.** Lexicon entries, then `swap` rules, in list order. Pure code.
2. **Lint.** Style checks from `lint/`, once per reply, per paragraph, using the VAD lexicon for scene temperature.
3. **Deletes.** A sentence hit by a `delete` rule goes.
4. **Rewrites.** One flagged sentence in a paragraph gets a sentence rewrite. Two, or one hit from a `wholeParagraph` rule, get a paragraph rewrite. A candidate passes once swaps run on it and every rule comes back clean. After `maxTries` failures the original stays. A stuck sentence escalates once to itself plus its neighbours.
5. **Message detectors.** Flow rules find a problem in code (body beats, repeated openers, staccato runs, narration ratio) and a small prompt fixes that span. Detection reruns after each fix, up to a per-reply cap.
6. **Flow pass.** One call over the finished reply for transitions and rhythm. Guards hold sentence count within `sentenceDrift`, keep speech word for word, and limit VAD swing, with extra room toward the message being answered.
7. **Dialogue pass.** One call that makes speech sound spoken. It runs last and is the one step allowed to add a line.

The ignore list (`ignore.pairs`, plus global Tags) marks spans every step leaves alone. Code spans and URLs are always skipped.

## Rules

A `Rule` has a match mode and an action. Any mode pairs with any action.

- **`regex`**: a JS pattern, matched against the whole paragraph. Use it for alternation, word endings, lookaround, sentence anchors, or spans that cross sentences.
- **`pattern`** (UI: Word types): the part-of-speech DSL, such as `with a [adj] [noun]`, `[clause]`, `[word]{1,2}`. It stays inside one sentence. Compromise does the tagging, and it tags loosely: "tired" and "eyes" can come back as verbs.
- **`swap`** replaces the match in code. A blank replacement removes it and repairs spacing, commas and capitals.
- **`delete`** removes the whole sentence.
- **`rewrite`** sends the sentence, or the paragraph with `wholeParagraph`, to the model with the rule's `note`.

Swaps run in list order. The paired em dash rule sits before the single ones.

### Writing default rules

Defaults sit in `defaultRules()`. The house style:

- Each regex rule gets a `// ponytail:` comment naming what it needs from regex, plus any known false positive and the upgrade path.
- Shared fragments live as constants at the top: `sentenceStart`, `clauseRest`, `narration` (outside quoted speech), `tailStop`, `interjections`, `ingNouns`.
- A `note` names the habit and says what to write instead, in one or two plain sentences.
- One rule per habit family. When a new phrase joins a family, add it to that rule's alternation.
- Speech is fair game by default. Add `${narration}` when a pattern reads naturally in dialogue (short sentences, fragments).

Sort a new habit into one of three homes:

- A **rule** for a phrase or sentence shape.
- A **lint rule** in `lint/` for a budget or a judgement that needs tokens and quote ranges.
- A **flow detector** in `flow/` for a shape across the reply, such as rhythm, repetition or ratios.

## Checks

- `checkDefaultAgentConfig.ts` runs `explainAgent` over real reply sentences. Add an assert per new default rule: one line it must catch and one it must leave.
- `checkDefaultRules.ts` holds each Word types conversion to the regex it replaced.
- `checkRunAgent.ts`, `checkFlow.ts`, `checkLint.ts`, `checkVadGuard.ts`, `checkDialogueGuard.ts` and `checkStage.ts` cover the engine.

Run `scripts/agent-test.sh` (or `scripts/agent-test.sh DefaultAgent` for a subset). To size a rule against a real log, compile `rule.find` with `new RegExp` and count matches per paragraph in a small scratch script outside the repo.

## Display

Stylized (the default style) animates the pass: deletes strike out on their own timer, rewrites fade in, swapped words flash. `runAgent` reports marked runs through `chatStore.streamingStage`, and `chat.css` animates them.

Default style uses the chat's display mode: blur, hold or reveal, fed by `onProgress` through `chatStore.streamingPending` into `modules/chat/agentSegments.ts`.

The stored message keeps the final text and the original in `passOriginals`. A user can compare them or rerun the pass.
