# Post-processing v3

## Why this version

The pass catches enough and its rewrites are fine, but replies still read stilted. The problem sits
between sentences, where no rule looks:

- Filler body beats: `He shifted his weight on the rug.` as its own paragraph, `He shook his head.`
  between two lines of dialogue.
- Runs of the same opener: `He looked`, `He shook`, `He shifted`, `he said`.
- Staccato fragments: `"If you want. Anytime."`
- Dialogue that reads as written rather than spoken.
- A reply whose tone ignores the last message (a joke answered with self-punishment).
- Patched sentences that don't fit their neighbours, because a rewrite only sees its paragraph.

The target setup: a large model writes the reply, and a small local model reworks the prose while
keeping what the reply commits to. LLM judges are out. Detection stays in code, and the model only
rewrites.

## Reference example

Context: Lucille jokes, "I was hoping I could kick his ass." Original reply:

```
Damien's brows pulled together. Then a short breath of laughter came out before he could stop it. He looked down at himself, at the long arms and the shoulders that filled the sleeves.

"Yeah, that guy couldn't have done anything about it." He shook his head. "You would've ended him."

He shifted his weight on the rug.

"You still can," he said. "If you want. Anytime. I'll stand there and take it."
```

What the user wrote instead:

```
He raised an eyebrow, then gave a short laugh. "Hah, well, I'd still let you. Hell, it's probably less 'let' and more 'I couldn't stop you if you wanted.'"

"As for the guy in that picture," he added. "It'd be a bloodbath. You'd wipe the floor with him."
```

What changed: narration went from about 40 words against 30 of dialogue to about 8 against 45; body
beats from four to two; the dialogue became spoken (hedges, a correction partway through); the reply
answers the joke first and matches its tone. The first detector checks use this pair.

## Decisions

| Topic | Decision |
|---|---|
| Pipeline order | Word (lexicon, swaps, lint) → sentence fixes → message detectors → flow pass → dialogue pass |
| LLM judge | None. Detectors are code. The model only rewrites |
| Rewrite context | Last N chat messages plus the sentences on each side. `contextMessages` per stack, default 4 |
| Context history | Stored replies are already post-processed, so context needs no extra cleaning |
| Message detectors | Repeated openers, filler body beats, staccato runs, cross-paragraph repeats, seams around rewrites, narration ratio, body-beat budget. Flat rhythm last, lowest priority |
| Detector output | Sentence ranges plus a problem string. Each becomes a small fix prompt over those sentences |
| Fix checks | Every fix goes back through the rule and lint checks, like rewrites do now |
| Filler beat fix | May merge into a neighbour, delete, or both |
| Escalation | A sentence that fails its tries gets one group rewrite with its neighbours, then stops. Nothing escalates to the whole message |
| Flow pass | Always on while post-processing is on. One call over the whole reply: fix transitions and rhythm, keep meaning |
| Flow pass accept | Sentence count within a percentage of the input (per stack), no new rule hits, VAD guard passes. Otherwise the previous text stays |
| Dialogue pass | Last, so the flow pass can't undo it. Makes quoted speech sound spoken and answer what was said |
| Dialogue intent | What the reply commits to (facts, offers, refusals), not its wording. The code check is rough: names, negations, questions kept |
| Dialogue opt-out | Later: a stack switch that turns the pass off and has the flow pass leave quoted text alone, for users who prefer the large model's dialogue |
| VAD data | Extend `scripts/buildArousal.mjs` to valence and dominance. Still its own lazy chunk, still out of precache |
| VAD guard | Blocks large swings only. A larger swing is allowed toward the last message's VAD. Arousal strict, valence and dominance looser |
| Style profile | A `style` section in the stack. Bundled default is dialogue-heavy (the user's taste). The same detectors must serve description-heavy styles with different numbers |
| Narration ratio | A range: share of words outside dialogue. Fix prompts read the profile and push either way |
| Noise | A multiplier. Each reply draws its own target inside the range, and noise can push slightly past it. Seeded by message id so retries aim at the same value |
| Visualizer | Lorem ipsum filled to the drawn ratio, dialogue and narration as distinct blocks, with Reroll. Uses the same draw function as the pass. No model call |
| Stylized display | Detector, flow and dialogue fixes animate as `fresh` marks. Whole-reply passes diff with `changedRanges` so only changed spans animate |

## Stack shape

New fields on `PostStackConfig`. Names are provisional.

```ts
contextMessages: number          // default 4
flow: { enabled: boolean; sentenceDrift: number }    // drift as a fraction of sentence count
dialogue: { enabled: boolean }
detectors: Record<DetectorId, boolean>
style: {
  narrationRatio: [number, number]   // bundled: [0, 0.35]
  noise: number
  bodyBeatsPerReply: number          // bundled: 2
  staccatoRun: number                // bundled: 2
}
vad: { swing: number; towardLast: number }
```

## Files

- `core/agent/runAgent.ts`: context into rewrite prompts, escalation, then the new stages in order.
- `core/agent/flow/`: one file per detector plus a registry, the same layout as `lint/`.
- `core/agent/flowPass.ts`, `core/agent/dialoguePass.ts`: the two whole-reply calls and their accept checks.
- `core/quality/vad.ts`: `loadVad` (async) and `vadOf` (sync), replacing the arousal-only reader.
- `core/agent/styleDraw.ts`: the seeded ratio draw, shared by the pass and the visualizer.
- `core/agent/postStack.ts`: the new stack fields and their defaults; `runStages` passes them through.
- The post-processing module: style profile form and the visualizer.

## Phases

Each phase ends with `scripts/agent-test.sh --build` clean and a handoff for testing in the browser.

1. **Rewrite context.** `contextMessages` on the stack. Sentence and paragraph rewrites get the last
   N messages and neighbouring sentences. Check: the prompt carries the right messages.
2. **Detectors.** `core/agent/flow/` with repeated openers, filler beats, staccato runs, narration
   ratio and body-beat budget first. Fixes go through `tryRewrite`. Check per detector, starting
   with the reference example.
3. **Escalation.** A failed sentence gets one group rewrite. Check: it stops after one level.
4. **VAD data.** Valence and dominance in the build script and the loader.
5. **Flow pass.** The call, the sentence-count check, the VAD guard with the toward-last rule.
   Check: the guard table below.
6. **Dialogue pass.** The call and the commitment check.
7. **Style profile UI.** The form, noise, and the visualizer.
8. **Stylized display** for the new stages.
9. **Remaining detectors:** cross-paragraph repeats and flat rhythm. Seams skipped: the flow pass smooths every join already.

The user will feed replies from the live build between phases. Detector thresholds get tuned from
those, not guessed up front.

## VAD guard cases

| Case | Original | Rewrite | Result |
|---|---|---|---|
| Reference edit | heavy, valence ~0.35 | playful, ~0.6, toward the joke | pass |
| Softened grief | valence ~0.2 | ~0.45, away from a sad scene | block |
| Flattened anger | arousal ~0.8 | ~0.4 | block |
| Small smoothing | ~0.5 | ~0.55 | pass |

## Open

- Sentence-count drift default for the flow pass.
- Default swing and toward-last thresholds. Tune from real replies.
- How much the commitment check can catch before it gives false blocks.
- Lost detail: fixes can keep the event and drop the imagery ("Almost like a laugh but cracked down the
  middle" became "a rough laugh"). Prompts ask to keep every image for now; needs a real check.
