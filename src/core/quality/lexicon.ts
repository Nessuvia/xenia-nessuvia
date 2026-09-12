// Extension-ful imports on purpose: checkLexicon.ts runs this under `node --experimental-strip-types`.
import type { Note } from '../secondSweep/note.ts'
import { computeExclusions, type Range } from '../hammer/exclusions.ts'

export interface LexiconEntry {
  /** Identifies the row for editing and for `slop:<id>` on a hit. */
  id: string
  /** A literal phrase, or a regex source when `regex` is set. */
  phrase: string
  regex: boolean
  enabled: boolean
  /** How loud the tell is. Multiplies the hit when scoring. */
  weight: number
}

/** A lexicon hit. A `Note`: it can be handed to `buildPassPrompt` unchanged when the passes
 *  merge, with the weight riding along for the scorer. */
export interface SlopHit extends Note {
  weight: number
}

/** Hits reported per entry. One phrase used six times is one habit. */
const MAX_PER_ENTRY = 3

function escape(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile an entry, or null if the user typed a regex that does not parse. Skipped rather than
 * thrown, the same call the free-text rules make: a half-typed entry must never break a send.
 *
 * A literal gets word boundaries where its edges are word characters: "delve" does not fire on
 * "delved into" being spelled inside another word, while a phrase ending in punctuation still
 * matches.
 */
export function compileEntry(entry: LexiconEntry): RegExp | null {
  const phrase = entry.phrase.trim()
  if (!phrase) return null
  try {
    if (entry.regex) return new RegExp(phrase, 'gi')
    const lead = /^[\p{L}\p{N}]/u.test(phrase) ? '\\b' : ''
    const tail = /[\p{L}\p{N}]$/u.test(phrase) ? '\\b' : ''
    return new RegExp(`${lead}${escape(phrase)}${tail}`, 'giu')
  } catch {
    return null
  }
}

function excluded(exclusions: Range[], start: number, end: number): boolean {
  return exclusions.some(([from, to]) => start < to && end > from)
}

/**
 * Phrases from the lexicon, found in the text.
 *
 * The fixed half of slop control. The census knows what this chat has overused; this knows what is
 * tired everywhere, which is the part a fresh chat has no evidence for and a local model reaches
 * for hardest on turn one.
 */
export function findSlop(text: string, entries: LexiconEntry[]): SlopHit[] {
  const applicable = entries.filter((e) => e.enabled && e.phrase.trim())
  if (!applicable.length) return []

  const exclusions = computeExclusions(text)
  const hits: SlopHit[] = []
  for (const entry of applicable) {
    const re = compileEntry(entry)
    if (!re) continue
    let found = 0
    for (const m of text.matchAll(re)) {
      if (found >= MAX_PER_ENTRY) break
      const start = m.index
      const end = start + m[0].length
      if (end === start) continue
      if (excluded(exclusions, start, end)) continue
      found += 1
      hits.push({
        source: `slop:${entry.id}`,
        span: { start, end },
        slice: m[0],
        weight: Math.max(0, entry.weight),
        message: `"${m[0]}" is worn phrasing. Say what is actually happening, or cut it.`,
      })
    }
  }
  return hits.sort((a, b) => (a.span?.start ?? 0) - (b.span?.start ?? 0))
}

export function newLexiconEntry(): LexiconEntry {
  return { id: crypto.randomUUID(), phrase: '', regex: false, enabled: true, weight: 1 }
}
