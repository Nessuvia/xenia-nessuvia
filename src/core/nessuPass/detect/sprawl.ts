// Extension-ful imports on purpose: checkSprawl.ts runs this under `node --experimental-strip-types`.
import type { Note } from './note.ts'
import type { SprawlSettings } from '../stores/settingsStore.ts'

/** Coordinating conjunctions, the joints a sprawling sentence is built from. */
const CONJUNCTIONS = new Set(['and', 'but', 'so', 'or', 'nor', 'yet', 'then'])

/** Notes per run. Past a few, the passage has one problem, not six. */
const MAX_NOTES = 4

export interface Sentence {
  text: string
  start: number
  end: number
}

/**
 * Split on terminal punctuation. Deliberately crude: a trailing "..." ends a sentence, and an
 * abbreviation mid-sentence would split one in two. A false split makes two short sentences, which
 * is the safe direction to be wrong in, since short sentences never trip this check.
 */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = []
  const re = /[^.!?]+[.!?]*/g
  for (const m of text.matchAll(re)) {
    const raw = m[0]
    const lead = raw.length - raw.trimStart().length
    const body = raw.trim()
    if (!body) continue
    out.push({ text: body, start: m.index + lead, end: m.index + lead + body.length })
  }
  return out
}

function countWords(s: string): number {
  return (s.match(/[\p{L}\p{N}']+/gu) ?? []).length
}

function countConjunctions(s: string): number {
  let n = 0
  for (const w of s.match(/[\p{L}']+/gu) ?? []) if (CONJUNCTIONS.has(w.toLowerCase())) n += 1
  return n
}

/**
 * Sentences that accrete clauses instead of ending.
 *
 * The pattern is parataxis: every clause sits at the same level, joined by commas and "and", none
 * of them subordinated, so the sentence can always take one more. Add the discourse markers of
 * speech ("right", "like", "I mean") and it looks like a person talking rather than as a mistake,
 * which is exactly why it survives a read-through.
 *
 * This cannot be a rule. A Grammar Hammer pattern matches parts of speech and a free-text rule
 * matches words; this one counts, and what makes a sentence sprawl is how many joints it has rather
 * than which words fill them.
 *
 * It also cannot be left to the burstiness rule, which measures variance in sentence length and
 * reads a passage of very short narration around one fifty-word chain as excellently varied. That
 * distribution is bimodal, not varied, and variance cannot tell the two apart.
 */
export function findSprawl(text: string, settings: SprawlSettings): Note[] {
  if (!settings.enabled) return []
  const maxWords = Math.max(10, Math.floor(settings.maxWords))
  const maxCommas = Math.max(1, Math.floor(settings.maxCommas))
  const maxConjunctions = Math.max(1, Math.floor(settings.maxConjunctions))

  const notes: Note[] = []
  for (const s of sentences(text)) {
    if (notes.length >= MAX_NOTES) break

    const words = countWords(s.text)
    // A short sentence cannot sprawl however it is punctuated, and checking one only produces
    // noise on dialogue like "No, wait, stop."
    if (words < 20) continue

    const commas = (s.text.match(/,/g) ?? []).length
    const conjunctions = countConjunctions(s.text)

    const reasons: string[] = []
    if (words > maxWords) reasons.push(`${words} words`)
    if (commas > maxCommas) reasons.push(`${commas} commas`)
    if (conjunctions > maxConjunctions) reasons.push(`${conjunctions} coordinating conjunctions`)
    if (reasons.length === 0) continue

    notes.push({
      source: 'sprawl',
      span: { start: s.start, end: s.end },
      slice: s.text,
      message: `This sentence runs on: ${reasons.join(', ')}. The clauses are all joined at the same level, so it can always take one more. Break it into separate sentences, or subordinate the parts that are not the main point. Do not simply swap the commas for a longer dash.`,
    })
  }
  return notes
}
