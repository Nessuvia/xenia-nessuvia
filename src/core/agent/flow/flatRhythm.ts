// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { FlowHit, FlowRule } from '../flowRules.ts'
import { wordCount } from './words.ts'

const runLength = 4
const spread = 3
/** Shorter sentences are the staccato detector's. */
const minWords = 5

// Four sentences in a row all within a few words of each other: "He sat down on the mat. She looked at
// the photo again. He waited for her to speak. The light hummed above them." Each is fine; the run
// drones. Flags the longest such run once.
export const flatRhythm: FlowRule = {
  id: 'flat-rhythm',
  label: 'Flat rhythm',
  description: `Flags ${runLength} or more sentences in a row whose lengths sit within ${spread} words of each other.`,
  check(_text, { sents }) {
    const hits: FlowHit[] = []
    let from = 0
    while (from < sents.length) {
      let to = from
      let lo = wordCount(sents[from].text)
      let hi = lo
      if (lo >= minWords) {
        while (to + 1 < sents.length) {
          const n = wordCount(sents[to + 1].text)
          if (n < minWords || Math.max(hi, n) - Math.min(lo, n) > spread) break
          lo = Math.min(lo, n)
          hi = Math.max(hi, n)
          to++
        }
      }
      if (to - from + 1 >= runLength) {
        hits.push({
          ruleId: this.id,
          start: sents[from].start,
          end: sents[to].end,
          note: `${to - from + 1} sentences in a row of about the same length. Vary them: join two, or cut one short. Keep every detail.`,
        })
      }
      from = to + 1
    }
    return hits
  },
}
