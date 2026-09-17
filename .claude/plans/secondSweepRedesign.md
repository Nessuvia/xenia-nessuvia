# Second Sweep redesign

Two phases. Phase 1 merges the grammar hammer and free-text rules into one rule type with one
editor. Phase 2 replaces the Second Sweep settings wall with a vertical node diagram plus an
inspector rail.

Confirmed by the user across five question rounds. Everything below reflects those answers.

## The loop this is built around

> I don't like this pattern → send to Slop-dentifier → add rules to pipeline → back to the chat,
> swipe for a new reply or run the second sweep on the original.

That's the whole product. Every decision below serves it. Today the loop breaks at step three:
"add a rule to the pipeline" forces a choice between two rule types living behind two different
tabs, with different fields and different powers, and nothing in the UI says which one you want.

## The problem

`SecondSweepPanel.tsx` is 649 lines carrying a library list and five sub-tabs (Setup, Stages,
Checks, Rules, Hammer) in one file. A pipeline's actual shape, an ordered list of stages a reply
flows through, is invisible. You read forms and infer the flow.

Three things are wrong at once: two rule systems where the user thinks in one, a page that's an
undifferentiated wall, and a structure that's never drawn.

## Read before starting

- `.claude/cssConventions.md`. Phase 2 writes a new stylesheet.
- `CLAUDE.md` sections Seams, Specificity, UI copy, Verifying work.

---

# Phase 1: merge the two rule types

Nothing is lost. POS matching, quantifiers, capture-group replacement and the sentence-boundary
guard all survive. What goes is the second concept, the second editor and the second tab.

## What exists

Two types with overlapping jobs, both on `Pipeline.detect`:

```ts
interface DetectSettings {
  rules: GrammarHammerRule[]   // POS patterns, can strip/replace/flag
  textRules: TextRule[]        // literal or regex, can only flag
  punctuation: PunctuationSettings
}
```

They already agree on `id`, `enabled`, `label`, `scope`, `caseSensitive`. They differ on how the
match is expressed and what happens to a match. That's a match mode and an action, not two types.

## The merged rule

One type, `Rule`, in `core/secondSweep/rules.ts`:

```ts
export interface Rule {
  id: string
  enabled: boolean
  label?: string

  match: 'literal' | 'regex' | 'pattern'
  find: string                 // '' means a standing note, as TextRule has today
  caseSensitive: boolean
  scope: 'assistant' | 'user' | 'both'

  action: 'flag' | 'strip' | 'replace'
  replacement?: string         // action 'replace'; $0 and $1..$n in every mode
  note: string                 // action 'flag'
}
```

`DetectSettings.rules: Rule[]`. `textRules` goes away.

Three match modes, one dispatch:

- `literal`. The `find` string, regex-escaped. What most Slop-dentifier findings become.
- `regex`. `find` as a raw JS pattern. Invalid patterns compile to null and are skipped, as today.
- `pattern`. The hammer DSL: `with a [adj] [noun]`, `[word]`, `[adj]+`, `{n,m}`. Unchanged engine.

Three actions, now available to all three modes. This is the merge paying for itself: a literal
string could only ever flag before, and a POS pattern could only be edited through the Hammer tab.
Now `strip` works on a literal and `flag` works on a POS pattern.

| Action | What it does |
|---|---|
| `flag` | Leaves the text alone, hands the match to the editing model as a note |
| `strip` | Cuts the match, then `repairAfterCut` fixes spacing, punctuation, sentence-initial caps |
| `replace` | Swaps in `replacement`, then the same repair. `$0` is the whole match |

## Engine

`core/hammer` keeps doing what it does. `tagger.ts`, `pattern.ts`, `matcher.ts`, `exclusions.ts`,
`repair.ts` and their six check scripts are untouched. `compromise` stays.

`rule.ts` is deleted, its type absorbed into `rules.ts`.

`strip.ts` becomes mode-aware rather than pattern-only. It already runs rules as ordered passes with
sentinel substitution so a later rule can't see an earlier rule's output, capped at `MAX_PASSES`.
That ordering is the right behaviour for a merged list and it stays. The change is that finding the
spans for one rule now branches on `match`: pattern mode calls `findMatches` as today, literal and
regex mode run the compiled regex. Both paths already honour `computeExclusions`, so code fences,
URLs and inline code stay off limits in every mode.

`textRules.ts` is absorbed into `rules.ts` and deleted. `standingNotes` moves across intact.

Two semantics to settle, both called out in the code:

- **Match cap.** Text rules cap at 3 matches per rule, hammer rules don't. Keep the cap for
  `flag` (it exists to stop one rule drowning the editing model in notes) and leave `strip` and
  `replace` uncapped, since an unfixed match is the failure there.
- **Sentence boundaries.** A pattern-mode match can't cross a sentence. A regex can. That's a
  property of regex, not a bug, and the rules editor says so in one line next to the mode picker.

`collect.ts` collapses to a single `applyRules` call, replacing `stripText` + `findFlags` +
`findTextMatches` + `standingNotes`.

## Converting existing pipelines

`core/secondSweep/mergeRules.ts`, pure, with `checkMergeRules.ts`.

```ts
mergeRules(hammer: GrammarHammerRule[], text: TextRule[]): Rule[]
```

Every rule converts. Nothing is dropped.

- A `GrammarHammerRule` becomes `match: 'pattern'`, carrying `pattern` into `find` and keeping
  `action`, `replacement`, `scope`, `caseSensitive`, `label`.
- A `TextRule` becomes `match: rule.regex ? 'regex' : 'literal'` with `action: 'flag'`, carrying
  `find` and `note`.
- Order: hammer rules first, then text rules. That matches today's run order in `collect.ts`, so a
  converted pipeline behaves identically on the first run.

Where it runs:

- `resolvePipeline` in `pipeline.ts` already upgrades old records in place. Convert there, so
  anything read from Dexie comes back merged. No Dexie version bump: `detect` is a blob inside a
  row, not an index.
- `pipelineJson.ts` accepts both shapes on import. `oneHammerRule` and the text-rule branch become
  the legacy path feeding `oneRule`. Export writes the merged shape only.
- `legacy.ts` (the 0.0.42 converter) emits `Rule[]` directly.

Because nothing is dropped, there's no user-facing report. The conversion is silent.

## Call sites

| File | Change |
|---|---|
| `core/secondSweep/rules.ts` | New. `Rule`, `newRule`, `applyRules`, `standingNotes`, compile |
| `core/secondSweep/textRules.ts` | Absorbed, deleted |
| `core/secondSweep/detectSettings.ts` | `rules: Rule[]`, drop `textRules` |
| `core/secondSweep/collect.ts` | One `applyRules` call |
| `core/hammer/strip.ts` | Mode-aware span finding, `Rule` instead of `GrammarHammerRule` |
| `core/hammer/rule.ts` | Deleted |
| `core/quality/score.ts` | `findFlags` becomes the flag half of `applyRules` |
| `core/secondSweep/pipelineJson.ts` | Validate `Rule`, accept both legacy shapes |
| `core/secondSweep/legacy.ts` | Emit `Rule[]` |
| `modules/settings/GrammarHammerPanel.tsx` | Deleted |
| `modules/settings/TextRulesPanel.tsx` | Becomes `RulesPanel.tsx`. One list, with a mode picker per rule |
| `modules/settings/PassPreview.tsx` | `previewStrips` over `Rule` |
| `modules/slopdentifier/analyse.ts` | Findings stop splitting by source |
| `modules/slopdentifier/addRule.ts` | One target list. A phrase finding becomes a literal rule |

## The rule card

One card, growing only where the mode needs it:

```
[x] Label____________________  [literal ▾]  [flag ▾]        [trash]
    Find: ________________________________________
    Note: ________________________________________     (action: flag)
```

Mode `pattern` swaps the Find field for the pattern input with its live compile error, as the Hammer
tab has today. Action `replace` swaps Note for Replacement. `caseSensitive` and `scope` sit where
they already do.

Mode defaults to `literal`, which is what arrives from the Slop-dentifier.

## Phase 1 done when

`scripts/agent-test.sh` is clean, `npx pnpm build` passes, and a pipeline exported before the change
imports with every rule present and running the same way.

---

# Phase 2: the diagram editor

## Shape

Vertical stack of cards, top to bottom, connector line between each. Scales to a long pipeline,
works at the mobile breakpoint with no layout flip, needs no library.

Layout is `TwoColumn` from `/app`: diagram left, inspector right. Below the breakpoint the inspector
stacks under the diagram and the selected card scrolls into view.

```
┌─ Detectors ─────────────┐        ┌─ Inspector ──────────┐
│ 12 rules · 40 phrases   │        │                      │
│ punctuation on          │        │  fields for the      │
└───────────┬─────────────┘        │  selected node       │
            │ +                    │                      │
┌─ Gate ──────────────────┐ ←sel   │                      │
│ needs 2 notes           │        │                      │
└───────────┬─────────────┘        │                      │
            │ +                    │                      │
┌─ Clean ─────────────────┐        │                      │
│ local · skip when clean │        │                      │
└───────────┬─────────────┘        └──────────────────────┘
            │ +
┌─ Score ─────────────────┐
│ ratio 0.7 to 1.4        │
└─────────────────────────┘
```

## The source node

`detect`, `lexicon` and `census` are pipeline-wide inputs that every stage below reads. They're not
stages themselves, and today they own three of the five sub-tabs.

They become a fixed **Detectors** node pinned at the top of the chain. Not removable, not
reorderable, no enable toggle. Selecting it puts the merged rules list, the lexicon and the census
options in the inspector. This is honest about how it runs: one input feeding everything below.

It's also where the Slop-dentifier loop lands. One node, one list, one place a new rule appears.

`Pipeline.label` and `Pipeline.description` belong to the pipeline rather than any node, so they sit
in a header above the diagram.

## Node contents

Each stage card shows its kind, its label, an enable toggle, and a one-line summary from its config:

- gate: "needs N notes", plus "standing counts" when set
- clean: connection name, "skip when clean" when set
- rewrite: connection name, preset, "N turns of history"
- score: "ratio X to Y", plus the count of non-default weights

A disabled node renders dimmed with a dashed connector. It stays in place rather than jumping to the
end.

Cards carry a status-badge slot that renders nothing today. Runtime overlay is out of scope, and the
slot exists so wiring it later touches one component. It'd need `runPipeline` to return
per-stage results, which it doesn't: it returns a rolled-up `{ text, original, summary, failed }`.
Separate work.

## Interaction

- Click a card to select. Selection is local `useState`, not the URL.
- Drag to reorder with `useDragReorder`. Cards hold no input, so `itemProps` makes the whole card
  draggable. The Detectors node is outside the reorder range.
- A `+` on each connector opens a kind picker and inserts at that position. Also a `+` after the
  last node. `useCloseOnOutside` for the picker.
- Delete lives in the inspector, not on the card, so a misclick can't destroy a stage.

## Files

New `src/modules/settings/pipeline/`:

| File | Job |
|---|---|
| `PipelineEditor.tsx` | Mount point: header, `TwoColumn`, selection state |
| `PipelineDiagram.tsx` | The node list, reorder, connector inserts |
| `StageNode.tsx` | One card: kind, label, toggle, summary, badge slot |
| `SourceNode.tsx` | The Detectors card |
| `stageSummary.ts` | Pure: config to summary line, per kind. Gets `checkStageSummary.ts` |
| `StageInspector.tsx` | Switch on kind, render the right form |
| `GateForm.tsx`, `CleanForm.tsx`, `RewriteForm.tsx`, `ScoreForm.tsx` | The four stage forms |
| `DetectorsInspector.tsx` | Rules, lexicon, census, punctuation |
| `PipelineLibrary.tsx` | The list, create/clone/delete/import/export |
| `pipeline.css` | All of the above. Nothing shared with another tab |

Reused as-is: `RuleCardHead.tsx`, `RulesPanel.tsx` and `PassPreview.tsx` (inside
`DetectorsInspector`), `QualitySection.tsx` (inside `ScoreForm`), `ConnectionPicker`.

`SecondSweepPanel.tsx` shrinks to a thin mount: library or editor. The five sub-tabs go away.

## Library placement

The user asked for a proposal. Recommendation: **keep one tab, swap the view**.

`/settings#secondSweep` shows the library list. Opening a pipeline replaces the panel body with the
editor and a back link. No new route, no new tab, no deep link to a single pipeline: pipeline ids
are Dexie row numbers that differ between machines and wouldn't survive a backup restore. A second
tab would also split "pick a pipeline" from "edit a pipeline" across the tab bar, which reads worse
than a back link.

The per-chat override panel (`SecondSweepChatPanel.tsx`) is untouched.

## CSS notes

New `pipeline.css`, imported by `PipelineEditor.tsx`. Colors from the vars, spacing from the scale,
a class on every styled element, no new `z-index` beyond the ladder (the kind picker sits on the
existing dropdown rung). Connectors are a border on a pseudo-element, not SVG.

Pipeline-only classes currently in `settings.css` (`.passBody`, `.passPrompt`, `.passPromptInput`,
`.passSectionTitle`, `.passNumbers`, `.passNumber`, `.passNumberInput`) move to `pipeline.css`.
`.passRow` and `.passRowLabelInput` are shared with the lexicon and stay.

## Phase 2 done when

Build and checks are clean, and by eye: a pipeline's flow is readable without clicking, a stage can
be added between two others, reorder survives a reload, and the mobile breakpoint stacks without
overflow.

---

# Order of work

1. Phase 1 merge, with `checkMergeRules.ts` and updated `checkStrip.ts` / `checkTextRules.ts`.
2. Build and checks clean. Hand off for a browser pass.
3. Phase 2 diagram on the smaller surface.
4. Build and checks clean. Hand off.

Each phase is independently verifiable. Phase 1 ships a working app with no diagram. Phase 2 never
touches rule semantics.

# Docs

`CLAUDE.md` describes the grammar hammer as its own seam and names `detect/` structure that this
changes. Update the Seams section at the end of phase 1: one rule type, three match modes, the
pattern engine still in `core/hammer`.
