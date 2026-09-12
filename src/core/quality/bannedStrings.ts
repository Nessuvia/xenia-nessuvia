// Extension-ful imports on purpose: checkBannedStrings.ts runs this under
// `node --experimental-strip-types`.
import type { Census } from './census.ts'
import type { LexiconEntry } from './lexicon.ts'

/** How many phrases go out by default. The list is read by a model and, where the endpoint takes
 *  one, by a sampler; both get worse, not better, past a few dozen. */
export const DEFAULT_LIMIT = 40

/**
 * The phrases the rewrite is asked not to use.
 *
 * The prevention half of the feature. Scoring catches slop after the fact and costs a rejected
 * chunk; this tries to stop it being generated. The same list goes three places: into the Gold
 * prompt as a system turn, into `banned_strings` on endpoints that accept one, and, implicitly,
 * into the score: it is built from the same census and lexicon the scorer reads.
 *
 * Regex entries are left out. A sampler takes literal strings, and a prompt asking a local model not
 * to use `(heart|pulse) (hammered|pounding)` is a prompt it will quote back verbatim.
 *
 * The census comes first: what this chat has actually worn out matters more than what is tired in
 * general, and if the list has to be cut it should be cut from the general end.
 */
export function bannedList(
  census: Census,
  entries: LexiconEntry[],
  limit = DEFAULT_LIMIT,
): string[] {
  const cap = Math.max(0, Math.floor(limit))
  if (!cap) return []

  const out: string[] = []
  const seen = new Set<string>()
  const add = (phrase: string) => {
    const text = phrase.trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key) || out.length >= cap) return
    seen.add(key)
    out.push(text)
  }

  for (const entry of census.entries) add(entry.phrase)
  for (const entry of [...entries].sort((a, b) => b.weight - a.weight)) {
    if (!entry.enabled || entry.regex) continue
    add(entry.phrase)
  }
  return out
}

/** The instruction that carries the list into the prompt. One plain sentence and the phrases, one
 *  per line: a small model can follow it without parsing anything. */
export function bannedPromptTurn(phrases: string[]): string {
  return `Do not use any of these phrases:\n${phrases.join('\n')}`
}
