// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
// NRC VAD Lexicon v2.1, Saif M. Mohammad, National Research Council Canada. Arousal only.

let lexicon: Map<string, number> | null = null
let loading: Promise<void> | null = null

/** Fetch the lexicon chunk once. Safe to call on every run. */
export function loadArousal(): Promise<void> {
  loading ??= import('./arousalData.ts').then(({ default: data }) => {
    lexicon = new Map(data.split('\n').map((line) => {
      const [word, score] = line.split(' ')
      return [word, Number(score) / 100]
    }))
  })
  return loading
}

export const arousalLoaded = () => lexicon !== null

/**
 * Arousal from -1 to 1, or undefined when unknown or not loaded yet. NRC lists base forms, so an
 * inflection falls back to its stem: "screamed" to "scream".
 */
// ponytail: suffix stripping, no real stemmer. "ran" and "stopped" miss. Add an irregular map when it matters.
export function arousalOf(word: string): number | undefined {
  if (!lexicon) return undefined
  const w = word.toLowerCase()
  const hit = lexicon.get(w)
  if (hit !== undefined) return hit
  for (const stem of [w.replace(/(?:ed|ing|s|es)$/, ''), w.replace(/(?:d|ing)$/, '') + 'e', w.replace(/ing$/, 'e')]) {
    const v = lexicon.get(stem)
    if (v !== undefined) return v
  }
  return undefined
}
