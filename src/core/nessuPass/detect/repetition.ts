// Extension-ful imports on purpose: checkRepetition.ts runs this under `node --experimental-strip-types`.
import type { Note } from './note.ts'
import type { RepetitionSettings } from '../stores/settingsStore.ts'

/** One word, and where it sits in the text it came from. */
interface Word {
  /** Lowercased, apostrophes dropped, for comparison. */
  key: string
  start: number
  end: number
}

const WORD = /[\p{L}\p{N}']+/gu

function words(text: string): Word[] {
  const out: Word[] = []
  for (const m of text.matchAll(WORD)) {
    out.push({ key: m[0].toLowerCase().replace(/'/g, ''), start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** Notes from one run. A wall of them buries the real problem and costs prompt tokens. */
const MAX_NOTES = 5

/**
 * Phrases this reply shares with recent history.
 *
 * The one check that cannot be a rule. A Grammar Hammer pattern matches the text in front of it;
 * this needs the conversation, because the thing being detected is the model repeating itself over
 * many turns rather than anything wrong with the sentence on its own. It is also the reason Second
 * Pass exists at all: the old render-time hammer hid slop from the reader while leaving it in the
 * context for the model to copy.
 *
 * Matching is on normalised words, so casing and apostrophes do not hide a repeat, but the span
 * reported points back into the original text.
 */
export function findRepetition(text: string, history: string[], settings: RepetitionSettings): Note[] {
  if (!settings.enabled) return []
  const phrase = Math.max(2, Math.floor(settings.phrase))
  const repeats = Math.max(1, Math.floor(settings.repeats))
  // Newest first would compare against the wrong end: the recent turns are the ones at the tail.
  const recent = history.slice(-Math.max(1, Math.floor(settings.lookback)))
  if (recent.length < repeats) return []

  const mine = words(text)
  if (mine.length < phrase) return []

  // Each earlier message becomes a set of its phrases, so a phrase used twice inside one message
  // still only counts as that one message having it.
  const seen = recent.map((h) => {
    const w = words(h)
    const set = new Set<string>()
    for (let i = 0; i + phrase <= w.length; i++) {
      set.add(w.slice(i, i + phrase).map((x) => x.key).join(' '))
    }
    return set
  })

  const notes: Note[] = []
  let reportedTo = -1
  for (let i = 0; i + phrase <= mine.length && notes.length < MAX_NOTES; i++) {
    // One note per stretch of text: overlapping windows over the same repeated sentence would
    // otherwise produce four notes all saying the same thing.
    if (i <= reportedTo) continue
    const key = mine.slice(i, i + phrase).map((x) => x.key).join(' ')
    const count = seen.reduce((n, set) => n + (set.has(key) ? 1 : 0), 0)
    if (count < repeats) continue
    const span = { start: mine[i].start, end: mine[i + phrase - 1].end }
    notes.push({
      source: 'repetition',
      span,
      slice: text.slice(span.start, span.end),
      message: `This phrasing has already been used in ${count} recent replies. Rewrite it as something new.`,
    })
    reportedTo = i + phrase - 1
  }
  return notes
}
