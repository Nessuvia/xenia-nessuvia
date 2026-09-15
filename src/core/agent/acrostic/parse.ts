// Extension-ful imports on purpose: checkAcrosticParse.ts runs this under `node --experimental-strip-types`.
import type { AcrosticTemplate } from './draw.ts'

/** What a message keeps per swipe about the acrostic behind it. The seed redraws the same template. */
export interface AcrosticRecord {
  seed: number
  template: AcrosticTemplate
  fit: ParsedAcrostic['fit']
}

export interface ParsedAcrostic {
  /** The assembled prose: found lines in template order, a space inside a paragraph, a blank line between. Never the tags. */
  text: string
  found: number
  total: number
  /** Lettered lines found, and how many of them start with their letter. Recorded, not enforced. */
  fit: { hit: number; of: number }
}

/** A tag line: `[1.2|action|M] The sentence.`, or `[2] A beat.` for the beat suggestions. The part after the id is
 *  ignored, so a garbled label still counts. */
const tagLine = /^\s*\[(\d+(?:\.\d+)?)(?:\|[^\]\n]*)?\]\s*(.*)$/

/** Lines by id from `{ "lines": [{ "id", "text" }] }`, or null when the reply isn't that. Tolerates text around the object. */
function jsonLines(reply: string): Map<string, string> | null {
  const from = reply.indexOf('{')
  const to = reply.lastIndexOf('}')
  if (from < 0 || to <= from) return null
  try {
    const parsed = JSON.parse(reply.slice(from, to + 1)) as { lines?: { id?: unknown; text?: unknown }[] }
    if (!Array.isArray(parsed.lines)) return null
    const out = new Map<string, string>()
    for (const line of parsed.lines) {
      if (typeof line?.id === 'string' && typeof line.text === 'string' && !out.has(line.id)) out.set(line.id, line.text)
    }
    return out
  } catch {
    return null
  }
}

/**
 * Lines by id from tagged text. Anything that isn't a tag line is junk and skipped, except the first
 * non-empty line after a tag left bare: a model that puts the sentence under its tag still counts.
 * The first line for an id wins.
 */
export function taggedLines(reply: string): Map<string, string> {
  const out = new Map<string, string>()
  let waiting: string | null = null
  for (const line of reply.split('\n')) {
    const tag = tagLine.exec(line)
    if (tag) {
      const text = tag[2].trim()
      waiting = text ? null : tag[1]
      if (text && !out.has(tag[1])) out.set(tag[1], text)
      continue
    }
    if (waiting && line.trim()) {
      if (!out.has(waiting)) out.set(waiting, line.trim())
      waiting = null
    }
  }
  return out
}

/** The letter a line opens on, past quotes and italic markers. */
const opening = (text: string) => /\p{L}/u.exec(text)?.[0].toUpperCase()

/** Fill the template from a reply. Missing lines drop out, and a paragraph with none left drops too. */
export function parseAcrostic(reply: string, template: AcrosticTemplate): ParsedAcrostic {
  const lines = jsonLines(reply) ?? taggedLines(reply)
  let found = 0
  let total = 0
  const fit = { hit: 0, of: 0 }
  const paragraphs: string[] = []
  for (const slots of template.paragraphs) {
    const texts: string[] = []
    for (const slot of slots) {
      total += 1
      const text = lines.get(slot.id)?.trim()
      if (!text) continue
      found += 1
      texts.push(text)
      if (slot.letter) {
        fit.of += 1
        if (opening(text) === slot.letter) fit.hit += 1
      }
    }
    if (texts.length) paragraphs.push(texts.join(' '))
  }
  return { text: paragraphs.join('\n\n'), found, total, fit }
}

/** At least half the lines came back. Below that the caller retries once, then generates normally. */
export function parsedEnough(parsed: ParsedAcrostic): boolean {
  return parsed.total > 0 && parsed.found * 2 >= parsed.total
}
