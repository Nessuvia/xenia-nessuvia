// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { inRanges } from '../../quality/temperature.ts'
import type { Sentence } from '../../quality/sentences.ts'

// ponytail: a keyword list, no parse. "Her hands were full of groceries" counts as a beat too. Move to
// a POS pattern if the misses pile up.
export const bodyWord =
  /\b(?:(?:eye)?brows?|jaw|throat|chest|shoulders?|arms?|legs?|knees?|feet|face|hands?|fingers?|fists?|palms?|knuckles?|lips?|mouth|eyes|gaze|head|neck|spine|nose|breath|weight|stomach|gut|nod(?:s|ded)?|shrug(?:s|ged)?|sigh(?:s|ed)?|swallow(?:s|ed)|exhal(?:es|ed)|inhal(?:es|ed)|shift(?:s|ed)|glanc(?:es|ed)|smirk(?:s|ed)|blink(?:s|ed)|tilt(?:s|ed)|lean(?:s|ed)|look(?:s|ed)|star(?:es|ed)|fidget(?:s|ed))\b/i

const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu

/** Words in `text[start, end)` that sit outside quoted speech. */
export function narrationWords(text: string, start: number, end: number, quoted: [number, number][]): string[] {
  return [...text.slice(start, end).matchAll(wordPattern)].filter((m) => !inRanges(quoted, start + m.index)).map((m) => m[0])
}

export function wordCount(text: string): number {
  return text.match(wordPattern)?.length ?? 0
}

/** Longest sentence still read as a beat. Past it, body words are description ("Lucille looked at him, gray eyes and black hair..."). */
export const beatMaxWords = 12

/** A sentence with no speech in it. */
export function isNarration(text: string, s: Sentence, quoted: [number, number][]): boolean {
  return narrationWords(text, s.start, s.end, quoted).length === wordCount(s.text)
}

/** A short narration sentence about a body part or a small movement. */
export function isBeat(text: string, s: Sentence, quoted: [number, number][], maxWords = beatMaxWords): boolean {
  return isNarration(text, s, quoted) && wordCount(s.text) <= maxWords && bodyWord.test(s.text)
}

/** The sentence next to `i` when it is narration. A beat folds into narration; folding it into speech invents a tag. */
export function narrationNeighbour(text: string, sents: Sentence[], i: number, quoted: [number, number][]): Sentence | undefined {
  const s = sents[i]
  return s && isNarration(text, s, quoted) ? s : undefined
}
