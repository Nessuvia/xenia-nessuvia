// Extension-ful imports on purpose: checkTriplet.ts runs this under `node --experimental-strip-types`.
import type { Note } from './note.ts'
import type { TripletSettings } from '../stores/settingsStore.ts'
import { sentences } from './sprawl.ts'

/** Notes per run. Past a few the passage has one habit, not six. */
const MAX_NOTES = 4

/**
 * Split a sentence at the commas that are actually joints, skipping commas inside quotes or
 * brackets. Dialogue is the case this exists for: "No, wait, stop." is one item, not three, and
 * counting its commas would flag every argument in the story.
 */
function items(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') quoted = !quoted
    else if (c === '(' || c === '[') depth += 1
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1)
    else if (c === ',' && !quoted && depth === 0) {
      out.push(text.slice(start, i))
      start = i + 1
    }
  }
  out.push(text.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

function countWords(s: string): number {
  return (s.match(/[\p{L}\p{N}']+/gu) ?? []).length
}

/**
 * The tricolon: a sentence built as exactly three comma-separated members.
 *
 * This is the single loudest tell in generated prose, and the one the `rule-of-three` note rule
 * keeps failing to stop. That rule asks the model to count, and a model that just wrote three
 * items does not notice it wrote three items. Counting is what a check is for.
 *
 * Exactly three is the whole test, and the reason it works is that three is the closure number:
 * the smallest count that looks like a complete survey. A room holds forty things and the model
 * hands over a tidy three, each member the same length as the last, so the sentence lands with the
 * rhythm of a summary rather than of somebody looking at something. Two items read as a pair.
 * Four read as a list that could have kept going, which is why four is allowed through here.
 *
 * Not a rule for the same reason sprawl is not: what is wrong is the count, and a pattern that
 * matched words could not see it.
 */
export function findTriplets(text: string, settings: TripletSettings): Note[] {
  if (!settings.enabled) return []

  const notes: Note[] = []
  for (const s of sentences(text)) {
    if (notes.length >= MAX_NOTES) break

    const parts = items(s.text)
    if (parts.length !== 3) continue
    // A short chain is a beat, not a survey: "She stood, turned, left." Two-word members and a
    // ten-word floor keep the check on the inventory sentences it is aimed at.
    if (parts.some((p) => countWords(p) < 2)) continue
    if (countWords(s.text) < 10) continue

    notes.push({
      source: 'triplet',
      span: { start: s.start, end: s.end },
      slice: s.text,
      message:
        'Three items in a row, the strongest tell there is. Rewrite with one, two, or four. ' +
        'Cutting to one usually helps most: pick the single detail this character would actually ' +
        'notice and let the rest of the room stay unlisted. If more than one member survives, ' +
        'break the parallel so they are not the same shape and length, and put the sentence in ' +
        'somebody\'s eyes rather than a camera\'s.',
    })
  }
  return notes
}
