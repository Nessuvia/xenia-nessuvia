// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { LintHit, LintRule } from '../lintRules.ts'
import { inRanges } from '../../quality/temperature.ts'
import { intensifiers } from './intensifierBudget.ts'

// Degree adverbs that sit fine after a verb, or read wrong moved in front of one.
const manner = new Set(['quite', 'rather', 'somewhat', 'fairly', 'deeply'])
const auxiliaries = /^(?:am|is|are|was|were|be|been|being|do|does|did|have|has|had)$/i

/**
 * "changed completely." becomes "completely changed.". Only when the adverb ends its clause, the
 * verb isn't the sentence's first word, and nothing is quoted: a skipped hit costs less than a
 * damaged line.
 */
export const adverbPlacement: LintRule = {
  id: 'adverb-placement',
  label: 'Adverb placement',
  description: 'Moves an intensifier that ends a clause in front of its verb: "changed completely" to "completely changed".',
  check(para, { tokens, quoted }) {
    const hits: LintHit[] = []
    for (let i = 1; i < tokens.length; i++) {
      const verb = tokens[i - 1]
      const adv = tokens[i]
      const before = tokens[i - 2]
      if (!intensifiers.has(adv.text.toLowerCase()) || manner.has(adv.text.toLowerCase())) continue
      if (!verb.pos.includes('verb') || verb.pos.includes('noun') || auxiliaries.test(verb.text)) continue
      if (!before || before.sentenceIndex !== verb.sentenceIndex || /^(?:not|never)$|n't$/i.test(before.text)) continue
      if (verb.sentenceIndex !== adv.sentenceIndex || para.slice(verb.end, adv.start) !== ' ') continue
      if (!/^(?:[,.;:!?]|$)/.test(para.slice(adv.end))) continue
      if (inRanges(quoted, verb.start)) continue
      hits.push({
        ruleId: this.id,
        start: verb.start,
        end: adv.end,
        replacement: `${adv.text} ${verb.text}`,
        note: `"${verb.text} ${adv.text}" to "${adv.text} ${verb.text}"`,
      })
    }
    return hits
  },
}
