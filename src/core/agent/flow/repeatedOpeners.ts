// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { FlowHit, FlowRule } from '../flowRules.ts'
import { narrationWords } from './words.ts'

const window = 4
const repeats = 3

// "He looked down. He shook his head. He shifted his weight." Narration that opens the same way
// sentence after sentence reads like stage directions. A sentence that opens with speech is skipped: `"You still can," he said.`
// is a tag, and tags are meant to repeat.
// Only the sentence that tips a window over is flagged, so the fix stays one sentence wide rather
// than swallowing every paragraph the run crosses.
export const repeatedOpeners: FlowRule = {
  id: 'repeated-openers',
  label: 'Repeated openers',
  description: `Flags the sentence that makes ${repeats} narration sentences in any ${window} start with the same word.`,
  check(text, { sents, quoted }) {
    const keyed = sents.flatMap((s) => {
      if (/^["“]/.test(s.text)) return []
      const key = narrationWords(text, s.start, s.end, quoted)[0]?.toLowerCase()
      return key ? [{ s, key }] : []
    })
    const hits: FlowHit[] = []
    keyed.forEach(({ s, key }, i) => {
      const same = keyed.slice(Math.max(0, i - window + 1), i + 1).filter((k) => k.key === key).length
      if (same < repeats) return
      hits.push({
        ruleId: this.id,
        start: s.start,
        end: s.end,
        note: `Too many sentences nearby start with "${key}". Open this one differently.`,
      })
    })
    return hits
  },
}
