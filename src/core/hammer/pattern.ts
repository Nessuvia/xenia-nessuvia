import { CompromiseTagger, memoizeTagger, type PosTag } from './tagger.ts'

/** The parts of speech a pattern can name. `punct` is deliberately absent: punctuation is written
 *  as itself, not as a slot. */
export const POS_TAGS: readonly PosTag[] = ['adj', 'verb', 'noun', 'adv', 'det', 'prep', 'conj', 'pron']

/** `[word]` is a wildcard slot: any single token, whatever the tagger made of it. Kept out of
 *  POS_TAGS because it isn't a part of speech: the panel lists it separately. */
export const WILDCARD_TAG = 'word'

/** `[clause]` is the rest of the clause: one or more words, stopping at punctuation or the end of
 *  the sentence. It is `[word]+` with a name that says what it is for. */
export const CLAUSE_TAG = 'clause'

export type SlotTag = PosTag | typeof WILDCARD_TAG | typeof CLAUSE_TAG

/** Which written part of the DSL a matcher came from. One part is one chip in the builder and one
 *  `$n` in a replacement, however many matchers it compiled to: "didn't" is one chip and one group
 *  even though it matches as two words. */
interface Grouped {
  group: number
}

export type TokenMatcher =
  /** `punct` matches a punctuation token. Only a matcher written as punctuation gets it, and only
   *  such a matcher is exempt from the punctuation-skipping between matchers. */
  | ({ kind: 'literal'; value: string; caseSensitive: boolean; punct?: boolean } & Grouped)
  | ({ kind: 'pos'; tag: SlotTag; min: number; max: number } & Grouped)

/** A part made only of punctuation marks, which becomes a literal punctuation matcher. */
const ALL_PUNCT = /^[,;:.!?…—–"“”‘’()]+$/

// Expanding a contraction literal needs the same tagger the text goes through, so the two agree on
// what "didn't" is. Memoized: this runs per rule per pass over a handful of short strings.
const literalTagger = memoizeTagger(new CompromiseTagger())

export interface CompiledPattern {
  matchers: TokenMatcher[]
  sourceDsl: string
  /** How many `$n` groups the pattern has, one per written part. */
  groupCount: number
}

/** A parse error carries a human message for the settings row, same affordance as F&R regex errors. */
export class PatternError extends Error {}

/**
 * Parse the DSL into matchers. Tokens are whitespace-separated. A literal is bare text; a POS slot
 * is `[tag]` with an optional quantifier suffix: `?` (0..1), `+` (1..∞), `{n}` (n..n),
 * `{n,}` (n..∞), `{n,m}` (n..m). Unknown tags, malformed brackets, and unbalanced quantifiers
 * throw `PatternError`.
 *
 * Hand-rolled, not regex-driven: the DSL is small and the bracket/quantifier state machine is
 * clearer than a single regex that has to explain every shape.
 */
export function compilePattern(dsl: string, caseSensitive = false): CompiledPattern {
  const matchers: TokenMatcher[] = []
  // Split on whitespace but keep bracket groups intact: they contain no spaces by construction.
  // Source punctuation is dropped at tokenization. Edge punctuation in a pattern token can never
  // match anything: strip it. This makes seed rules like `not just [noun], but [noun]` work (the
  // comma after `]` would otherwise read as a bad quantifier) and drops standalone punctuation tokens.
  const parts = dsl
    .trim()
    .split(/\s+/)
    // A part that is nothing but punctuation is a matcher in its own right. Punctuation still
    // stuck to a word or a slot (`[noun],`) is stripped as it always was, so it stays optional:
    // a required comma is written with a space in front of it.
    .map((p) => (ALL_PUNCT.test(p) ? p : p.replace(/^[.,;:!"'()]+|[.,;:!"'()]+$/g, '')))
    .filter(Boolean)
  // One group per written part, so `$n` and the builder's chips line up whatever a part compiles to.
  let group = -1
  for (const part of parts) {
    group += 1
    if (ALL_PUNCT.test(part)) {
      for (const mark of part) matchers.push({ kind: 'literal', value: mark, caseSensitive: false, punct: true, group })
    } else if (part.startsWith('[')) {
      if (!part.endsWith(']') && !hasQuantifierSuffix(part)) {
        throw new PatternError(`Unclosed slot: ${part}`)
      }
      // Pull the bracket body off, leaving any quantifier suffix.
      const close = part.indexOf(']')
      if (close < 0) throw new PatternError(`Unclosed slot: ${part}`)
      const tag = part.slice(1, close)
      const suffix = part.slice(close + 1)
      if (tag !== WILDCARD_TAG && tag !== CLAUSE_TAG && !POS_TAGS.includes(tag as PosTag)) {
        throw new PatternError(`Unknown POS tag: [${tag}]`)
      }
      // A bare `[clause]` is one or more words. A quantifier on it still means what it says.
      const { min, max } = suffix === '' && tag === CLAUSE_TAG ? { min: 1, max: Infinity } : parseQuantifier(suffix, part)
      matchers.push({ kind: 'pos', tag: tag as SlotTag, min, max, group })
    } else {
      if (part.includes('[') || part.includes(']')) {
        throw new PatternError(`Brackets must wrap a whole token: ${part}`)
      }
      // "didn't" becomes the two words compromise reads it as, so it matches both the contraction
      // and "did not" written out. Anything else is one literal.
      for (const word of expandContraction(part)) matchers.push({ kind: 'literal', value: word, caseSensitive, group })
    }
  }
  if (matchers.length === 0) throw new PatternError('Pattern is empty.')
  return { matchers, sourceDsl: dsl, groupCount: group + 1 }
}

/**
 * A literal written as a fused form, as the words it stands for: "didn't" to did + not, "gonna" to
 * going + to. Everything else comes back as itself, one word.
 *
 * Every literal goes through the tagger, not just the ones with an apostrophe, because "gonna" and
 * "wanna" fuse without one. The tagger is memoized and a rule's literals are few and short.
 *
 * Read on its own, "it's" gets compromise's out-of-context reading, which is "is". A rule meant for
 * "it has" is written `it has`, and it will match the occurrences compromise read that way.
 */
function expandContraction(part: string): string[] {
  const tokens = literalTagger.tokenize(part)
  if (tokens.length !== 2 || tokens[0].contraction !== 'head') return [part]
  return [tokens[0].word ?? tokens[0].text, tokens[1].text]
}

function hasQuantifierSuffix(part: string): boolean {
  const i = part.indexOf(']')
  return i >= 0 && i < part.length - 1
}

function parseQuantifier(suffix: string, part: string): { min: number; max: number } {
  if (suffix === '') return { min: 1, max: 1 }
  if (suffix === '?') return { min: 0, max: 1 }
  if (suffix === '+') return { min: 1, max: Infinity }
  if (suffix === '*') return { min: 0, max: Infinity }
  let bound: RegExpExecArray | null
  // `{n}`, `{n,}` (unbounded), `{n,m}`. The second group is '' for the unbounded form.
  bound = /^\{(\d+)(?:,(\d*))?\}$/.exec(suffix)
  if (!bound) throw new PatternError(`Bad quantifier on ${part}`)
  const min = Number(bound[1])
  const max = bound[2] === undefined ? min : bound[2] === '' ? Infinity : Number(bound[2])
  if (max < min) throw new PatternError(`Quantifier max below min on ${part}`)
  return { min, max }
}

/** Compile or return null + error message; convenience for the panel and the matcher. */
export function tryCompile(
  dsl: string,
  caseSensitive = false,
): { pattern: CompiledPattern } | { error: string } {
  try {
    return { pattern: compilePattern(dsl, caseSensitive) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid pattern' }
  }
}
