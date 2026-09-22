// Extension-ful imports on purpose: checkSwipes.ts runs this under `node --experimental-strip-types`.
import type { StateParse } from '../trackers/parseState.ts'
import type { AcrosticRecord } from '../agent/acrostic/parse.ts'
import type { Reading } from '../sensors/sensor.ts'

/**
 * What these functions need off a record: the selected text, the alternates, and the two arrays
 * that run parallel to them. Structural rather than `Message` because Write mode's `Block` holds
 * swipes the same way, and the arithmetic is the same arithmetic. Everything is returned as `T`, so
 * a caller gets its own type back.
 */
export interface Swipeable {
  content: string
  swipes?: string[]
  swipeIndex?: number
  reasonings?: (string | undefined)[]
  /** What the user asked for when producing each swipe. Parallel to `swipes`, holes where a swipe
   *  was a plain re-roll with nothing typed. */
  instructions?: (string | undefined)[]
  /** The text as the writing model produced it, before the agent pass worked it over. Parallel to
   *  `swipes`, a hole where the pass was off or changed nothing. Survives a reload, which the
   *  Grammar Hammer's old "show original" toggle didn't. */
  passOriginals?: (string | undefined)[]
  /** What the pass did to a swipe, in one line, parallel to `swipes`. */
  passSummaries?: (string | undefined)[]
  /** Why a stage's candidate was thrown away for a swipe, parallel to `swipes`. */
  passFailed?: (string | undefined)[]
  /** What the sensors read for each swipe, parallel to `swipes`. Holes where nothing sensed.
   *  Stored per swipe so swiping back rolls the readings back with the text. */
  passReadings?: (Reading[] | undefined)[]
  /** The `<state>` parse of each swipe, parallel to `swipes`. */
  trackerUpdates?: (StateParse | undefined)[]
  /** The acrostic behind each swipe, parallel to `swipes`. Holes where a swipe was generated normally. */
  acrostics?: (AcrosticRecord | undefined)[]
}

/** How many alternates a message has. No swipes array = the one thing it says. */
export function swipeCount(message: Swipeable): number {
  return Math.max(1, message.swipes?.length ?? 1)
}

export function swipeIndex(message: Swipeable): number {
  return message.swipeIndex ?? 0
}

/** The swipes array, seeded with the original text on first use. Swipe 0 is always what the
 *  model first said. */
function seeded(message: Swipeable): string[] {
  return message.swipes?.length ? [...message.swipes] : [message.content]
}

/**
 * A finished regeneration: the new text lands as the last swipe and becomes the selected one.
 * `null` means nothing to store, a failed request leaves the message exactly as it was.
 */
export function regenerated<T extends Swipeable>(
  message: T,
  text: string,
  reasoning?: string,
  instruction?: string,
): T | null {
  if (!text) return null
  // An untouched record (Write's Blocks start empty) has nothing worth keeping as swipe 1. The
  // first real text becomes it rather than sitting behind a blank alternate.
  const base = seeded(message)
  const swipes = [...(base.length === 1 && !base[0].trim() ? [] : base), text]
  // Reasonings are parallel to swipes: padded rather than appended to blindly, so old swipes
  // without a captured reasoning stay holes.
  const reasonings = [...(message.reasonings ?? [])]
  reasonings.length = swipes.length - 1
  reasonings.push(reasoning || undefined)
  // instructions pad the same way. A plain re-roll leaves a hole, which is the honest record: that
  // take wasn't asked to fix anything.
  const instructions = [...(message.instructions ?? [])]
  instructions.length = swipes.length - 1
  instructions.push(instruction?.trim() || undefined)
  // A fresh take hasn't been passed yet. The pass runs after this and writes its own arrays, so
  // padding them here keeps them parallel rather than one short.
  const passOriginals = [...(message.passOriginals ?? [])]
  passOriginals.length = swipes.length
  return {
    ...message,
    swipes,
    swipeIndex: swipes.length - 1,
    content: text,
    reasonings,
    instructions,
    passOriginals,
  }
}

/**
 * A finished continuation: `text` is the whole reply, the partial plus what the model just added,
 * and it replaces the selected swipe in place. A continuation isn't a new take on the message.
 * It must not become a swipe of its own; re-rolling still does that.
 *
 * Reasoning accumulates instead of replacing: both passes happened.
 */
export function continued<T extends Swipeable>(
  message: T,
  text: string,
  reasoning?: string,
): T | null {
  if (!text) return null
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  swipes[at] = text
  const reasonings = [...(message.reasonings ?? [])]
  // Pad to the swipe count first: an older message's array can be shorter than its swipes, and
  // assigning past the end would leave holes anywhere but the slot being written.
  reasonings.length = swipes.length
  if (reasoning) reasonings[at] = reasonings[at] ? `${reasonings[at]}\n\n${reasoning}` : reasoning
  return { ...message, swipes, swipeIndex: at, content: text, reasonings }
}

/** The model's reasoning for the currently selected swipe, if any was captured. */
export function reasoningFor(message: Swipeable): string | undefined {
  return message.reasonings?.[swipeIndex(message)]
}

/** The text before the agent pass, for the selected swipe, when the pass changed it. */
export function passOriginalFor(message: Swipeable): string | undefined {
  return message.passOriginals?.[swipeIndex(message)]
}

/** Why a stage's candidate was thrown away for the selected swipe, when one was. */
export function passFailedFor(message: Swipeable): string | undefined {
  return message.passFailed?.[swipeIndex(message)]
}

/** What the agent pass did to the selected swipe, in one line. Absent when it never ran on it. */
export function passSummaryFor(message: Swipeable): string | undefined {
  return message.passSummaries?.[swipeIndex(message)]
}

/**
 * Record a pass attempt against the selected swipe. `original` set means the passed text is in
 * `content` already and this is what it replaced; `failed` set means a stage's candidate was
 * thrown away and this is why.
 *
 * Written after `regenerated` rather than through it: all three arrays are padded to the swipe
 * count here, so an older message whose arrays are shorter than its swipes keeps its holes where
 * they belong instead of having them shifted.
 */
export function withPass<T extends Swipeable>(
  message: T,
  original?: string,
  failed?: string,
  summary?: string,
): T {
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  const passOriginals = [...(message.passOriginals ?? [])]
  const passFailed = [...(message.passFailed ?? [])]
  const passSummaries = [...(message.passSummaries ?? [])]
  passOriginals.length = swipes.length
  passFailed.length = swipes.length
  passSummaries.length = swipes.length
  passOriginals[at] = original
  passFailed[at] = failed
  passSummaries[at] = summary
  return { ...message, passOriginals, passFailed, passSummaries }
}

/** The sensor readings for the selected swipe, or undefined when nothing sensed. */
export function passReadingsFor(message: Swipeable): Reading[] | undefined {
  return message.passReadings?.[swipeIndex(message)]
}

/** Record what the sensors read for the selected swipe. Padded like `withPass`. */
export function withReadings<T extends Swipeable>(message: T, readings?: Reading[]): T {
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  const passReadings = [...(message.passReadings ?? [])]
  passReadings.length = swipes.length
  passReadings[at] = readings?.length ? readings : undefined
  return { ...message, passReadings }
}

/** Record the acrostic behind the selected swipe, or a hole when it was generated normally. Padded like `withPass`. */
export function withAcrostic<T extends Swipeable>(message: T, record?: AcrosticRecord): T {
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  const acrostics = [...(message.acrostics ?? [])]
  acrostics.length = swipes.length
  acrostics[at] = record
  return { ...message, acrostics }
}

/**
 * A finished pass over an existing message: the passed text replaces the selected swipe in place,
 * and `original` is what it replaced. Not a new swipe: a pass is the same take worked over,
 * and re-running it a third time still starts from `original`.
 */
export function passed<T extends Swipeable>(
  message: T,
  text: string,
  original: string,
  summary?: string,
  failed?: string,
): T {
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  swipes[at] = text
  return {
    ...withPass(
      { ...message, swipes, swipeIndex: at },
      text === original ? undefined : original,
      failed,
      summary,
    ),
    content: text,
  }
}

/**
 * Put the pre-pass text back into the selected swipe and forget what the pass produced. Returns
 * null when there's no original, so the caller can leave the record alone.
 */
export function revertPass<T extends Swipeable>(message: T): T | null {
  const original = passOriginalFor(message)
  if (original === undefined) return null
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  swipes[at] = original
  return { ...withPass({ ...message, swipes, swipeIndex: at }), content: original }
}

/**
 * Drop swipes by index. Returns null when nothing would be left, the caller deletes the message.
 * The selection slides back to the nearest surviving swipe at or before where it was.
 */
export function deletedSwipes<T extends Swipeable>(message: T, indices: number[]): T | null {
  const drop = new Set(indices)
  const swipes = seeded(message).filter((_, i) => !drop.has(i))
  if (!swipes.length) return null
  const keep = <V,>(arr: V[] | undefined) =>
    arr ? arr.filter((_, i) => !drop.has(i)) : undefined
  const before = [...drop].filter((i) => i < swipeIndex(message)).length
  const at = Math.min(Math.max(swipeIndex(message) - before, 0), swipes.length - 1)
  return {
    ...message,
    swipes,
    swipeIndex: at,
    content: swipes[at],
    reasonings: keep(message.reasonings),
    instructions: keep(message.instructions),
    passOriginals: keep(message.passOriginals),
    passSummaries: keep(message.passSummaries),
    passFailed: keep(message.passFailed),
    passReadings: keep(message.passReadings),
    trackerUpdates: keep(message.trackerUpdates),
    acrostics: keep(message.acrostics),
  }
}

/**
 * The instructions that led to the selected swipe, oldest first. Everything after `swipeIndex` is
 * left out on purpose: swiping back to an earlier take is how you drop a correction you no longer
 * want. The chain a regen sends has to stop where the selection does.
 */
export function instructionChain(message: Swipeable): string[] {
  const upTo = message.instructions?.slice(0, swipeIndex(message) + 1) ?? []
  return upTo.filter((i): i is string => !!i?.trim()).map((i) => i.trim())
}

/** Select an alternate. Out-of-range clamps rather than throwing. */
export function selectSwipe<T extends Swipeable>(message: T, index: number): T {
  const swipes = seeded(message)
  const at = Math.min(Math.max(index, 0), swipes.length - 1)
  return { ...message, swipes, swipeIndex: at, content: swipes[at] }
}
