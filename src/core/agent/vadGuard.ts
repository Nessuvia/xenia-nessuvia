// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { textVad, type Vad } from '../quality/vad.ts'

/** How far a whole-reply rewrite may move the reply's mean VAD. Per stack. */
export interface VadLimits {
  /** Largest change allowed on valence and dominance. Arousal gets two thirds of it. */
  swing: number
  /** Extra room on an axis when the change moves toward the last message's score on that axis. */
  towardLast: number
}

export const defaultVadLimits: VadLimits = { swing: 0.12, towardLast: 0.12 }

const axes: (keyof Vad)[] = ['v', 'a', 'd']

/**
 * Whether a rewrite keeps the reply's feeling. Blocks large swings only. A reply that answers a joke
 * with gloom may lighten toward the joke; the same lift in a sad scene is blocked. Arousal is held
 * tighter than the other two: flattening a shouting match is the failure that reads worst.
 */
// ponytail: word means from a unigram lexicon. Negation ("not happy") and sarcasm score wrong. The
// defaults are a first guess; tune from live replies.
export function vadAllows(before: Vad, after: Vad, last: Vad | undefined, limits: VadLimits): boolean {
  return axes.every((axis) => {
    const limit = limits.swing * (axis === 'a' ? 2 / 3 : 1)
    const toward = last !== undefined && Math.abs(after[axis] - last[axis]) < Math.abs(before[axis] - last[axis])
    return Math.abs(after[axis] - before[axis]) <= limit + (toward ? limits.towardLast : 0)
  })
}

/** `vadAllows` over texts. Passes when either side has no known words or the lexicon isn't loaded. */
export function textVadAllows(before: string, after: string, last: string | undefined, limits: VadLimits): boolean {
  const b = textVad(before)
  const a = textVad(after)
  if (!b || !a) return true
  return vadAllows(b, a, last ? textVad(last) : undefined, limits)
}
