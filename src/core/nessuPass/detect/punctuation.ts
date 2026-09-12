// Extension-ful imports on purpose: checkPunctuation.ts runs this under `node --experimental-strip-types`.
import type { PunctuationSettings } from './types.ts'
import { computeExclusions } from '../../hammer/exclusions.ts'

/**
 * The mechanical half of two rules the editing model keeps getting wrong.
 *
 * A rule telling the model not to write an em dash is trusted to hold, and it holds a good
 * fraction of the time: the editor misses one, or puts a fresh one in while fixing something else,
 * and nothing downstream looks again. These two characters need no judgment, so they are replaced
 * here instead of asked for.
 *
 * Only these two. Anything else wants a rewrite, which is what the model is for. They are settings
 * rather than rules for the same reason the sprawl counter is: turning them off is a preference
 * about mechanics, and a rule is prose handed to a model.
 */

const QUOTES: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
}

/**
 * Rewrite one dash run given the character on each side. Runs of dashes and the spaces around them
 * are the whole match, so `a — b`, `a—b` and `a --- b` all land here the same way.
 */
function replaceDash(before: string, after: string): string {
  // A range: 5-10, Tuesday-Friday. The dash is doing arithmetic, not punctuation.
  if (/\d/.test(before) && /\d/.test(after)) return '-'
  // Cut off mid-word: "I wasn't going to-" . A comma would read as a pause; the sentence just
  // stops, so the dash goes and the quote closes on the last word.
  if (after === '' || /["'\n)]/.test(after)) return ''
  // Nothing before it: an opener, a list marker. Same reasoning, other end.
  if (before === '') return ''
  return ', '
}

/**
 * Sweep a whole passage. Code spans, URLs and link targets are left alone: the same zones the
 * matchers skip, for the same reason.
 */
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

/** How much of a chunk has to wait for the next one: a dash run that may still be growing, and the
 *  spaces around it. */
function pending(text: string): number {
  let cut = text.length
  while (cut > 0 && /[ \t—–]/.test(text[cut - 1])) cut -= 1
  return cut
}

/** A stand-in for the character before the buffer, so a run at position zero still knows whether it
 *  sits between digits. Only its class matters to `replaceDash`, never the character itself. */
function contextChar(c: string): string {
  if (!c) return ''
  return /\d/.test(c) ? '0' : 'a'
}

/**
 * The same sweep over a stream.
 *
 * A dash's replacement depends on the character after it, and that character can arrive in the next
 * chunk, so the tail of each chunk is held back until enough follows it to decide. Without this the
 * fix would work on whole text and quietly miss whenever a chunk happened to end on a dash, which
 * is the failure it exists to close.
 *
 * ponytail: the exclusion scan runs per flush over the held tail only, so a code fence spanning
 * chunks is not seen and its dashes get swept. Buffer the whole reply if that ever matters.
 */
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
