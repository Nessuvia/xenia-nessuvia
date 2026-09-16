// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { FlowHit, FlowRule } from '../flowRules.ts'
import { isBeat, narrationNeighbour } from './words.ts'

const maxWords = 8

// "He shifted his weight on the rug." A short narration sentence about a small movement, there to
// pace the dialogue around it. The span takes a narration sentence either side so the fix can fold it in.
export const fillerBeats: FlowRule = {
  id: 'filler-beats',
  label: 'Filler beats',
  description: `Flags narration sentences of ${maxWords} words or fewer about a small movement (he shook his head).`,
  check(text, { sents, quoted }) {
    const hits: FlowHit[] = []
    sents.forEach((s, i) => {
      if (!isBeat(text, s, quoted, maxWords)) return
      hits.push({
        ruleId: this.id,
        start: narrationNeighbour(text, sents, i - 1, quoted)?.start ?? s.start,
        end: narrationNeighbour(text, sents, i + 1, quoted)?.end ?? s.end,
        note: `"${s.text}" is a filler beat. Fold it into a nearby sentence or cut it.`,
      })
    })
    return hits
  },
}
