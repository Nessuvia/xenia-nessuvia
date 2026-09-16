// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
// NRC VAD Lexicon v2.1, Saif M. Mohammad, National Research Council Canada. Unigrams only.

/** Valence (unpleasant to pleasant), arousal (calm to excited), dominance (weak to in control). Each -1 to 1. */
export interface Vad {
  v: number
  a: number
  d: number
}

let lexicon: Map<string, Vad> | null = null
let loading: Promise<void> | null = null

/** Fetch the lexicon chunk once. Safe to call on every run. */
export function loadVad(): Promise<void> {
  loading ??= import('./vadData.ts').then(({ default: data }) => {
    lexicon = new Map(
      data.split('\n').map((line) => {
        const [word, v, a, d] = line.split(' ')
        return [word, { v: Number(v) / 100, a: Number(a) / 100, d: Number(d) / 100 }]
      }),
    )
  })
  return loading
}

export const vadLoaded = () => lexicon !== null

/**
 * A word's scores, or undefined when unknown or not loaded yet. NRC lists base forms, so an
 * inflection falls back to its stem: "screamed" to "scream".
 */
// ponytail: suffix stripping, no real stemmer. "ran" and "stopped" miss. Add an irregular map when it matters.
export function vadOf(word: string): Vad | undefined {
  if (!lexicon) return undefined
  const w = word.toLowerCase()
  const hit = lexicon.get(w)
  if (hit) return hit
  for (const stem of [w.replace(/(?:ed|ing|s|es)$/, ''), w.replace(/(?:d|ing)$/, '') + 'e', w.replace(/ing$/, 'e')]) {
    const v = lexicon.get(stem)
    if (v) return v
  }
  return undefined
}

/** Arousal alone, -1 to 1. What the style checks' scene temperature reads. */
export const arousalOf = (word: string): number | undefined => vadOf(word)?.a

/** Mean scores over the known words of a text, or undefined when it has none or the lexicon isn't loaded. */
export function textVad(text: string): Vad | undefined {
  const scores = (text.match(/[\p{L}']+/gu) ?? []).map(vadOf).filter((s) => s !== undefined)
  if (!scores.length) return undefined
  const mean = (axis: keyof Vad) => scores.reduce((sum, s) => sum + s[axis], 0) / scores.length
  return { v: mean('v'), a: mean('a'), d: mean('d') }
}
