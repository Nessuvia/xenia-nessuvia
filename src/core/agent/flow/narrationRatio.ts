// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { FlowRule } from '../flowRules.ts'
import { narrationWords, wordCount } from './words.ts'

const percent = (n: number) => `${Math.round(n * 100)}%`

// The share of words outside quoted speech, against the stack's range. One hit per reply, on the
// paragraph that moves the ratio most.
// ponytail: one paragraph per pass. A reply far outside the range needs several; loop if one isn't enough.
export const narrationRatio: FlowRule = {
  id: 'narration-ratio',
  label: 'Narration ratio',
  description: 'Flags a reply whose share of narration falls outside the style range, after noise slides it.',
  check(text, { quoted, style }) {
    // A reply with no speech is a scene with nobody talking. Pushing it toward dialogue would invent lines.
    if (!quoted.length) return []
    const total = wordCount(text)
    if (!total) return []
    const ratio = narrationWords(text, 0, text.length, quoted).length / total
    const [min, max] = style.narrationRatio
    if (ratio >= min && ratio <= max) return []
    const tooMuch = ratio > max

    let offset = 0
    const paras = text.split(/(\n\s*\n)/).flatMap((para, p) => {
      const start = offset
      offset += para.length
      if (p % 2 || !para.trim()) return []
      const narration = narrationWords(text, start, offset, quoted).length
      return [{ start, end: offset, score: tooMuch ? narration : wordCount(para) - narration }]
    })
    const target = paras.reduce((best, p) => (p.score > best.score ? p : best))
    const lead = text.slice(target.start).length - text.slice(target.start).trimStart().length
    return [
      {
        ruleId: this.id,
        start: target.start + lead,
        end: target.start + text.slice(target.start, target.end).trimEnd().length,
        note: tooMuch
          ? `Narration is ${percent(ratio)} of the reply, above ${percent(max)}. Trim narration here and let the dialogue carry it.`
          : `Narration is ${percent(ratio)} of the reply, below ${percent(min)}. Add a little narration here around the dialogue.`,
      },
    ]
  },
}
