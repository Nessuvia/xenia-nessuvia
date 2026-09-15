// Extension-ful imports on purpose: checkAcrostic.ts runs this under `node --experimental-strip-types`.
import { sentences } from '../../quality/sentences.ts'
import type { AcrosticConfig } from '../postStack.ts'
import { pickLetter } from './letters.ts'

export type SlotType = 'action' | 'dialogue' | 'thought' | 'beat'

/** One line of the template. `id` is `paragraph.sentence`, both from 1. Only action and thought carry a letter. */
export interface Slot {
  id: string
  type: SlotType
  letter?: string
}

/** The reply's shape as slots, paragraph by paragraph. */
export interface AcrosticTemplate {
  paragraphs: Slot[][]
}

/** Dialogue has a quotation in it. Thought is wrapped whole in *asterisks* or _underscores_. The rest is action. */
export function classify(sentence: string): Exclude<SlotType, 'beat'> {
  if (/["“”]/.test(sentence)) return 'dialogue'
  const bare = sentence.trim().replace(/[.!?…]+$/, '')
  if (/^\*(?!\*)[\s\S]+[^*]\*$/.test(bare) || /^_[\s\S]+_$/.test(bare)) return 'thought'
  return 'action'
}

/** Sentences per paragraph. Blank lines split paragraphs. */
export function shapeOf(reply: string): number[] {
  return reply
    .split(/\n\s*\n/)
    .map((para) => sentences(para).length)
    .filter((n) => n > 0)
}

/** The capital a reply opens on, past any quote or italic marker. */
export function firstLetter(reply: string): string | undefined {
  return /\p{L}/u.exec(reply)?.[0].toUpperCase()
}

/** mulberry32: small, fast, and the same sequence for the same seed. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (n: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, n))
const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length
const sameShape = (a: number[], b: number[] | undefined) => !!b && a.length === b.length && a.every((n, i) => n === b[i])

/**
 * Draw a template from the recent replies. Pure: the same window, config and seed give the same template.
 *
 * - Shape: the window's mean paragraph count and mean sentences per paragraph, each plus or minus 1,
 *   clamped to the config. Never the previous reply's shape, unless the config allows only that one.
 * - Types: `beatSlots` beats, never last. The rest weighted by the window's action, dialogue and
 *   thought mix.
 * - Letters: action and thought only. The first one never repeats the previous reply's opening letter.
 */
export function drawAcrostic(window: string[], config: AcrosticConfig, seed: number): AcrosticTemplate {
  const rand = seeded(seed)
  const jitter = () => Math.floor(rand() * 3) - 1
  const shapes = window.map(shapeOf).filter((s) => s.length)
  const previous = shapes[shapes.length - 1]
  const midpoint = (range: [number, number]) => (range[0] + range[1]) / 2
  const meanParagraphs = shapes.length ? mean(shapes.map((s) => s.length)) : midpoint(config.paragraphs)
  const meanSentences = shapes.length ? mean(shapes.flat()) : midpoint(config.sentencesPerParagraph)

  const drawShape = () => {
    const count = clamp(Math.round(meanParagraphs) + jitter(), config.paragraphs)
    return Array.from({ length: count }, () => clamp(Math.round(meanSentences) + jitter(), config.sentencesPerParagraph))
  }
  let shape = drawShape()
  for (let tries = 0; tries < 20 && sameShape(shape, previous); tries++) shape = drawShape()
  // Still the same: nudge one paragraph by a sentence, or add or drop a paragraph, where the config allows it.
  if (sameShape(shape, previous)) {
    const [min, max] = config.sentencesPerParagraph
    const i = shape.findIndex((n) => n < max || n > min)
    if (i >= 0) shape[i] += shape[i] < max ? 1 : -1
    else if (shape.length < config.paragraphs[1]) shape.push(min)
    else if (shape.length > config.paragraphs[0]) shape.pop()
  }

  const total = shape.reduce((a, b) => a + b, 0)
  // Beats go anywhere but the last slot.
  const open = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i)
  const beats = new Set<number>()
  for (let n = 0; n < config.beatSlots && open.length; n++) beats.add(open.splice(Math.floor(rand() * open.length), 1)[0])

  const mix = { action: 0, dialogue: 0, thought: 0 }
  for (const reply of window) for (const s of sentences(reply)) mix[classify(s.text)] += 1
  if (!mix.action && !mix.dialogue && !mix.thought) Object.assign(mix, { action: 1, dialogue: 1 })
  const mixTotal = mix.action + mix.dialogue + mix.thought
  const pickType = (): Exclude<SlotType, 'beat'> => {
    const at = rand() * mixTotal
    if (at < mix.action) return 'action'
    return at < mix.action + mix.dialogue ? 'dialogue' : 'thought'
  }

  const avoid = window.length ? firstLetter(window[window.length - 1]) : undefined
  let lettered = false
  let flat = 0
  const paragraphs = shape.map((count, p) =>
    Array.from({ length: count }, (_, s): Slot => {
      const type = beats.has(flat++) ? 'beat' : pickType()
      const id = `${p + 1}.${s + 1}`
      if (type !== 'action' && type !== 'thought') return { id, type }
      const letter = pickLetter(rand, lettered ? undefined : avoid)
      lettered = true
      return { id, type, letter }
    }),
  )
  return { paragraphs }
}
