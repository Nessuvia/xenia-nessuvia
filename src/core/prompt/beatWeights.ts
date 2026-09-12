// Beat weights, and the Chapter word target divided by them. Pure: checkBeatWeights.ts runs
// it under `node --experimental-strip-types`.
//
// Extension-ful imports on purpose, for the same reason.
import type { BeatWeight, Block, Chapter } from '../storage/types.ts'

/** Every weight, shortest first. The order the UI draws them in. */
export const beatWeights: BeatWeight[] = ['sketch', 'brief', 'normal', 'long', 'major']

/** The default a new beat gets, and what an unrecognised value falls back to. */
export const defaultWeight: BeatWeight = 'normal'

/**
 * How much of the Chapter each weight claims, relative to `normal`. The spread is wide on purpose:
 * a sketch and a major scene in the same chapter should not read as the same size of thing. These
 * are ratios, never word counts. The words come from the Chapter's target.
 */
export const weightMultiplier: Record<BeatWeight, number> = {
  sketch: 0.35,
  brief: 0.65,
  normal: 1,
  long: 1.5,
  major: 2.3,
}

/** What the Author reads on the control. One word each: the multiplier is not their problem. */
export const weightLabel: Record<BeatWeight, string> = {
  sketch: 'Sketch',
  brief: 'Brief',
  normal: 'Normal',
  long: 'Long',
  major: 'Major',
}

/** A weight off untrusted input (a model reply, a pasted bulk list). Anything unrecognised, in any
 *  casing, becomes the default rather than throwing: a bad weight is not worth losing a beat over. */
export function asWeight(value: unknown): BeatWeight {
  if (typeof value !== 'string') return defaultWeight
  const key = value.trim().toLowerCase()
  return (beatWeights as string[]).includes(key) ? (key as BeatWeight) : defaultWeight
}

/**
 * A Chapter's word target divided across its beats by weight.
 *
 * Whole words, and the parts add back up to `total` exactly. The rounding is done by running sum:
 * each beat gets the difference between its own cumulative share and the previous one. No
 * remainder is lost or invented. The Plot Layout displays both the chapter target and the beat
 * totals, and they must match.
 *
 * `total` of 0 (unset) gives zeroes, which is what an unset beat target means downstream.
 */
export function splitByWeight(total: number, weights: BeatWeight[]): number[] {
  if (weights.length === 0) return []
  if (total <= 0) return new Array(weights.length).fill(0)

  const shares = weights.map((w) => weightMultiplier[w] ?? weightMultiplier[defaultWeight])
  const sum = shares.reduce((a, b) => a + b, 0)
  if (sum <= 0) return new Array(weights.length).fill(0)

  const out: number[] = []
  let running = 0
  let taken = 0
  for (const share of shares) {
    running += share
    const upTo = Math.round((total * running) / sum)
    out.push(upTo - taken)
    taken = upTo
  }
  return out
}

/** The same split, read off a Chapter: one target per Block, in `blocks` order. */
export function beatTargets(chapter: Pick<Chapter, 'targetWords' | 'blocks'>): number[] {
  return splitByWeight(chapter.targetWords, chapter.blocks.map((b) => b.weight))
}

/** One Block's derived word target, or 0 when the Chapter has no target set. */
export function beatTarget(chapter: Pick<Chapter, 'targetWords' | 'blocks'>, block: Block): number {
  const at = chapter.blocks.findIndex((b) => b.id === block.id)
  return at === -1 ? 0 : beatTargets(chapter)[at]
}
