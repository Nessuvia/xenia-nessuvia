import nlp from 'compromise'

/**
 * The POS slots a pattern can name. Compromise carries many more tags; we map its fine-grained
 * tags onto this small set so the DSL stays learnable. A token may carry several slots (e.g.
 * "fox" is both Noun and Singular; only one needs to satisfy a slot).
 */
export type PosTag = 'adj' | 'verb' | 'noun' | 'adv' | 'det' | 'prep' | 'conj' | 'pron'

/** A token is a surface word with char offsets into the source string and the POS slots it fills. */
export interface Token {
  text: string
  start: number
  end: number
  pos: PosTag[]
  /** Which sentence this token belongs to, counting from 0. Matches cannot cross a boundary. */
  sentenceIndex: number
}

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
 * `pre`/`post`. Punctuation tokens (no POS slot and non-word text) are dropped: patterns match
 * words, and repair re-attaches the surrounding punctuation.
 *
 * `indexOf` from a moving cursor is O(n·m) worst case on degenerate input; fine for
 * message-scale text. Re-tag per strip pass is the heavier cost, capped in strip.ts.
 */
export class CompromiseTagger implements Tagger {
  tokenize(text: string): Token[] {
    if (!text) return []
    const doc = nlp(text)
    const tokens: (Token & { isPastVerb: boolean })[] = []
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
      if (!surface) return
      const start = text.indexOf(surface, cursor)
      if (start < 0) return
      const pos = tagsToPos(term.tags)
      // Skip pure punctuation / numbers a pattern can't address. Keeps the matcher's token array
      // tight; surrounding punctuation survives via its char offsets being outside any match span.
      if (pos.length === 0 && !/\w/.test(surface)) return
      const isPastVerb = term.tags.includes('PastTense')
      tokens.push({ text: surface, start, end: start + surface.length, pos, sentenceIndex, isPastVerb })
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
    return tokens.map(({ isPastVerb: _drop, ...rest }) => rest)
  }
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
