// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { seeded } from './acrostic/draw.ts'
import type { FlowStyle } from './flowRules.ts'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** FNV-1a. A reply's seed: the same text draws the same window, so a pass run again aims the same way. */
// ponytail: seeded by text, not message id. runAgent never sees the id; a re-run passes the stored
// original, which is the same text.
export function textSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/**
 * The narration range one reply is held to. Noise 0 is the stack's range as set. Above 0 the range
 * keeps its width and slides by up to `noise` times that width either way, so consecutive replies
 * don't all settle on the same shape. A range of zero width slides as if it were 10 points wide.
 */
export function drawNarrationWindow(style: FlowStyle, seed: number): [number, number] {
  const [min, max] = style.narrationRatio
  const noise = style.noise ?? 0
  if (noise <= 0) return [min, max]
  const shift = (seeded(seed)() * 2 - 1) * noise * Math.max(max - min, 0.1)
  return [clamp01(min + shift), clamp01(max + shift)]
}

export interface ShapeParagraph {
  narration: number
  dialogue: number
  dialogueFirst: boolean
}

/**
 * A made-up reply's shape for the visualizer: the window this seed draws, a ratio inside it, and
 * paragraphs split between narration and dialogue words to match. The same draw the pass makes.
 */
export function previewShape(style: FlowStyle, seed: number, words = 120, paragraphs = 4) {
  const window = drawNarrationWindow(style, seed)
  const rand = seeded(seed ^ 0x9e3779b9)
  const ratio = window[0] + rand() * (window[1] - window[0])
  const per = Math.round(words / paragraphs)
  const shape: ShapeParagraph[] = Array.from({ length: paragraphs }, () => {
    const narration = Math.min(per, Math.max(0, Math.round(per * ratio + (rand() * 2 - 1) * per * 0.15)))
    return { narration, dialogue: per - narration, dialogueFirst: rand() < 0.5 }
  })
  return { window, ratio, shape }
}
