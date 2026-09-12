// Extension-ful imports on purpose: checkScore.ts runs this under `node --experimental-strip-types`.
import type { GrammarHammerRule } from '../hammer/rule.ts'
import { findFlags } from '../hammer/strip.ts'
import { sentences } from './sentences.ts'
import { findSlop, type LexiconEntry } from './lexicon.ts'
import { normalizeWords, proseSegments, type Census } from './census.ts'

/** What each signal is worth. Every one can be set to 0, which is how a user turns it off. */
export interface QualityWeights {
  slop: number
  census: number
  selfRepeat: number
  flags: number
  /** The one credit. Subtracted rather than added. */
  variety: number
}

export const defaultWeights: QualityWeights = {
  slop: 1,
  census: 1.5,
  selfRepeat: 1,
  flags: 0.5,
  variety: 1,
}

export interface ScoreContext {
  census: Census
  lexicon: LexiconEntry[]
  rules: GrammarHammerRule[]
  role: 'user' | 'assistant'
}

export interface QualityScore {
  /** Lower is better. Penalties minus the variety credit. */
  total: number
  parts: Record<keyof QualityWeights, number>
}

/** Sentence-length spread past this is as varied as prose gets; more is noise, not craft. */
const VARIETY_CAP = 10

/** Self-repetition is measured on 4-grams: three words repeat innocently, four rarely do. */
const SELF_N = 4

/**
 * Measure a passage. Lower is better.
 *
 * Everything here already existed as a detector; what is new is turning the findings into
 * one comparable number so an original and a rewrite can be put side by side. That comparison is
 * the whole fix for a bare rewrite: a local model handed a clean paragraph will sometimes hand back a
 * worse one, and until now nothing measured the difference.
 *
 * Every part is per 100 words. Without that a rewrite could win by being shorter, which is the one
 * way of gaming a quality score that a length guard alone does not already catch.
 */
export function scoreText(
  text: string,
  ctx: ScoreContext,
  weights: QualityWeights = defaultWeights,
): QualityScore {
  const zero: Record<keyof QualityWeights, number> = {
    slop: 0, census: 0, selfRepeat: 0, flags: 0, variety: 0,
  }
  const words = normalizeWords(text)
  if (words.length < 5) return { total: 0, parts: zero }
  const per100 = 100 / words.length

  const parts = { ...zero }
  // Weighted by how loud each phrase is, so one "delve" costs more than one "swallowed hard".
  parts.slop = findSlop(text, ctx.lexicon).reduce((n, h) => n + h.weight, 0) * per100
  parts.census = countCensusHits(text, ctx.census) * per100
  parts.selfRepeat = countSelfRepeats(text) * per100
  parts.flags = findFlags(text, ctx.rules, ctx.role).length * per100
  parts.variety = varietyCredit(text)

  const total =
    parts.slop * weights.slop +
    parts.census * weights.census +
    parts.selfRepeat * weights.selfRepeat +
    parts.flags * weights.flags -
    parts.variety * weights.variety

  return { total, parts }
}

/**
 * Phrases this text shares with the chat's census, counted once each.
 *
 * Longest first with the matched span consumed, so a six-word repeat is one hit rather than one for
 * every window inside it.
 */
export function countCensusHits(text: string, census: Census): number {
  if (!census.entries.length) return 0
  let hits = 0
  for (const segment of proseSegments(text)) {
    const words = normalizeWords(segment)
    let i = 0
    while (i < words.length) {
      let matched = 0
      for (let n = 6; n >= 3; n--) {
        if (i + n > words.length) continue
        if (census.has(words.slice(i, i + n).join(' '))) {
          matched = n
          break
        }
      }
      if (matched) {
        hits += 1
        i += matched
      } else i += 1
    }
  }
  return hits
}

/** 4-grams the passage repeats against itself. Each extra occurrence counts once. */
export function countSelfRepeats(text: string): number {
  const counts = new Map<string, number>()
  for (const segment of proseSegments(text)) {
    const words = normalizeWords(segment)
    for (let i = 0; i + SELF_N <= words.length; i++) {
      const key = words.slice(i, i + SELF_N).join(' ')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let extra = 0
  for (const c of counts.values()) if (c > 1) extra += c - 1
  return extra
}

/**
 * Sentence-length spread, scaled to roughly the same size as one penalty per 100 words.
 *
 * A credit rather than a penalty because flat rhythm is not an error you can point at, it is the
 * absence of something. The cap matters: without it a passage with one sixty-word sentence among
 * five short ones would score as maximally varied, and that distribution is bimodal rather than
 * varied. The cap is the whole defence against it now that nothing counts run-on sentences.
 */
export function varietyCredit(text: string): number {
  const lengths = sentences(text).map((s) => (s.text.match(/[\p{L}\p{N}']+/gu) ?? []).length)
  if (lengths.length < 3) return 0
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  if (!mean) return 0
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length
  return Math.min(Math.sqrt(variance), VARIETY_CAP) / VARIETY_CAP
}
