import type { PosTag } from './tagger.ts'

export const POS_TAGS: readonly PosTag[] = ['adj', 'verb', 'noun', 'adv', 'det', 'prep', 'conj', 'pron']

/** `[word]` is a wildcard slot: any single token, whatever the tagger made of it. Kept out of
 *  POS_TAGS because it isn't a part of speech: the panel lists it separately. */
export const WILDCARD_TAG = 'word'

export type SlotTag = PosTag | typeof WILDCARD_TAG

export type TokenMatcher =
  | { kind: 'literal'; value: string; caseSensitive: boolean }
  | { kind: 'pos'; tag: SlotTag; min: number; max: number }

export interface CompiledPattern {
  matchers: TokenMatcher[]
  sourceDsl: string
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
    .map((p) => p.replace(/^[.,;:!"'()]+|[.,;:!"'()]+$/g, ''))
    .filter(Boolean)
  for (const part of parts) {
    if (part.startsWith('[')) {
      if (!part.endsWith(']') && !hasQuantifierSuffix(part)) {
        throw new PatternError(`Unclosed slot: ${part}`)
      }
      // Pull the bracket body off, leaving any quantifier suffix.
      const close = part.indexOf(']')
      if (close < 0) throw new PatternError(`Unclosed slot: ${part}`)
      const tag = part.slice(1, close)
      const suffix = part.slice(close + 1)
      if (tag !== WILDCARD_TAG && !POS_TAGS.includes(tag as PosTag)) {
        throw new PatternError(`Unknown POS tag: [${tag}]`)
      }
      const { min, max } = parseQuantifier(suffix, part)
      matchers.push({ kind: 'pos', tag: tag as SlotTag, min, max })
    } else {
      if (part.includes('[') || part.includes(']')) {
        throw new PatternError(`Brackets must wrap a whole token: ${part}`)
      }
      matchers.push({ kind: 'literal', value: part, caseSensitive })
    }
  }
  if (matchers.length === 0) throw new PatternError('Pattern is empty.')
  return { matchers, sourceDsl: dsl }
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
