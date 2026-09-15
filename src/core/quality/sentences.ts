// Extension-ful imports on purpose: the check scripts run this file's importers under
// `node --experimental-strip-types`.

export interface Sentence {
  text: string
  start: number
  end: number
}

const terminal = /[.!?…]/
const closer = /["'”’)\]*_]/
const abbreviations = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'mt', 'jr', 'sr', 'vs', 'etc', 'e.g', 'i.e'])

/**
 * Split prose into sentences with offsets into the source.
 * A boundary is terminal punctuation, any closing quotes, brackets or asterisks, then whitespace.
 * A lowercase next word continues the sentence: `"Really?" she asked.` and `Well... maybe.` stay whole.
 * A newline always ends a sentence.
 * Known abbreviations (`Mr.`, `e.g.`) and decimals (`3.5`) never split.
 * A false split is the safer error for every caller.
 */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = []
  let start = 0
  const push = (end: number) => {
    const raw = text.slice(start, end)
    const body = raw.trim()
    if (body) {
      const lead = raw.length - raw.trimStart().length
      out.push({ text: body, start: start + lead, end: start + lead + body.length })
    }
    start = end
  }

  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\n') {
      push(i)
      i++
      continue
    }
    let single = false
    let puncStart = i
    if (ch === '"' || ch === '“') {
      // A quoted span never splits inside. An unclosed quote on the line is just a character.
      const close = text.indexOf(ch === '"' ? '"' : '”', i + 1)
      const lineEnd = text.indexOf('\n', i + 1)
      if (close < 0 || (lineEnd >= 0 && lineEnd < close)) {
        i++
        continue
      }
      i = close + 1
      if (!terminal.test(text[close - 1])) continue
    } else if (!terminal.test(ch)) {
      i++
      continue
    } else {
      while (i < text.length && terminal.test(text[i])) i++
      single = i - puncStart === 1 && ch === '.'
    }
    while (i < text.length && closer.test(text[i])) i++
    if (i < text.length && !/\s/.test(text[i])) continue
    if (single && abbreviations.has(wordBefore(text, puncStart))) continue
    let j = i
    while (j < text.length && text[j] !== '\n' && /\s/.test(text[j])) j++
    if (j < text.length && /\p{Ll}/u.test(text[j])) continue
    push(i)
  }
  push(text.length)
  return out
}

function wordBefore(text: string, at: number): string {
  const m = /[\p{L}.]+$/u.exec(text.slice(Math.max(0, at - 8), at))
  return m ? m[0].toLowerCase() : ''
}
