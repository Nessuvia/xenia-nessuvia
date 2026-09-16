// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { quotedRanges } from '../quality/temperature.ts'
import { narrationWords } from './flow/words.ts'

/** Words the dialogue pass may add around one new line of speech: a tag and a short beat. */
const maxNewNarration = 8

const numberWords = /^(?:\d[\d,.]*|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|first|second|third|half)$/i
const negation = /\b(?:not|no|never|nothing|nobody|none|nowhere|neither|nor)\b|n['’]t\b/gi

function lines(text: string): string[] {
  return quotedRanges(text).map(([s, e]) => text.slice(s + 1, e - 1))
}

/** Is `small` an in-order subsequence of `big`? */
function subsequence(small: string[], big: string[]): boolean {
  let j = 0
  for (const word of big) if (j < small.length && word === small[j]) j++
  return j === small.length
}

/**
 * Names and numbers in speech: what a line of dialogue commits to that rewording must not drop. A
 * name is a capitalized word that doesn't open its sentence ("I" aside).
 */
function facts(speech: string[]): string[] {
  return speech.flatMap((line) =>
    [...line.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’,.]*/gu)].flatMap((m) => {
      const word = m[0].replace(/[,.]+$/, '')
      const opens = m.index === 0 || /[.!?]\s*$/.test(line.slice(0, m.index))
      if (numberWords.test(word)) return [word.toLowerCase()]
      return /^\p{Lu}/u.test(word) && !opens && word !== 'I' ? [word] : []
    }),
  )
}

/**
 * Whether a dialogue pass result keeps what the reply commits to while rewording its speech:
 * - narration comes back word for word, plus at most a tag and a beat for one new line
 * - every line survives, and at most one is added
 * - names and numbers said aloud are still said
 * - no refusal turns into agreement: negations and questions don't go down
 * ponytail: counts, not meaning. "I can't" reworded to "no way" passes; "I won't" to "sure, why not"
 * passes too, since "not" survives. Tighten per line if that shows up live.
 */
export function keepsCommitments(before: string, after: string): boolean {
  const oldLines = lines(before)
  const newLines = lines(after)
  if (newLines.length < oldLines.length || newLines.length > oldLines.length + 1) return false

  const oldNarration = narrationWords(before, 0, before.length, quotedRanges(before)).map((w) => w.toLowerCase())
  const newNarration = narrationWords(after, 0, after.length, quotedRanges(after)).map((w) => w.toLowerCase())
  const extra = newNarration.length - oldNarration.length
  const allowed = newLines.length > oldLines.length ? maxNewNarration : 0
  if (extra < 0 || extra > allowed || !subsequence(oldNarration, newNarration)) return false

  const said = new Set(facts(newLines).map((f) => f.toLowerCase()))
  if (!facts(oldLines).every((f) => said.has(f.toLowerCase()))) return false

  const count = (speech: string[], pattern: RegExp) => speech.reduce((n, line) => n + (line.match(pattern)?.length ?? 0), 0)
  return count(newLines, negation) >= count(oldLines, negation) && count(newLines, /\?/g) >= count(oldLines, /\?/g)
}
