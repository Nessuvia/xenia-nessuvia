// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { LintHit, LintProfile, LintRule } from '../lintRules.ts'
import { inRanges } from '../../quality/temperature.ts'

export const intensifiers = new Set([
  'completely', 'entirely', 'genuinely', 'truly', 'utterly', 'absolutely', 'deeply', 'incredibly',
  'particularly', 'quite', 'rather', 'somewhat', 'fairly',
])

/** Intensifiers allowed per 100 words: `base` in cold narration, `base + slope` at full heat. */
// ponytail: guessed rates. Fit them on a real corpus when one is at hand.
const rates: Record<LintProfile, { base: number; slope: number }> = {
  fiction: { base: 1, slope: 4 },
  fanfic: { base: 2, slope: 6 },
}

const negators = /^(?:not|never|would|had|yours)$|n't$|'d$/i

export const intensifierBudget: LintRule = {
  id: 'intensifier-budget',
  label: 'Intensifier budget',
  description: 'Removes intensifiers (completely, truly, quite) past a limit set by how heated the paragraph is.',
  check(para, { tokens, quoted, temperature, profile }) {
    const found = tokens.map((t, i) => [t, i] as const).filter(([t]) => intensifiers.has(t.text.toLowerCase()))
    const words = (para.match(/[A-Za-z']+/g) ?? []).length
    const { base, slope } = rates[profile]
    const allowed = Math.max(1, Math.floor((words * (base + slope * temperature)) / 100))
    let excess = found.length - allowed
    if (excess <= 0) return []

    // Under-strip: only a pre-modifier ("quite a mess", "truly awful") outside quotes, never the
    // first in the paragraph, never at a sentence start or after a negator ("not quite", "I'd rather").
    const hits: LintHit[] = []
    // ponytail: removes from the end backwards. Picking the coldest sentences first is the upgrade.
    for (const [t, i] of found.slice(1).reverse()) {
      if (excess <= 0) break
      const prev = tokens[i - 1]
      const next = tokens[i + 1]
      if (!prev || prev.sentenceIndex !== t.sentenceIndex || negators.test(prev.text)) continue
      if (!next || next.sentenceIndex !== t.sentenceIndex || para.slice(t.end, next.start) !== ' ') continue
      if (!next.pos.some((p) => p === 'adj' || p === 'adv' || p === 'verb' || p === 'det')) continue
      if (inRanges(quoted, t.start)) continue
      hits.push({ ruleId: this.id, start: t.start, end: next.start, replacement: '', note: `Over budget: "${t.text}"` })
      excess--
    }
    return hits
  },
}
