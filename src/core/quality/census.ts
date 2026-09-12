// Extension-ful imports on purpose: checkCensus.ts runs this under `node --experimental-strip-types`.
import { computeExclusions } from '../hammer/exclusions.ts'

export interface CensusEntry {
  /** Normalised: lowercased, apostrophes dropped, single-spaced. */
  phrase: string
  count: number
}

export interface Census {
  entries: CensusEntry[]
  /** Is this normalised phrase one of the overused ones? */
  has(phrase: string): boolean
}

export interface CensusOptions {
  enabled: boolean
  /** How many recent assistant messages to count over. */
  windowSize: number
  /** Occurrences before a phrase counts as overused. */
  minCount: number
  /** Cap on the exported list. It goes into a prompt, so it cannot grow without limit. */
  maxEntries: number
}

export const defaultCensus: CensusOptions = {
  enabled: true,
  windowSize: 20,
  minCount: 2,
  maxEntries: 40,
}

const MIN_N = 3
const MAX_N = 6

/** Function words. An n-gram made only of these is grammar, not a habit: "out of the" appearing
 *  twelve times says nothing about the prose. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'had', 'has', 'have',
  'he', 'her', 'here', 'hers', 'him', 'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me',
  'my', 'no', 'not', 'of', 'on', 'or', 'out', 'over', 'she', 'so', 'that', 'the', 'their', 'them',
  'then', 'there', 'they', 'this', 'to', 'up', 'was', 'were', 'what', 'when', 'which', 'who',
  'will', 'with', 'would', 'you', 'your',
])

const WORD = /[\p{L}\p{N}']+/gu

/** Normalised words: lowercased, apostrophes dropped, punctuation gone. */
export function normalizeWords(text: string): string[] {
  return (text.match(WORD) ?? []).map((w) => w.toLowerCase().replace(/'/g, ''))
}

/**
 * The prose either side of every exclusion, as separate pieces. Code, URLs and math are not prose
 * and never become banned phrases, and returning pieces rather than one blanked string is what
 * stops a phrase forming across the hole: "before `code` after" must not yield "before after",
 * which neither message contains.
 */
export function proseSegments(text: string): string[] {
  const ranges = computeExclusions(text)
  if (!ranges.length) return [text]
  const out: string[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    out.push(text.slice(cursor, start))
    cursor = end
  }
  out.push(text.slice(cursor))
  return out.filter((s) => s.trim())
}

/** Every n-gram of every length in range, as normalised phrase strings. */
export function phrasesOf(text: string): string[] {
  const out: string[] = []
  for (const segment of proseSegments(text)) {
    const words = normalizeWords(segment)
    for (let n = MIN_N; n <= MAX_N; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const window = words.slice(i, i + n)
        if (window.every((w) => STOPWORDS.has(w))) continue
        out.push(window.join(' '))
      }
    }
  }
  return out
}

/**
 * The chat's own overused phrasing, counted from what the model already wrote here.
 *
 * This is the half of slop control no fixed list can do. A lexicon knows "a shiver ran down
 * her spine" is tired everywhere; only the chat knows this model has reached for "something
 * unreadable in his eyes" four times in the last ten turns. The list it produces is used three
 * ways: told to the rewriting model, pushed into the sampler where the endpoint supports it, and
 * counted against any rewrite that comes back.
 *
 * Nothing is persisted. Recounting twenty messages costs a few milliseconds, and a stored census
 * would be a staleness bug and a schema change for no gain.
 */
export function buildCensus(history: string[], opts: CensusOptions = defaultCensus): Census {
  const empty: Census = { entries: [], has: () => false }
  if (!opts.enabled) return empty

  const window = Math.max(1, Math.floor(opts.windowSize))
  const minCount = Math.max(2, Math.floor(opts.minCount))
  const maxEntries = Math.max(0, Math.floor(opts.maxEntries))
  // The recent turns are at the tail.
  const recent = history.slice(-window)
  if (!recent.length || !maxEntries) return empty

  const counts = new Map<string, number>()
  for (const message of recent) {
    for (const phrase of phrasesOf(message)) {
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
    }
  }

  const over: CensusEntry[] = []
  for (const [phrase, count] of counts) {
    if (count >= minCount) over.push({ phrase, count })
  }
  // Longest first, then by count: absorption keeps the longer phrase, which is the more specific
  // and the more useful thing to ban.
  over.sort((a, b) => b.phrase.length - a.phrase.length || b.count - a.count)

  const kept: CensusEntry[] = []
  for (const entry of over) {
    // A four-word phrase that only ever appears inside a six-word one is the same habit counted
    // twice. Keep the six.
    const covered = kept.some((k) => k.count >= entry.count && k.phrase.includes(entry.phrase))
    if (!covered) kept.push(entry)
  }

  kept.sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)
  const entries = kept.slice(0, maxEntries)
  const set = new Set(entries.map((e) => e.phrase))
  return { entries, has: (phrase: string) => set.has(phrase) }
}
