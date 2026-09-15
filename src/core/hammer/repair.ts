/**
 * Repair whitespace and punctuation after a span was cut from `text` between `cutStart` and
 * `cutEnd`. The caller has already removed the span; this function tidies the seam so the sentence
 * stays grammatical-looking. Table-driven in checkRepair.ts.
 *
 * Operations, applied in order:
 *  1. Collapse doubled spaces → one.
 *  2. Remove a space before , . ; : ! ? ) ] } ' ' " ".
 *  3. Remove a space after ( [ { ' ' " ".
 *  4. Collapse a doubled comma `, ,` → `,`.
 *  5. Dangling coordinating conjunction next to punctuation (e.g. `, and .` or ` and ,`):
 *     remove the conjunction and the orphaned comma.
 *  6. Empty sentence: if a terminal-punctuation run is left with no preceding word, drop it and
 *     surrounding whitespace.
 *  7. Capitalization: if the cut was sentence-initial (the char before the cut is start-of-string
 *     or follows terminal punctuation), capitalize the first surviving word.
 */
export function repairAfterCut(text: string, cutStart: number, cutEnd: number): string {
  const before = text.slice(0, cutStart)
  const after = text.slice(cutEnd)
  let wasSentenceInitial = isSentenceInitial(before)
  let out = before + after
  out = collapseSpaces(out)
  out = removeDanglingConjunction(out)
  out = fixSpaceBeforePunct(out)
  out = fixSpaceAfterOpenPunct(out)
  out = collapseDoubledComma(out)
  out = removeEmptySentence(out)
  if (wasSentenceInitial) out = capitalizeFirstWord(out, before.length)
  return out
}

/** Whole-text repair, used when multiple cuts are applied to a fresh string. */
export function repairAll(text: string): string {
  let out = text
  out = collapseSpaces(out)
  out = removeDanglingConjunction(out)
  out = fixSpaceBeforePunct(out)
  out = fixSpaceAfterOpenPunct(out)
  out = collapseDoubledComma(out)
  out = removeEmptySentence(out)
  return out
}

// A straight quote only counts as a closer when nothing word-like follows it: `said "Hi"` keeps its space.
const SPACE_BEFORE = / +([,.;:!?)\]}’”]|["'](?![\p{L}\p{N}]))/gu
const SPACE_AFTER = /([([{“‘]) +/g

function collapseSpaces(s: string): string {
  return s.replace(/ {2,}/g, ' ')
}

function fixSpaceBeforePunct(s: string): string {
  return s.replace(SPACE_BEFORE, '$1')
}

function fixSpaceAfterOpenPunct(s: string): string {
  return s.replace(SPACE_AFTER, '$1')
}

function collapseDoubledComma(s: string): string {
  return s.replace(/,\s*,/g, ',')
}

// A coordinating conjunction orphaned by the cut: `, and .` or ` and ,` or `, and ,`.
// Remove the conjunction plus the orphaned comma next to it.
const DANGLING_CONJ = [
  // ", and ." / ", but ." → "."
  /,\s+(?:and|but|or|nor|yet|so)\s+([.;:!?])/g,
  // " and ," / " but ," → ","
  /\s+(?:and|but|or|nor|yet|so)\s+,/g,
]

function removeDanglingConjunction(s: string): string {
  let out = s
  out = out.replace(DANGLING_CONJ[0], '$1')
  out = out.replace(DANGLING_CONJ[1], ',')
  return out
}

// A terminal punctuation run with only whitespace/nothing before it in its line: drop it.
const EMPTY_SENTENCE = /(^|\n)[^\S\n]*[.;:!?]+[^\S\n]*(?=\n|$)/g

function removeEmptySentence(s: string): string {
  return s.replace(EMPTY_SENTENCE, '$1')
}

function isSentenceInitial(before: string): boolean {
  const trimmed = before.replace(/\s+$/g, '')
  if (trimmed.length === 0) return true
  return /[.!?]\s*$/.test(trimmed)
}

/** Capitalize the first word starting at/after `from` (the seam after the cut). */
function capitalizeFirstWord(s: string, from: number): string {
  // Skip leading whitespace/punctuation from `from` until a letter.
  for (let i = from; i < s.length; i++) {
    const ch = s[i]
    if (/[a-z]/.test(ch)) {
      return s.slice(0, i) + ch.toUpperCase() + s.slice(i + 1)
    }
    if (/\w/.test(ch)) return s // a digit or uppercase already, leave it.
  }
  return s
}
