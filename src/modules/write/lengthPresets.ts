// The length presets behind the Story generation screen's form dropdown. Picking one fills the
// number inputs; editing any number flips the dropdown to Custom. Nothing here is ever locked.
//
// Extension-ful imports on purpose: checkLengthPresets.ts runs this under
// `node --experimental-strip-types`.

/** One named form of prose work, and the numbers it fills in. */
export interface LengthPreset {
  id: string
  label: string
  /** Words across the whole work. */
  targetWords: number
  chapters: number
}

/**
 * PLACEHOLDER NUMBERS. These are a plausible shape, not researched publishing norms: word ranges by
 * form, typical chapter counts and words per chapter still need looking up, and the numbers below
 * should be replaced wholesale once they've been. Editing this table is the whole job; no code
 * reads anything but `targetWords` and `chapters`.
 */
export const lengthPresets: LengthPreset[] = [
  { id: 'short', label: 'Short story', targetWords: 5000, chapters: 3 },
  { id: 'novelette', label: 'Novelette', targetWords: 12500, chapters: 6 },
  { id: 'novella', label: 'Novella', targetWords: 35000, chapters: 12 },
  { id: 'novel', label: 'Novel', targetWords: 85000, chapters: 25 },
]

/** What the dropdown shows when the numbers match no preset. Not a preset: it fills nothing. */
export const customPreset = 'custom'

/** The preset a pair of numbers came from, or `customPreset` once either has been edited. Matching
 *  on the values rather than remembering the choice keeps the dropdown honest through a reload. */
export function presetFor(targetWords: number, chapters: number): string {
  const hit = lengthPresets.find((p) => p.targetWords === targetWords && p.chapters === chapters)
  return hit ? hit.id : customPreset
}
