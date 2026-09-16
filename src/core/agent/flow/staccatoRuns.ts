// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { sentences } from '../../quality/sentences.ts'
import type { FlowHit, FlowRule } from '../flowRules.ts'
import { wordCount } from './words.ts'

const maxWords = 3

// "If you want. Anytime." Fragments in a row. The reply splitter never splits inside a quote, so
// this one blanks the quote marks first and splits again: speech is where the tic lives.
export const staccatoRuns: FlowRule = {
  id: 'staccato-runs',
  label: 'Staccato runs',
  description: `Flags sentences of ${maxWords} words or fewer in a row, dialogue included.`,
  check(text, { style }) {
    const pieces = sentences(text.replace(/["“”]/g, ' '))
    const hits: FlowHit[] = []
    let run: typeof pieces = []
    const close = () => {
      if (run.length >= Math.max(2, style.staccatoRun)) {
        hits.push({
          ruleId: this.id,
          start: run[0].start,
          end: run.at(-1)!.end,
          note: `${run.length} fragments in a row. Join them into fuller sentences. Keep what is said and every image and detail.`,
        })
      }
      run = []
    }
    for (const p of pieces) {
      if (wordCount(p.text) <= maxWords) run.push(p)
      else close()
    }
    close()
    return hits
  },
}
