import nlp from 'compromise'

/**
 * The POS slots a pattern can name. Compromise carries many more tags; we map its fine-grained
 * tags onto this small set so the DSL stays learnable. A token may carry several slots (e.g.
 * "fox" is both Noun and Singular; only one needs to satisfy a slot).
 */
export type PosTag = 'adj' | 'verb' | 'noun' | 'adv' | 'det' | 'prep' | 'conj' | 'pron' | 'punct'

/** A token is a surface word with char offsets into the source string and the POS slots it fills. */
export interface Token {
  text: string
  start: number
  end: number
  pos: PosTag[]
  /** Which sentence this token belongs to, counting from 0. Matches cannot cross a boundary. */
  sentenceIndex: number
  /**
   * What a literal matches against, when that differs from the surface text. Only a contraction's
   * leading half sets it: `text` stays "didn't" so the panel shows what the reader sees, while
   * `word` is "did" so `did not` matches it.
   */
  word?: string
  /**
   * Half of a contraction. The two halves share one char span, so a match covering either covers
   * the whole word. A match may not start on a `tail` or end on a `head`: a rule about "not" must
   * not rewrite the whole of "didn't".
   */
  contraction?: 'head' | 'tail'
}

/** A punctuation mark sits in its own token, which no POS slot and no `[word]` can match. */
export function isPunct(token: Token): boolean {
  return token.pos.length === 1 && token.pos[0] === 'punct'
}

/**
 * One token per written word: no punctuation, and a contraction as the single word it is written
 * as. This is the stream the tagger produced before punctuation and contraction halves were split
 * out for the matcher, and it is what a caller wants when it reads adjacency as "the next word"
 * and reads punctuation off the source text itself. The style checks use it.
 */
export function wordTokens(tokens: Token[]): Token[] {
  return tokens.filter((t) => !isPunct(t) && t.contraction !== 'tail')
}

/** What a literal compares against: the implicit word where there is one. */
export function matchText(token: Token): string {
  return token.word ?? token.text
}

/** The marks that become their own token. Apostrophes are left out: they live inside words. */
const PUNCT = /[,;:.!?…—–"“”‘’()[\]]/g

export interface Tagger {
  tokenize(text: string): Token[]
}

// Compromise tags → our slot set. A token wins a slot if any of its tags maps to it.
const tagToPos: Record<string, PosTag> = {
  Adjective: 'adj',
  Comparable: 'adj',
  Comparative: 'adj',
  Superlative: 'adj',
  Verb: 'verb',
  Noun: 'noun',
  Singular: 'noun',
  Plural: 'noun',
  Adverb: 'adv',
  Determiner: 'det',
  Article: 'det',
  Preposition: 'prep',
  Conjunction: 'conj',
  Pronoun: 'pron',
}

/** Map a compromise tag list onto our PosTag slots. Empty for punctuation/unknown words. */
export function tagsToPos(tags: string[]): PosTag[] {
  const out: PosTag[] = []
  for (const t of tags) {
    const p = tagToPos[t]
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

/**
 * Tag with `compromise`. Char offsets come from walking `text.indexOf(term, cursor)` forward,
 * which stays correct against the source string even when compromise normalises whitespace in its
 * `pre`/`post`.
 *
 * Two things compromise reports that this turns into tokens of their own:
 *
 * - **Punctuation.** Compromise never gives punctuation a term: it lives in the previous term's
 *   `post`. The marks are recovered from the gap between one token's `end` and the next one's
 *   `start`, and each becomes a `punct` token. Patterns can then require a comma, and the matcher
 *   can skip punctuation between two matchers instead of pretending it was never there.
 * - **Contractions.** "didn't" arrives as two terms: `{ text: "didn't", implicit: "did" }` and
 *   `{ text: "", implicit: "not" }`. Both become tokens over the same char span. The reading is
 *   compromise's and it is context-sensitive: "It's fine" gives `is`, "It's been" gives `has`. A
 *   rule written `it is` matches the first and not the second, which is the decision on record.
 *
 * `indexOf` from a moving cursor is O(n·m) worst case on degenerate input; fine for
 * message-scale text. Re-tag per strip pass is the heavier cost, capped in strip.ts.
 */
export class CompromiseTagger implements Tagger {
  tokenize(text: string): Token[] {
    if (!text) return []
    const doc = nlp(text)
    // `pendingWord` is compromise's `implicit` for a term that still has a surface. It only becomes
    // `word` if a trailing half turns up, so a word compromise expands on its own ("gonna") keeps
    // matching on what it says.
    const tokens: (Token & { isPastVerb: boolean; pendingWord?: string })[] = []
    let cursor = 0
    let sentenceIndex = -1
    let lastSeenIndex = -1
    doc.terms().forEach((view) => {
      const json = view.json()[0]
      const term = json.terms[0]
      const [sIdx] = term.index as [number, number]
      if (sIdx !== lastSeenIndex) {
        sentenceIndex += 1
        lastSeenIndex = sIdx
      }
      const surface = term.text
      const implicit = term.implicit as string | undefined
      // The trailing half of a contraction: no surface of its own, only the word it stands for.
      // It takes the leading half's span, and marks that half as the head of the pair.
      if (!surface) {
        const head = tokens[tokens.length - 1]
        if (!implicit || !head || head.sentenceIndex !== sentenceIndex) return
        head.contraction = 'head'
        if (head.pendingWord) head.word = head.pendingWord
        tokens.push({
          text: implicit,
          word: implicit,
          start: head.start,
          end: head.end,
          pos: tagsToPos(term.tags),
          sentenceIndex,
          contraction: 'tail',
          isPastVerb: false,
        })
        return
      }
      const start = text.indexOf(surface, cursor)
      if (start < 0) return
      const pos = tagsToPos(term.tags)
      // Skip pure punctuation / numbers a pattern can't address. Real punctuation is added below
      // from the gaps; this only drops the odd symbol compromise does hand back as a term.
      if (pos.length === 0 && !/\w/.test(surface)) return
      const isPastVerb = term.tags.includes('PastTense')
      tokens.push({
        text: surface,
        start,
        end: start + surface.length,
        pos,
        sentenceIndex,
        isPastVerb,
        // Held until the next term says whether a tail follows. Without one it is dropped, so a
        // word compromise expands on its own ("gonna") keeps matching on its surface.
        ...(implicit && implicit !== surface ? { pendingWord: implicit } : {}),
      })
      cursor = start + surface.length
    })
    // Compromise tags attributive past-participles inconsistently: "broken glass" → Adjective, but
    // "practiced hand"/"gilded cage" → Verb,PastTense. A past-tense verb directly before a noun in
    // the same sentence functions as an adjective: give it the adj slot too. Narrow to that
    // position to avoid pulling real past-tense verbs ("walked and talked") into adj rules.
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (!t.isPastVerb || t.pos.includes('adj')) continue
      const next = tokens[i + 1]
      if (next && next.sentenceIndex === t.sentenceIndex && next.pos.includes('noun')) t.pos.push('adj')
    }
    return withPunctuation(
      text,
      tokens.map(({ isPastVerb: _drop, pendingWord: _also, ...rest }) => rest),
    )
  }
}

/**
 * Insert a token per punctuation mark, read from the gaps between word tokens and after the last
 * one. A mark takes the sentence of the token before it, so the full stop closing a sentence
 * belongs to that sentence rather than opening the next.
 *
 * The two halves of a contraction share a span, which makes the gap between them negative.
 * `slice` returns '' for that, so the pair contributes no marks.
 */
function withPunctuation(text: string, tokens: Token[]): Token[] {
  const out: Token[] = []
  let at = 0
  const marks = (gap: string, from: number, sentenceIndex: number) => {
    PUNCT.lastIndex = 0
    for (let m = PUNCT.exec(gap); m; m = PUNCT.exec(gap)) {
      out.push({
        text: m[0],
        start: from + m.index,
        end: from + m.index + m[0].length,
        pos: ['punct'],
        sentenceIndex,
      })
    }
  }
  for (const token of tokens) {
    if (token.start > at) marks(text.slice(at, token.start), at, out[out.length - 1]?.sentenceIndex ?? token.sentenceIndex)
    out.push(token)
    at = Math.max(at, token.end)
  }
  if (at < text.length) marks(text.slice(at), at, out[out.length - 1]?.sentenceIndex ?? 0)
  return out
}

/** Memoize tagging by a key. The strip pipeline re-tags between passes, so a cache pays off. */
export function memoizeTagger(tagger: Tagger): Tagger {
  const cache = new Map<string, Token[]>()
  return {
    tokenize(text: string) {
      const cached = cache.get(text)
      if (cached) return cached
      const tokens = tagger.tokenize(text)
      cache.set(text, tokens)
      return tokens
    },
  }
}
