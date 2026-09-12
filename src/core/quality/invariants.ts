// Extension-ful imports on purpose: checkInvariants.ts runs this under `node --experimental-strip-types`.
import nlp from 'compromise'
import { lengthGuard } from '../secondSweep/lengthGuard.ts'
import { normalizeWords, proseSegments } from './census.ts'

export type InvariantKind = 'properNoun' | 'dialogue' | 'lengthBand' | 'paragraphCount'

export interface Violation {
  kind: InvariantKind
  /** One sentence, shown to the user as the reason a chunk kept its original. */
  detail: string
}

export interface InvariantOptions {
  newProperNouns: boolean
  dialogue: boolean
  lengthBand: boolean
  /** Handled by `decide.ts`, which is the only place that can see the alignment. Carried here so
   *  every invariant toggle lives in one shape. */
  paragraphCount: boolean
  /** Per-chunk ratio band. Wider than the whole-message one in `lengthGuard`: a single paragraph
   *  varies far more than a whole reply does. */
  minRatio: number
  maxRatio: number
  /** Names the rewrite is allowed to use even though the chunk does not contain them: the
   *  character, the persona, other speakers in the chat, lorebook keys. */
  allowNames: string[]
}

export const defaultInvariants: InvariantOptions = {
  newProperNouns: true,
  dialogue: true,
  lengthBand: true,
  // Off by default. A rewrite that merges two paragraphs is often the improvement, and rejecting
  // every merge would throw away the best thing the pass does.
  paragraphCount: false,
  minRatio: 0.5,
  maxRatio: 2.5,
  allowNames: [],
}

/**
 * Hard rejections: things that are wrong whatever the prose score says.
 *
 * A score compares two passages and picks the better one. These are different. A rewrite that
 * invents a character, or puts words in someone's mouth, is not a worse version of the paragraph,
 * it is a different paragraph, and no score should be allowed to accept it.
 *
 * Runs per aligned chunk pair, so a violation costs one paragraph rather than the whole reply.
 */
export function checkInvariants(
  before: string,
  after: string,
  opts: InvariantOptions = defaultInvariants,
): Violation[] {
  const out: Violation[] = []

  if (opts.lengthBand) {
    const rejected = lengthGuard(before, after, opts)
    if (rejected) out.push({ kind: 'lengthBand', detail: rejected })
  }

  if (opts.newProperNouns) {
    const known = new Set<string>()
    for (const n of properNouns(before)) known.add(n)
    for (const name of opts.allowNames) {
      for (const word of normalizeWords(name)) known.add(word)
    }
    const invented = new Map<string, string>()
    for (const term of properNounTerms(after)) {
      if (!known.has(term.key)) invented.set(term.key, term.text)
    }
    if (invented.size) {
      const names = [...invented.values()].map((n) => `"${n}"`).join(', ')
      out.push({
        kind: 'properNoun',
        detail: `The rewrite introduced ${names}, which the passage does not contain.`,
      })
    }
  }

  if (opts.dialogue) {
    const said = quotedRuns(before)
    const now = quotedRuns(after)
    const dropped = said.filter((q) => !now.some((r) => overlaps(q, r)))
    const invented = now.filter((q) => !said.some((r) => overlaps(q, r)))
    if (dropped.length) {
      out.push({ kind: 'dialogue', detail: `The rewrite dropped spoken line ${quote(dropped[0])}.` })
    }
    if (invented.length) {
      out.push({ kind: 'dialogue', detail: `The rewrite invented spoken line ${quote(invented[0])}.` })
    }
  }

  return out
}

function quote(run: string): string {
  const trimmed = run.length > 60 ? `${run.slice(0, 57)}...` : run
  return `"${trimmed}"`
}

/**
 * Proper nouns, normalised.
 *
 * From compromise rather than from a capitalisation regex, because the regex answer is wrong in
 * both directions: it misses "the Verge" and it fires on every word after a full stop. The tagger
 * in `core/hammer` cannot be used as-is, since its eight POS slots deliberately have no proper-noun
 * slot, so this reads the raw tag.
 */
export function properNounTerms(text: string): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = []
  for (const segment of proseSegments(text)) {
    if (!segment.trim()) continue
    nlp(segment).terms().forEach((view) => {
      const term = view.json()[0]?.terms?.[0]
      if (!term?.tags?.includes('ProperNoun')) return
      const [word] = normalizeWords(term.text)
      // "I" is tagged a proper noun and is never a character the rewrite invented.
      if (!word || word === 'i') return
      // Surface form alongside the key: the comparison wants "sarah", the user wants "Sarah".
      out.push({ key: word, text: term.text.replace(/^\W+|\W+$/g, '') })
    })
  }
  return out
}

/** The normalised keys alone, which is what comparison needs. */
export function properNouns(text: string): string[] {
  return properNounTerms(text).map((t) => t.key)
}

/**
 * Spans of quoted speech.
 *
 * Straight and curly double quotes only. Single quotes are not attempted on purpose: in prose they
 * are apostrophes far more often than they are speech, and a scanner that got that wrong would
 * reject good rewrites all day.
 */
export function quotedRuns(text: string): string[] {
  const out: string[] = []
  const re = /"([^"\n]+)"|“([^”\n]+)”/g
  for (const segment of proseSegments(text)) {
    for (const m of segment.matchAll(re)) {
      const body = (m[1] ?? m[2] ?? '').trim()
      if (body) out.push(body)
    }
  }
  return out
}

/** Two spoken lines are the same line if they share a content word. Deliberately loose: the pass is
 *  allowed to rephrase dialogue, it is not allowed to make up a line out of nothing. */
function overlaps(a: string, b: string): boolean {
  const x = contentWords(a)
  const y = contentWords(b)
  if (!x.size || !y.size) return true
  for (const w of x) if (y.has(w)) return true
  return false
}

/** Short function words carry no identity: "and" appearing in both lines proves nothing. */
function contentWords(text: string): Set<string> {
  return new Set(normalizeWords(text).filter((w) => w.length > 3))
}
