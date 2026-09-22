// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { LintHit, LintProfile, LintRule } from '../lintRules.ts'
import { inRanges } from '../../quality/temperature.ts'

/**
 * Hedges cannot go in the lexicon, which is why this exists.
 *
 * "She almost smiled." deleted becomes "She smiled." and the meaning reverses with nothing about
 * the output looking wrong. One hedge is prose and four in a paragraph is a tic, so this counts
 * them and cuts only the excess. The same shape as `intensifierBudget`, which holds the amplifiers.
 */
export const hedges = new Set([
  'almost', 'barely', 'nearly', 'hardly', 'slightly', 'faintly', 'vaguely', 'mildly', 'apparently',
])

/**
 * The four that negate rather than soften. "almost warm" means not warm and "barely bright" means
 * not bright, so cutting one says the opposite of what was written even before an adjective, where
 * the others are only turning the dial down.
 *
 * They still count against the budget, because four hedges in a paragraph is the tic whichever they
 * are. They just cannot be the ones removed, so their presence pushes the softeners out instead.
 */
const negating = new Set(['almost', 'barely', 'nearly', 'hardly'])

/** Hedges allowed per 100 words of narration: `base` in cold narration, `base + slope` at full heat. */
// ponytail: matched to intensifierBudget's rates rather than fitted. Fit both on a real corpus.
const rates: Record<LintProfile, { base: number; slope: number }> = {
  fiction: { base: 1, slope: 4 },
  fanfic: { base: 2, slope: 6 },
}

/** A hedge after one of these is part of the construction, not decoration: "not quite", "could barely". */
const negators = /^(?:not|never|would|could|can|had|has|have)$|n't$|'d$/i

export const hedgeBudget: LintRule = {
  id: 'hedge-budget',
  label: 'Hedge budget',
  description: 'Removes hedges (almost, barely, faintly) in narration past a limit set by how heated the paragraph is.',
  check(para, { tokens, quoted, temperature, profile }) {
    // Dialogue is the character's voice: it neither spends the budget nor gets cut.
    const found = tokens
      .map((t, i) => [t, i] as const)
      .filter(([t]) => hedges.has(t.text.toLowerCase()) && !inRanges(quoted, t.start))
    const words = (para.match(/[A-Za-z']+/g) ?? []).length
    const { base, slope } = rates[profile]
    let excess = found.length - Math.floor((words * (base + slope * temperature)) / 100)
    if (excess <= 0) return []

    const hits: LintHit[] = []
    // From the end backwards, like the intensifier budget. The last one in a paragraph is the most
    // likely to be padding rather than the one doing the work.
    for (const [t, i] of [...found].reverse()) {
      if (excess <= 0) break
      if (negating.has(t.text.toLowerCase())) continue
      const prev = tokens[i - 1]
      const next = tokens[i + 1]
      if (!next || next.sentenceIndex !== t.sentenceIndex) continue
      const gap = para.slice(t.end, next.start)
      // Never at a sentence opener: "Apparently, he had left" loses its whole footing without it.
      if (!prev || prev.sentenceIndex !== t.sentenceIndex) continue
      if (negators.test(prev.text) || gap !== ' ') continue
      // A pre-modifier only. "almost gentle" goes; "almost smiled" must not, because cutting it
      // says the opposite of what was written. A past participle reads as both ("barely made"), so
      // any verb reading at all disqualifies the word: the cost of a miss here is a reversed
      // sentence, and the cost of skipping one is a hedge that stays.
      if (!next.pos.some((p) => p === 'adj' || p === 'adv') || next.pos.includes('verb')) continue
      hits.push({ ruleId: this.id, start: t.start, end: next.start, replacement: '', note: `Over budget: "${t.text}"` })
      excess--
    }
    return hits
  },
}
