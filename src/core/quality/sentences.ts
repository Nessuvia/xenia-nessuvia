// Extension-ful imports on purpose: the check scripts run this file's importers under
// `node --experimental-strip-types`.

export interface Sentence {
  text: string
  start: number
  end: number
}

/**
 * Split on terminal punctuation. Deliberately crude: a trailing "..." ends a sentence, and an
 * abbreviation mid-sentence would split one in two. A false split makes two short sentences, which
 * is the safe direction to be wrong in for both callers. `chunks.ts` uses it to break an
 * over-long paragraph, and `score.ts` to measure sentence-length spread; neither is upset by a
 * short sentence that should have been half of a longer one.
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
