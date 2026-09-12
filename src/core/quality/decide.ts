// Extension-ful imports on purpose: checkDecide.ts runs this under `node --experimental-strip-types`.
import { splitChunks, alignChunks, type Chunk } from './chunks.ts'
import { checkInvariants, defaultInvariants, type InvariantOptions } from './invariants.ts'
import { scoreText, defaultWeights, type QualityScore, type QualityWeights, type ScoreContext } from './score.ts'

export interface QualitySettings {
  /** The whole feature. Off means the rewrite is taken as it comes, which is how a rewrite behaves with nothing judging it
   *  before any of this existed. */
  enabled: boolean
  weights: QualityWeights
  invariants: InvariantOptions
  /** How much better a rewritten chunk has to score before it replaces the original. 0 means a tie
   *  keeps the original, which is the intended default: the incumbent is what the user already
   *  read. */
  minImprovement: number
}

export const defaultQuality: QualitySettings = {
  enabled: true,
  weights: defaultWeights,
  invariants: defaultInvariants,
  minImprovement: 0,
}

export interface ChunkDecision {
  kept: 'original' | 'rewrite'
  /** Why the original was kept. Absent when the rewrite won. */
  reason?: string
  before: QualityScore
  after: QualityScore
}

export interface QualityVerdict {
  /** The assembled passage: rewritten chunks where they won, original chunks everywhere else. */
  text: string
  decisions: ChunkDecision[]
  /** How many chunks the rewrite actually replaced. */
  changed: number
}

const EMPTY_SCORE: QualityScore = {
  total: 0,
  parts: { slop: 0, census: 0, selfRepeat: 0, flags: 0, variety: 0 },
}

/**
 * Decide, chunk by chunk, how much of a rewrite to keep.
 *
 * This is the fix for the thing a bare rewrite gets wrong. A second model was handed a finished reply and
 * whatever it returned became the message, checked only for length, and the rewrite is
 * stored: the first model then read it back as its own past voice. A local model that repeats stock
 * phrasing was teaching the chat to repeat it.
 *
 * Whole-message accept would be the easy answer and the wrong one: a rewrite is usually good in
 * three paragraphs and bad in the fourth, and rejecting all four throws away the point of the pass.
 * The decision is per chunk instead, with the original always available as the fallback. The
 * reassembly uses the original's own separators: nothing about the passage's shape depends on
 * what the rewrite did with whitespace.
 */
export function decideRewrite(
  original: string,
  rewrite: string,
  ctx: ScoreContext,
  settings: QualitySettings = defaultQuality,
): QualityVerdict {
  if (!settings.enabled) {
    return { text: rewrite, decisions: [], changed: 1 }
  }

  const before = splitChunks(original)
  const after = splitChunks(rewrite)
  // Nothing to decide about. The caller's whole-message length guard has already rejected an empty
  // rewrite: this is a passage with no prose in it either way.
  if (!before.length) return { text: original, decisions: [], changed: 0 }

  const decisions: ChunkDecision[] = []
  let out = ''
  let cursor = 0
  let changed = 0

  for (const alignment of alignChunks(before, after)) {
    const from = alignment.from
    const start = from[0].start
    const end = from[from.length - 1].end
    // The gap between chunks, verbatim: paragraph breaks come from the original, not the rewrite.
    out += original.slice(cursor, start)
    cursor = end

    const originalText = original.slice(start, end)
    const decision = decide(alignment, originalText, ctx, settings)
    decisions.push(decision)
    if (decision.kept === 'rewrite' && alignment.kind === 'pair') {
      out += joinChunks(alignment.to)
      changed += 1
    } else {
      out += originalText
    }
  }
  out += original.slice(cursor)

  return { text: out, decisions, changed }
}

function decide(
  alignment: ReturnType<typeof alignChunks>[number],
  originalText: string,
  ctx: ScoreContext,
  settings: QualitySettings,
): ChunkDecision {
  if (alignment.kind === 'unmatched') {
    return {
      kept: 'original',
      reason: 'No matching passage in the rewrite.',
      before: EMPTY_SCORE,
      after: EMPTY_SCORE,
    }
  }

  const rewriteText = joinChunks(alignment.to)

  // The one invariant that needs the alignment rather than the two texts: a split or a merge is
  // only visible from here.
  if (settings.invariants.paragraphCount && (alignment.from.length !== 1 || alignment.to.length !== 1)) {
    return {
      kept: 'original',
      reason: 'The rewrite changed the paragraph breaks.',
      before: EMPTY_SCORE,
      after: EMPTY_SCORE,
    }
  }

  const violations = checkInvariants(originalText, rewriteText, settings.invariants)
  if (violations.length) {
    return { kept: 'original', reason: violations[0].detail, before: EMPTY_SCORE, after: EMPTY_SCORE }
  }

  const before = scoreText(originalText, ctx, settings.weights)
  const after = scoreText(rewriteText, ctx, settings.weights)
  if (after.total < before.total - settings.minImprovement) {
    return { kept: 'rewrite', before, after }
  }
  return {
    kept: 'original',
    reason: 'The rewrite did not score better than the original.',
    before,
    after,
  }
}

function joinChunks(chunks: Chunk[]): string {
  return chunks.map((c) => c.text).join('\n\n')
}

/** A one-line summary for the message record and the bubble's title text. */
export function verdictSummary(verdict: QualityVerdict): string {
  const total = verdict.decisions.length
  if (!total) return ''
  if (verdict.changed === total) return `Rewrote all ${total} passages.`
  if (!verdict.changed) return `Changed nothing: no passage scored better.`
  return `Rewrote ${verdict.changed} of ${total} passages; the rest kept the original.`
}
