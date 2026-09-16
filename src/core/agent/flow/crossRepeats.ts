// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { FlowHit, FlowRule } from '../flowRules.ts'

const stopwords = new Set(
  'a an the and or but so of to in on at by for with from up down out over into onto off about as than then that this these those it its he him his she her hers they them their i me my you your we us our was were is are be been had has have do did does not no just still what when where who how if there here like too very'.split(' '),
)

const phraseLength = 3
const minContentWords = 2

// "the shoulders that filled the sleeves" twice in one reply. A three-word phrase, carrying at least two
// words that aren't filler, that shows up again in a later paragraph. The later sentence is flagged,
// once per phrase. Repeats inside one paragraph are left alone: that's rhythm, sometimes on purpose.
// ponytail: exact word matches. "filled the sleeves" and "filling his sleeves" don't pair; stem if the misses matter.
export const crossRepeats: FlowRule = {
  id: 'cross-repeats',
  label: 'Cross-paragraph repeats',
  description: 'Flags a sentence that repeats a three-word phrase from an earlier paragraph.',
  check(text, { sents }) {
    const paragraphOf = (at: number) => text.slice(0, at).split(/\n\s*\n/).length
    const seen = new Map<string, number>()
    const hits: FlowHit[] = []
    for (const s of sents) {
      const para = paragraphOf(s.start)
      const words = s.text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu) ?? []
      let flagged = false
      for (let i = 0; i + phraseLength <= words.length; i++) {
        const gram = words.slice(i, i + phraseLength)
        if (gram.filter((w) => !stopwords.has(w)).length < minContentWords) continue
        const key = gram.join(' ')
        const first = seen.get(key)
        if (first === undefined) seen.set(key, para)
        else if (first < para && !flagged) {
          hits.push({ ruleId: this.id, start: s.start, end: s.end, note: `Repeats "${key}" from earlier in the reply. Say it differently or cut it.` })
          flagged = true
        }
      }
    }
    return hits
  },
}
