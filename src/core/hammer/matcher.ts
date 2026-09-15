import { CLAUSE_TAG, WILDCARD_TAG, type CompiledPattern, type TokenMatcher } from './pattern.ts'
import { isPunct, matchText, type Token } from './tagger.ts'

/** A char span in the source string that satisfied a pattern. */
export interface Match {
  start: number
  end: number
  /** Token indices [from, to) in the token array this match was found against. */
  tokenFrom: number
  tokenTo: number
  /** One char span per written part of the pattern, in order: the capture groups `$1..$n`
   *  reference. A part that matched zero tokens (a `?`/`*` that bound nothing) is a zero-width
   *  span. A part that compiled to several matchers, like a contraction, is still one span. */
  groups: Array<{ start: number; end: number }>
}

/** Does a token satisfy a POS slot? A token carries several slots; any one matches. `[word]` and
 *  `[clause]` are wildcards over words. No slot ever matches punctuation: that is written as
 *  itself. */
function matchesPos(token: Token, tag: TokenMatcher): boolean {
  if (tag.kind !== 'pos') return false
  if (isPunct(token)) return false
  if (tag.tag === WILDCARD_TAG || tag.tag === CLAUSE_TAG) return true
  return token.pos.includes(tag.tag)
}

/** Does a token satisfy a literal matcher? Case-insensitive unless the rule opts out. A
 *  contraction's halves match on the words they stand for, not on "didn't". */
function matchesLiteral(token: Token, m: TokenMatcher): boolean {
  if (m.kind !== 'literal') return false
  if (isPunct(token) !== !!m.punct) return false
  const text = matchText(token)
  return m.caseSensitive ? text === m.value : text.toLowerCase() === m.value.toLowerCase()
}

/** The first token at or after `ti` that is not punctuation. Runs of punctuation between two
 *  matchers are skipped, so a rule does not have to predict the separators. */
function skipPunct(tokens: Token[], ti: number): number {
  let at = ti
  while (at < tokens.length && isPunct(tokens[at])) at += 1
  return at
}

/**
 * Greedy left-to-right scan with backtracking over quantified POS slots. Returns the first
 * (leftmost) non-overlapping matches in token order. Each match's char span is the text from the
 * first matched token's start to the last matched token's end.
 *
 * Constraints enforced here:
 * - A match's tokens all share one `sentenceIndex`.
 * - A match's char span does not overlap any exclusion zone (caller passes the sorted ranges).
 *
 * Greedy quantifiers: a `[adj]+` takes as many adjectives as it can, then backtracks one at a time
 * if the rest of the pattern fails to continue. This is the classic regex-semantics in miniature.
 */
export function findMatches(
  tokens: Token[],
  pattern: CompiledPattern,
  exclusions: ReadonlyArray<readonly [number, number]> = [],
): Match[] {
  const matches: Match[] = []
  if (pattern.matchers.length === 0) return matches
  let i = 0
  while (i < tokens.length) {
    // A match may not start in the middle of a contraction: a rule about "not" must not take the
    // whole of "didn't" with it.
    if (tokens[i].contraction === 'tail') {
      i += 1
      continue
    }
    const span = tryMatchAt(tokens, i, pattern.matchers, exclusions)
    if (span) {
      matches.push({
        start: span.start,
        end: span.end,
        tokenFrom: i,
        tokenTo: span.tokenTo,
        groups: groupSpans(tokens, pattern, span.groups),
      })
      // Non-overlapping: continue after this match.
      i = span.tokenTo
    } else {
      i += 1
    }
  }
  return matches
}

/**
 * Fold the per-matcher token ranges into one span per written part. Matchers of one part are
 * consecutive, so a part's span runs from its first bound token to its last. A part that bound
 * nothing keeps a zero-width span, so `$n` stays aligned with the chips either way.
 */
function groupSpans(
  tokens: Token[],
  pattern: CompiledPattern,
  ranges: Array<[number, number]>,
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  for (let g = 0; g < pattern.groupCount; g++) {
    const mine = ranges.filter((_, k) => pattern.matchers[k]?.group === g)
    const bound = mine.filter(([from, to]) => to > from)
    if (bound.length) {
      out.push({ start: tokens[bound[0][0]].start, end: tokens[bound[bound.length - 1][1] - 1].end })
    } else {
      out.push(tokenRangeToSpan(tokens, mine[0] ?? [0, 0]))
    }
  }
  return out
}

/** Convert a `[from, to)` token range to a char span; an empty range is a zero-width point. */
function tokenRangeToSpan(tokens: Token[], range: [number, number]): { start: number; end: number } {
  const [from, to] = range
  if (to > from) return { start: tokens[from].start, end: tokens[to - 1].end }
  // Zero-width: sit at the start of the next token, or the end of the previous one.
  const at = tokens[from]?.start ?? tokens[from - 1]?.end ?? 0
  return { start: at, end: at }
}

function tryMatchAt(
  tokens: Token[],
  start: number,
  matchers: TokenMatcher[],
  exclusions: ReadonlyArray<readonly [number, number]>,
): { start: number; end: number; tokenTo: number; groups: Array<[number, number]> } | null {
  const sentence = tokens[start].sentenceIndex
  // Walk matchers with a cursor over tokens; quantified POS slots push a backtracking frame.
  // We do an explicit recursion so each quantifier can yield and retry.
  const result = walk(tokens, start, sentence, matchers, 0, exclusions, start)
  if (!result) return null
  return {
    start: tokens[start].start,
    end: result.end,
    tokenTo: result.tokenTo,
    groups: result.groups,
  }
}

/** Recursive walk: `mi` is the matcher index, `ti` the token cursor. Returns the end char, token
 *  cursor, and per-matcher token ranges (for capture groups) on success. */
function walk(
  tokens: Token[],
  startTi: number,
  sentence: number,
  matchers: TokenMatcher[],
  mi: number,
  exclusions: ReadonlyArray<readonly [number, number]>,
  ti: number,
): { end: number; tokenTo: number; groups: Array<[number, number]> } | null {
  if (mi >= matchers.length) {
    // All matchers consumed. Require at least one token matched (a pattern of only `?` slots still
    // must bind something to count, otherwise empty matches would fire everywhere).
    if (ti === startTi) return null
    // Nor may it end in the middle of one: a rule about "did" must not stop halfway through
    // "didn't". Returning null lets a quantifier backtrack and try a shorter binding.
    if (tokens[ti - 1].contraction === 'head') return null
    return { end: tokens[ti - 1].end, tokenTo: ti, groups: [] }
  }
  const m = matchers[mi]
  // Punctuation between two matchers is not the rule's business, so it is stepped over. Two
  // matchers have to see it: one that is itself punctuation, and `[clause]`, whose whole meaning is
  // "up to the next mark". Skipping into a clause would make `sat [clause]` match "sat, then left",
  // where the clause after "sat" is in fact over. A rule that wants the next clause writes the
  // comma: `sat , [clause]`.
  const sees = (m.kind === 'literal' && m.punct) || (m.kind === 'pos' && m.tag === CLAUSE_TAG)
  if (mi > 0 && !sees) ti = skipPunct(tokens, ti)
  if (m.kind === 'literal') {
    const t = tokens[ti]
    if (!t) return null
    if (t.sentenceIndex !== sentence) return null
    if (!matchesLiteral(t, m)) return null
    if (overlapsExclusion(t.start, t.end, exclusions)) return null
    const rest = walk(tokens, startTi, sentence, matchers, mi + 1, exclusions, ti + 1)
    if (!rest) return null
    return { end: rest.end, tokenTo: rest.tokenTo, groups: [[ti, ti + 1], ...rest.groups] }
  }
  // POS slot with [min, max]. Greedy: try the most, backtrack to the least.
  const max = Math.min(m.max, tokens.length - ti)
  for (let count = max; count >= m.min; count--) {
    // `count` tokens must all satisfy the slot, share the sentence, and avoid exclusions.
    let ok = true
    let lastEnd = -1
    for (let k = 0; k < count; k++) {
      const t = tokens[ti + k]
      if (!t || t.sentenceIndex !== sentence || !matchesPos(t, m)) { ok = false; break }
      if (overlapsExclusion(t.start, t.end, exclusions)) { ok = false; break }
      lastEnd = t.end
    }
    if (!ok) continue
    const rest = walk(tokens, startTi, sentence, matchers, mi + 1, exclusions, ti + count)
    if (rest) {
      // End char is the rest's end if more matched, else this slot's last token end.
      const end = rest.tokenTo > ti + count ? rest.end : lastEnd
      return { end, tokenTo: rest.tokenTo, groups: [[ti, ti + count], ...rest.groups] }
    }
  }
  return null
}

/** Binary-search the sorted exclusion ranges for any overlap with [s, e). */
export function overlapsExclusion(
  s: number,
  e: number,
  exclusions: ReadonlyArray<readonly [number, number]>,
): boolean {
  let lo = 0
  let hi = exclusions.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const [xs, xe] = exclusions[mid]
    if (xe <= s) lo = mid + 1
    else if (xs >= e) hi = mid
    else return true
  }
  return false
}
