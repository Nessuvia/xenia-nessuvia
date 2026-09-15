// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { LintHit, LintProfile, LintRule } from '../lintRules.ts'
import { inRanges } from '../../quality/temperature.ts'

export const intensifiers = new Set([
  'completely', 'entirely', 'genuinely', 'truly', 'utterly', 'absolutely', 'deeply', 'incredibly',
  'particularly', 'quite', 'rather', 'somewhat', 'fairly', 'honestly', 'really', 'actually', 'literally',
  'simply', 'clearly', 'undeniably', 'unmistakably', 'positively', 'thoroughly',
])

/** Intensifiers allowed per 100 words of narration: `base` in cold narration, `base + slope` at full heat. */
// ponytail: guessed rates. Fit them on a real corpus when one is at hand.
const rates: Record<LintProfile, { base: number; slope: number }> = {
  fiction: { base: 1, slope: 4 },
  fanfic: { base: 2, slope: 6 },
}

const negators = /^(?:not|never|would|had|yours)$|n't$|'d$/i

export const intensifierBudget: LintRule = {
  id: 'intensifier-budget',
  label: 'Intensifier budget',
  description: 'Removes intensifiers (genuinely, honestly, quite) in narration past a limit set by how heated the paragraph is.',
  check(para, { tokens, quoted, temperature, profile }) {
    // Dialogue is the character's voice: it neither spends the budget nor gets cut.
    const found = tokens
      .map((t, i) => [t, i] as const)
      .filter(([t]) => intensifiers.has(t.text.toLowerCase()) && !inRanges(quoted, t.start))
    const words = (para.match(/[A-Za-z']+/g) ?? []).length
    const { base, slope } = rates[profile]
    // No free intensifier: a 60-word cold paragraph allows none.
    let excess = found.length - Math.floor((words * (base + slope * temperature)) / 100)
    if (excess <= 0) return []

    const hits: LintHit[] = []
    // ponytail: removes from the end backwards. Picking the coldest sentences first is the upgrade.
    for (const [t, i] of [...found].reverse()) {
      if (excess <= 0) break
      const prev = tokens[i - 1]
      const next = tokens[i + 1]
      if (!next || next.sentenceIndex !== t.sentenceIndex) continue
      const gap = para.slice(t.end, next.start)
      if (!prev || prev.sentenceIndex !== t.sentenceIndex) {
        // Sentence opener: "Honestly, she had no idea." loses the word and the comma.
        if (gap !== ', ') continue
        const cap = para[next.start].toUpperCase()
        hits.push({ ruleId: this.id, start: t.start, end: next.start + 1, replacement: cap, note: `Over budget: "${t.text}"` })
      } else {
        // Pre-modifier only ("quite a mess", "truly awful"), never after a negator ("not quite", "I'd rather").
        if (negators.test(prev.text) || gap !== ' ') continue
        if (!next.pos.some((p) => p === 'adj' || p === 'adv' || p === 'verb' || p === 'det')) continue
        hits.push({ ruleId: this.id, start: t.start, end: next.start, replacement: '', note: `Over budget: "${t.text}"` })
      }
      excess--
    }
    return hits
  },
}
