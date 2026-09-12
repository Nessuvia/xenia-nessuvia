// Extension-ful imports on purpose: checkLengthGuard.ts runs this under
// `node --experimental-strip-types`.
import type { ScoreStage } from './pipeline.ts'

/**
 * Whether a rewrite may replace the reply. Returns null when it may, otherwise the reason, which
 * the caller stores on the message and the bubble shows.
 *
 * Character length, not tokens. A token count needs `loadTokenizer`, which is async, and this runs
 * in the middle of deciding what to store.
 */
export function lengthGuard(
  original: string,
  rewrite: string,
  { minRatio, maxRatio }: Pick<ScoreStage['config'], 'minRatio' | 'maxRatio'>,
): string | null {
  const after = rewrite.trim().length
  if (!after) return 'The rewrite came back empty.'

  const before = original.trim().length
  // Nothing to measure against. A reply that was whitespace is not a reply worth protecting, and
  // dividing by it would make every rewrite infinitely long.
  if (!before) return null

  const ratio = after / before
  const pct = Math.round(ratio * 100)
  if (ratio < minRatio) {
    return `The rewrite was ${pct}% of the original, under the ${Math.round(minRatio * 100)}% floor.`
  }
  if (ratio > maxRatio) {
    return `The rewrite was ${pct}% of the original, over the ${Math.round(maxRatio * 100)}% ceiling.`
  }
  return null
}
