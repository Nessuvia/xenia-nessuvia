// Extension-ful imports on purpose: check scripts run this under `node --experimental-strip-types`.

/**
 * Relative weights for the first letter of a sentence in English narrative prose. Pronouns and
 * articles put T, H, S, I and A on top. X, Z and Q sit near zero: a model asked for one writes
 * something strained.
 *
 * ponytail: hand-estimated, not measured from a corpus. Replace with counts from real replies if the
 * letters feel off.
 */
export const letterWeights: Record<string, number> = {
  T: 16, H: 10, S: 9, I: 7, A: 6, W: 6, B: 4, M: 3, O: 3, N: 3, C: 3, F: 3,
  E: 2, D: 2, L: 2, P: 2, R: 2, G: 1.5, Y: 1.5, U: 1, J: 0.5, K: 0.5, V: 0.5,
  Q: 0.05, Z: 0.05, X: 0.02,
}

/** A weighted letter, never `exclude`. `rand` returns [0, 1). */
export function pickLetter(rand: () => number, exclude?: string): string {
  const entries = Object.entries(letterWeights).filter(([letter]) => letter !== exclude)
  const total = entries.reduce((n, [, w]) => n + w, 0)
  let at = rand() * total
  for (const [letter, weight] of entries) {
    at -= weight
    if (at < 0) return letter
  }
  return entries[entries.length - 1][0]
}
