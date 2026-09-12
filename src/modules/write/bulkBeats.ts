// Parsing the Bulk Add box into beats. Its own file rather than a helper in PlotLayout.tsx so
// checkBulkBeats.ts can run it under `node --experimental-strip-types`, which cannot parse JSX.
//
// Extension-ful imports on purpose, for the same reason.
import type { BeatWeight } from '../../core/storage/types.ts'
import { beatWeights, defaultWeight } from '../../core/prompt/beatWeights.ts'

/** One parsed entry. `length` is the raw string the input carried, not a weight. An unrecognised
 *  one is remapped by the Author rather than guessed at, and it stays as written until then. */
export interface BulkBeat {
  beat: string
  length: string
}

export interface BulkParse {
  beats: BulkBeat[]
  /** Length values that are not one of the weights, deduplicated, in the order they first appear.
   *  The dialog draws a dropdown per value and nothing is added until they are all answered. */
  unknown: string[]
  error: string
}

/**
 * The accepted shape is a JSON array of objects:
 *
 * ```
 * [{ "content": "She finds the map.", "length": "long" }]
 * ```
 *
 * `content` is the only field that has to be there, and a missing `length` is a normal beat. Any
 * other field is ignored. A bare array of strings is accepted too: the strings are the contents.
 *
 * Untrusted input, and typed by hand as often as pasted. Every field is coerced and a bad entry
 * is skipped rather than taking the whole paste down with it. The one thing that fails outright is
 * input that is not an array at all: that is a format mistake, and saying so is more use than
 * quietly adding nothing.
 */
export function parseBulkBeats(input: string): BulkParse {
  const text = input.trim()
  if (!text) return { beats: [], unknown: [], error: 'Nothing to add.' }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { beats: [], unknown: [], error: `That is not valid JSON: ${(err as Error).message}` }
  }
  if (!Array.isArray(raw)) {
    return { beats: [], unknown: [], error: 'Expected an array of beats, in square brackets.' }
  }

  const beats: BulkBeat[] = []
  const unknown: string[] = []

  for (const row of raw) {
    if (typeof row === 'string') {
      const beat = line(row)
      if (beat) beats.push({ beat, length: defaultWeight })
      continue
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const r = row as Record<string, unknown>
    const beat = line(r.content)
    if (!beat) continue

    const length = line(r.length) || defaultWeight
    if (!isWeight(length) && !unknown.includes(length)) unknown.push(length)
    beats.push({ beat, length })
  }

  if (beats.length === 0) return { beats: [], unknown: [], error: 'Nothing to add.' }
  return { beats, unknown, error: '' }
}

/** The parsed beats with their lengths resolved to weights. `mapping` answers the unknown values,
 *  keyed exactly as `unknown` listed them; anything still unanswered falls back to the default.
 *  A dialog dismissed halfway adds beats rather than losing them. */
export function mapWeights(
  beats: BulkBeat[],
  mapping: Record<string, BeatWeight> = {},
): { beat: string; weight: BeatWeight }[] {
  return beats.map(({ beat, length }) => ({
    beat,
    weight: isWeight(length)
      ? (length.toLowerCase() as BeatWeight)
      : (mapping[length] ?? defaultWeight),
  }))
}

/** Whether a length string names a weight, casing aside. */
function isWeight(length: string): boolean {
  return (beatWeights as string[]).includes(length.toLowerCase())
}

/** A field as a single-line string. A number or a boolean is written out rather than dropped;
 *  anything else (an object, an array, null) is not text and becomes nothing. */
function line(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s*\n\s*/g, ' ').trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}
