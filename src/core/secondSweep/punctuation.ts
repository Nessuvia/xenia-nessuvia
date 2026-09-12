import type { PunctuationSettings } from './detectSettings.ts'
import { computeExclusions } from '../hammer/exclusions.ts'

/**
 * Replaces em dashes and curly quotes with plain equivalents.
 * Dashes and quotes are controlled by separate settings.
 */

const QUOTES: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
}

/** Rewrites one dash run given the character on each side. */
function replaceDash(before: string, after: string): string {
  // Range: 5-10, Tuesday-Friday.
  if (/\d/.test(before) && /\d/.test(after)) return '-'
  // Cut off mid-word: "I wasn't going to-".
  if (after === '' || /["'\n)]/.test(after)) return ''
  // Opener or list marker: nothing before it.
  if (before === '') return ''
  return ', '
}

/** Sweeps a whole passage. Leaves code spans, URLs and link targets alone. */
export function normalizePunctuation(text: string, settings: PunctuationSettings): string {
  const { dashes, quotes } = settings
  if (!dashes && !quotes) return text

  const exclusions = computeExclusions(text)
  const safe = (start: number, end: number) =>
    !exclusions.some(([from, to]) => start < to && end > from)

  let out = text
  if (dashes) {
    const src = out
    out = src.replace(/[ \t]*[—–]+[ \t]*/g, (m, index: number) => {
      if (!safe(index, index + m.length)) return m
      return replaceDash(src[index - 1] ?? '', src[index + m.length] ?? '')
    })
  }
  if (quotes) {
    const src = out
    out = src.replace(/[‘’“”…]/g, (m, index: number) => (safe(index, index + 1) ? QUOTES[m] : m))
  }
  return out
}

/** Length of `text` with any trailing dash run and surrounding spaces removed. */
function pending(text: string): number {
  let cut = text.length
  while (cut > 0 && /[ \t—–]/.test(text[cut - 1])) cut -= 1
  return cut
}

/** Stand-in character for the position before the buffer. Only its digit/non-digit class matters. */
function contextChar(c: string): string {
  if (!c) return ''
  return /\d/.test(c) ? '0' : 'a'
}

/** The same sweep applied over a stream of chunks. Holds back the tail of each chunk until the
 *  next character needed to decide a dash's replacement arrives. */
export function punctuationStream(settings: PunctuationSettings) {
  let held = ''
  let prev = ''

  /** Normalize `text` as though `prev` came before it, then drop the stand-in back off. */
  function run(text: string): string {
    const lead = contextChar(prev)
    return normalizePunctuation(lead + text, settings).slice(lead.length)
  }

  return {
    push(chunk: string): string {
      held += chunk
      const cut = pending(held)
      const emit = run(held.slice(0, cut))
      if (cut > 0) prev = held[cut - 1]
      held = held.slice(cut)
      return emit
    },
    flush(): string {
      const emit = run(held)
      held = ''
      prev = ''
      return emit
    },
  }
}
