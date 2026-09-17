// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { FlowRule } from '../flowRules.ts'
import { beatMaxWords, isBeat, narrationNeighbour } from './words.ts'

// Brows, jaw, throat, a nod, a shrug: each fine alone, a body inventory together. Past the stack's
// budget, every further beat is flagged, with the narration sentence before it when there's one.
export const bodyBeats: FlowRule = {
  id: 'body-beats',
  label: 'Body beat budget',
  description: `Flags narration sentences of ${beatMaxWords} words or fewer about body parts or small movements, past the per-reply budget.`,
  check(text, { sents, quoted, style }) {
    const beats = sents.flatMap((s, i) => (isBeat(text, s, quoted) ? [{ s, i }] : []))
    return beats.slice(Math.max(0, style.bodyBeatsPerReply)).map(({ s, i }) => ({
      ruleId: this.id,
      start: narrationNeighbour(text, sents, i - 1, quoted)?.start ?? s.start,
      end: s.end,
      note: `Too many body beats (${beats.length}, budget ${style.bodyBeatsPerReply}). Cut this one or fold it into the sentence before.`,
    }))
  },
}
