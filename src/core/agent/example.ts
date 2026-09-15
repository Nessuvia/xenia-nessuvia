// Extension-ful imports on purpose: checkExample.ts runs this under `node --experimental-strip-types`.

/**
 * A "Words" rule written as an example sentence. Clicked words become slots that match other words;
 * the rest match as typed, with loose punctuation between them and "did not" equal to "didn't".
 * The rule compiles to regex, and a hand-edited regex parses back when it still has this shape.
 */

/** How much a slot matches. */
export type SlotSize = 'one' | 'few' | 'clause'

/** Slot size by word index into `exampleWords(find)`. A run of clicked words is one slot, sized by its first word. */
export type Slots = Record<number, SlotSize>

export const negations: [string, string][] = [
  ['will not', "won't"], ['cannot', "can't"], ['can not', "can't"], ['shall not', "shan't"],
  ['do not', "don't"], ['does not', "doesn't"], ['did not', "didn't"],
  ['is not', "isn't"], ['are not', "aren't"], ['was not', "wasn't"], ['were not', "weren't"],
  ['have not', "haven't"], ['has not', "hasn't"], ['had not', "hadn't"],
  ['would not', "wouldn't"], ['should not', "shouldn't"], ['could not', "couldn't"],
  ['must not', "mustn't"], ['need not', "needn't"],
]

const slotSource: Record<SlotSize, string> = {
  one: "[\\w'-]+",
  few: "[\\w'-]+(?:\\s+[\\w'-]+){0,3}",
  clause: '[^,.!?;\\n]+',
}
/** Between two parts: spaces, with optional punctuation. */
const sep = '[\\s,.;:!?"*]+'

export function exampleWords(find: string): string[] {
  return find.trim().split(/\s+/).filter(Boolean)
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const bare = (w: string) => w.replace(/^[^\w']+|[^\w']+$/g, '')
const contraction = (long: string, short: string) => `(?:${long.split(' ').map(escape).join('\\s+')}|${escape(short)})`

type Part = { slot: SlotSize; words: string[] } | { text: string }

function parts(find: string, slots: Slots): Part[] {
  const words = exampleWords(find)
  const out: Part[] = []
  for (let i = 0; i < words.length; i++) {
    const size = slots[i]
    if (size) {
      const run = [words[i]]
      while (slots[i + 1] && i + 1 < words.length) run.push(words[++i])
      out.push({ slot: size, words: run })
      continue
    }
    // A word that is all punctuation ("!") keeps it: there is nothing else to match.
    out.push({ text: bare(words[i]) || words[i] })
  }
  return out
}

/** The regex source for an example. Blank when nothing is left to match. */
export function exampleRegex(find: string, slots: Slots = {}): string {
  const ps = parts(find, slots)
  const body: string[] = []
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]
    if ('slot' in p) {
      body.push(slotSource[p.slot])
      continue
    }
    const next = ps[i + 1]
    const pair = next && 'text' in next && negations.find(([long]) => long === `${p.text} ${next.text}`.toLowerCase())
    if (pair) {
      body.push(contraction(...pair))
      i++
      continue
    }
    const short = negations.find(([long, s]) => s === p.text.toLowerCase() || (long === p.text.toLowerCase() && !long.includes(' ')))
    body.push(short ? contraction(...short) : escape(p.text))
  }
  if (!body.length) return ''
  // Word boundaries only beside a word character: `\b!` never matches.
  const edge = (p: Part) => ('slot' in p || /^\w|\w$/.test(p.text) ? '\\b' : '')
  return `${edge(ps[0])}${body.join(sep)}${edge(ps[ps.length - 1])}`
}

/**
 * Read a regex back into an example, or null when it no longer has the generated shape.
 * Slot words come from the previous example where the slot count still lines up; otherwise "X".
 */
export function parseExampleRegex(source: string, previous: { find: string; slots: Slots }): { find: string; slots: Slots } | null {
  const body = source.replace(/^\\b/, '').replace(/\\b$/, '')
  if (!body) return null
  const oldSlots = parts(previous.find, previous.slots).filter((p): p is { slot: SlotSize; words: string[] } => 'slot' in p)
  const words: string[] = []
  const slots: Slots = {}
  let slotAt = 0
  const pieces = body.split(sep)
  const newSlotCount = pieces.filter((piece) => Object.values(slotSource).includes(piece)).length
  for (const piece of pieces) {
    const size = (Object.keys(slotSource) as SlotSize[]).find((k) => slotSource[k] === piece)
    if (size) {
      const fill = newSlotCount === oldSlots.length ? oldSlots[slotAt].words : ['X']
      for (const w of fill) {
        slots[words.length] = size
        words.push(w)
      }
      slotAt++
      continue
    }
    const pair = negations.find(([long, short]) => contraction(long, short) === piece)
    if (pair) {
      words.push(...pair[0].split(' '))
      continue
    }
    const text = piece.replace(/\\(.)/g, '$1')
    if (!text || escape(text) !== piece || /\s/.test(text)) return null
    words.push(text)
  }
  return { find: words.join(' '), slots }
}
