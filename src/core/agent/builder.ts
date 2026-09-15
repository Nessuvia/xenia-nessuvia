// Extension-ful imports on purpose: checkBuilder.ts runs this under `node --experimental-strip-types`.
import { CompromiseTagger, isPunct, memoizeTagger, type PosTag, type Token } from '../hammer/tagger.ts'
import { ALL_PUNCT, CLAUSE_TAG, WILDCARD_TAG } from '../hammer/pattern.ts'
import { newRule, type Rule } from './rules.ts'

/**
 * The rule builder: a sample sentence tagged into chips, each chip a choice, the choices written
 * out as pattern DSL. The chips are stored and the tokens are not: tagging the sample again gives
 * the same tokens, and a new sample resets the chips rather than shifting old choices onto new words.
 */

/** `exact` matches the word as written. `ignored` is punctuation left out, so any separator passes. */
export type ChipState = 'exact' | 'type' | 'any' | 'ignored'
/** How many words a non-exact chip takes: one, one to four, or up to the next punctuation. */
export type ChipCount = 'one' | 'few' | 'clause'

export interface Chip {
  state: ChipState
  /** `type` only. */
  tag?: PosTag
  /** `type` and `any` only. Absent reads as `one`. */
  count?: ChipCount
}

const tagger = memoizeTagger(new CompromiseTagger())

/** One token per chip: every word and every mark. A contraction is one chip, its tail rides on the head. */
export function sampleTokens(sample: string): Token[] {
  return tagger.tokenize(sample).filter((t) => t.contraction !== 'tail')
}

function defaultChip(token: Token): Chip {
  return { state: isPunct(token) ? 'ignored' : 'exact' }
}

/**
 * The next state on a click. Words cycle exact, word type, any. Punctuation toggles between
 * required and ignored, except a mark the DSL cannot write as itself (a bracket), which stays ignored.
 */
export function nextChip(token: Token, chip: Chip): Chip {
  if (isPunct(token)) return { state: chip.state === 'ignored' && ALL_PUNCT.test(token.text) ? 'exact' : 'ignored' }
  const cycle: ChipState[] = ['exact', 'type', 'any']
  const state = cycle[(cycle.indexOf(chip.state) + 1) % cycle.length]
  return { ...chip, state, tag: chip.tag ?? token.pos.find((p) => p !== 'punct') ?? 'noun' }
}

const quantifier: Record<ChipCount, string> = { one: '', few: '{1,4}', clause: '' }

/** One DSL part per chip, null for an ignored one. A part's place among the non-null parts is its `$n`. */
export function chipParts(tokens: Token[], chips: Chip[]): (string | null)[] {
  return tokens.map((token, i) => {
    const chip = chips[i] ?? defaultChip(token)
    if (chip.state === 'ignored') return null
    if (chip.state === 'exact') return token.text
    if (chip.count === 'clause') return `[${CLAUSE_TAG}]`
    return `[${chip.state === 'any' ? WILDCARD_TAG : chip.tag}]${quantifier[chip.count ?? 'one']}`
  })
}

/** `$n` per chip, null for an ignored one. */
export function chipRefs(parts: (string | null)[]): (number | null)[] {
  let n = 0
  return parts.map((part) => (part === null ? null : ++n))
}

/** The fields a sample or a chip change writes. No chips resets them to the sample's defaults. */
export function builderPatch(sample: string, chips?: Chip[]): Pick<Rule, 'sample' | 'chips' | 'find'> {
  const tokens = sampleTokens(sample)
  const next = chips ?? tokens.map(defaultChip)
  return { sample, chips: next, find: chipParts(tokens, next).filter(Boolean).join(' ') }
}

/** An all-exact rule built from a sample, the shape "Make rule" saves. */
export function ruleFromSample(sample: string, over: Partial<Rule> = {}): Rule {
  return { ...newRule(), ...builderPatch(sample), ...over }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordSource: Record<ChipCount, string> = {
  one: "[\\w'-]+",
  few: "[\\w'-]+(?:\\s+[\\w'-]+){0,3}",
  clause: '[^,.!?;\\n]+',
}

/**
 * The chips as a regex, for "Edit as regex". A word type has no regex form and becomes any word, and
 * a contraction matches only as written. Loose separators stand in for the punctuation skipping.
 */
export function chipsRegex(tokens: Token[], chips: Chip[]): string {
  const parts: { source: string; word: boolean }[] = []
  tokens.forEach((token, i) => {
    const chip = chips[i] ?? defaultChip(token)
    if (chip.state === 'ignored') return
    if (chip.state === 'exact') parts.push({ source: escape(token.text), word: !isPunct(token) })
    else parts.push({ source: wordSource[chip.count ?? 'one'], word: true })
  })
  if (!parts.length) return ''
  const edge = (p: { word: boolean }) => (p.word ? '\\b' : '')
  return `${edge(parts[0])}${parts.map((p) => p.source).join("[^\\w'\\n]*")}${edge(parts[parts.length - 1])}`
}
