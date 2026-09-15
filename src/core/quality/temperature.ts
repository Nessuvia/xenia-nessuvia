// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { arousalOf } from './arousal.ts'

/** Char ranges inside double quotes. A quote with no close on its line is just a character. */
export function quotedRanges(text: string): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch !== '"' && ch !== '“') continue
    const close = text.indexOf(ch === '"' ? '"' : '”', i + 1)
    const lineEnd = text.indexOf('\n', i + 1)
    if (close < 0 || (lineEnd >= 0 && lineEnd < close)) continue
    out.push([i, close + 1])
    i = close
  }
  return out
}

export const inRanges = (ranges: [number, number][], at: number) => ranges.some(([s, e]) => at >= s && at < e)

const words = (text: string) => text.toLowerCase().match(/[a-z']+/g) ?? []

/**
 * How heated a paragraph reads, 0 to 1. Structural signals plus mean arousal from `arousal.ts`. Valence plays no
 * part: a tender scene and a furious one both run hot.
 */
export function sceneTemperature(text: string): number {
  const ws = words(text)
  if (!ws.length) return 0
  const quoted = quotedRanges(text).reduce((n, [s, e]) => n + e - s, 0) / text.length
  const exclaims = (text.match(/!/g) ?? []).length
  const ellipses = (text.match(/\.\.\.|…/g) ?? []).length
  const caps = /\b[A-Z]{3,}\b/.test(text.replace(/\b(?:OK|TV|I)\b/g, '')) ? 1 : 0
  const lengths = text.split(/[.!?]+/).map((s) => words(s).length).filter(Boolean)
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const spread = lengths.length > 1 ? Math.sqrt(lengths.reduce((a, l) => a + (l - mean) ** 2, 0) / lengths.length) / mean : 0
  const you = ws.some((w) => w === 'you' || w === 'your') ? 1 : 0
  // Mean NRC arousal of known words. Calm narration averages about -0.35, a heated scene about +0.15.
  // No arousal term until the lexicon chunk has loaded: temperature then rests on the structural signals.
  const scores = ws.map(arousalOf).filter((v) => v !== undefined)
  const arousalMean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : -0.35
  const hot = Math.min(1, Math.max(0, (arousalMean + 0.35) / 0.5))

  const score =
    0.3 * quoted +
    0.15 * Math.min(1, exclaims / 2) +
    0.05 * Math.min(1, ellipses / 2) +
    0.1 * caps +
    0.1 * Math.min(1, spread) +
    0.05 * you +
    0.25 * hot
  return Math.min(1, score)
}
