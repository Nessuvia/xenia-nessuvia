// Extension-ful imports on purpose: checkLexicon.ts runs this under `node --experimental-strip-types`.
import type { Note } from '../nessuPass/detect/note.ts'
import { computeExclusions, type Range } from '../hammer/exclusions.ts'

export interface LexiconEntry {
  /** Stable across builds, because the user's overlay is keyed by it. */
  id: string
  /** A literal phrase, or a regex source when `regex` is set. */
  phrase: string
  regex: boolean
  enabled: boolean
  /** How loud the tell is. Multiplies the hit when scoring. */
  weight: number
}

/** A lexicon hit. A `Note`, so it can be handed to `buildPassPrompt` unchanged when the passes
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
 * A literal gets word boundaries where its edges are word characters, so "delve" does not fire on
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

/**
 * The bundled list with the user's overlay on top.
 *
 * Merged by id rather than replaced wholesale so that updating the shipped list keeps the user's
 * decisions: an entry they disabled stays disabled, a weight they changed stays changed, and
 * entries they wrote themselves survive at the end. An overlay id that no longer exists in the
 * bundle is treated as one of their own.
 */
export function mergeLexicon(bundled: LexiconEntry[], overlay: LexiconEntry[]): LexiconEntry[] {
  const byId = new Map(overlay.map((e) => [e.id, e]))
  const out = bundled.map((e) => ({ ...e, ...byId.get(e.id) }))
  const bundledIds = new Set(bundled.map((e) => e.id))
  for (const e of overlay) if (!bundledIds.has(e.id)) out.push(e)
  return out
}

export function newLexiconEntry(): LexiconEntry {
  return { id: crypto.randomUUID(), phrase: '', regex: false, enabled: true, weight: 1 }
}
