// Extension-ful imports on purpose: check scripts run this under `node --experimental-strip-types`.
import { computeExclusions, type IgnorePair } from '../hammer/exclusions.ts'

/** One word swap, applied in code before any rule runs. */
export interface LexiconEntry {
  id: string
  /** A literal phrase. Matched case-insensitively on word edges. */
  phrase: string
  /** Blank removes the phrase. */
  replacement: string
  enabled: boolean
}

function escape(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Word edges apply where the phrase edges are word characters. A removal also takes the space before it. */
function compileEntry(phrase: string, removal: boolean): RegExp {
  const lead = /^[\p{L}\p{N}]/u.test(phrase) ? '(?<![\\p{L}\\p{N}])' : ''
  const tail = /[\p{L}\p{N}]$/u.test(phrase) ? '(?![\\p{L}\\p{N}])' : ''
  return new RegExp(`${removal ? ' ?' : ''}${lead}${escape(phrase)}${tail}`, 'giu')
}

/**
 * Apply every enabled swap in list order.
 * A match starting with a capital keeps the capital.
 * Code spans, URLs and link targets are skipped.
 */
export function applyLexicon(text: string, entries: LexiconEntry[], ignore: IgnorePair[] = []): string {
  let out = text
  for (const entry of entries) {
    const phrase = entry.phrase.trim()
    if (!entry.enabled || !phrase) continue
    const exclusions = computeExclusions(out, ignore)
    out = out.replace(compileEntry(phrase, !entry.replacement), (match: string, at: number) => {
      if (exclusions.some(([from, to]) => at < to && at + match.length > from)) return match
      const rep = entry.replacement
      return /^ ?\p{Lu}/u.test(match) ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep
    })
  }
  // ponytail: a removal at the start of a line leaves the following space; add a repair pass if it shows.
  return out
}

/** Where one swap matches, changing nothing. The tester's counts. */
export function lexiconSpans(text: string, entry: LexiconEntry, ignore: IgnorePair[] = []): Array<{ start: number; end: number }> {
  const phrase = entry.phrase.trim()
  if (!phrase) return []
  const exclusions = computeExclusions(text, ignore)
  return [...text.matchAll(compileEntry(phrase, false))]
    .map((m) => ({ start: m.index, end: m.index + m[0].length }))
    .filter(({ start, end }) => !exclusions.some(([from, to]) => start < to && end > from))
}

export function newLexiconEntry(): LexiconEntry {
  return { id: crypto.randomUUID(), phrase: '', replacement: '', enabled: true }
}
