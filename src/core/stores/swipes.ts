// Extension-ful imports on purpose: checkSwipes.ts runs this under `node --experimental-strip-types`.

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
  requestSnapshots?: (string | undefined)[]
  reasonings?: (string | undefined)[]
  /** What the user asked for when producing each swipe. Parallel to `swipes`, holes where a swipe
   *  was a plain re-roll with nothing typed. */
  instructions?: (string | undefined)[]
  /** The first-pass text, before Second Pass edited it. Parallel to `swipes`, a hole where the pass
   *  was off or nothing was flagged and the draft became the reply unchanged. This is what replaced
   *  the Grammar Hammer's old "show original" toggle, and unlike that toggle it survives a reload. */
  drafts?: (string | undefined)[]
  /** The pre-Gold-Pass text, parallel to `swipes`. See `Message.goldOriginals`; unlike `drafts`,
   *  this is text from a different connection, and both can be set on one swipe. */
  goldOriginals?: (string | undefined)[]
  /** Why Gold Pass failed or was rejected for a swipe, parallel to `swipes`. */
  goldFailed?: (string | undefined)[]
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
  snapshot?: string,
  reasoning?: string,
  instruction?: string,
  draft?: string,
): T | null {
  if (!text) return null
  // An untouched record (Write's Blocks start empty) has nothing worth keeping as swipe 1, so the
  // first real text becomes it rather than sitting behind a blank alternate.
  const base = seeded(message)
  const swipes = [...(base.length === 1 && !base[0].trim() ? [] : base), text]
  // Snapshots are parallel to swipes, so the array is padded rather than appended to blindly:
  // a message from before snapshots existed has holes, and a hole displays as unavailable.
  const requestSnapshots = [...(message.requestSnapshots ?? [])]
  requestSnapshots.length = swipes.length - 1
  requestSnapshots.push(snapshot)
  // reasonings pad the same way, old swipes without a captured reasoning stay holes.
  const reasonings = [...(message.reasonings ?? [])]
  reasonings.length = swipes.length - 1
  reasonings.push(reasoning || undefined)
  // instructions pad the same way. A plain re-roll leaves a hole, which is the honest record: that
  // take was not asked to fix anything.
  const instructions = [...(message.instructions ?? [])]
  instructions.length = swipes.length - 1
  instructions.push(instruction?.trim() || undefined)
  // drafts pad the same way. A draft identical to the text is not worth keeping: it means the pass
  // was skipped, and storing both copies would only make the UI offer a comparison with no
  // difference in it.
  const drafts = [...(message.drafts ?? [])]
  drafts.length = swipes.length - 1
  drafts.push(draft && draft !== text ? draft : undefined)
  return {
    ...message,
    swipes,
    swipeIndex: swipes.length - 1,
    content: text,
    requestSnapshots,
    reasonings,
    instructions,
    drafts,
  }
}

/**
 * A finished continuation: `text` is the whole reply, the partial plus what the model just added,
 * and it replaces the selected swipe in place. A continuation is not a new take on the message, so
 * it must not become a swipe of its own; re-rolling still does that.
 *
 * The snapshot for that swipe becomes the continuation's request, which is the one that produced the
 * text as it now stands. Reasoning accumulates instead of replacing: both passes really happened.
 */
export function continued<T extends Swipeable>(
  message: T,
  text: string,
  snapshot?: string,
  reasoning?: string,
): T | null {
  if (!text) return null
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  swipes[at] = text
  const requestSnapshots = [...(message.requestSnapshots ?? [])]
  const reasonings = [...(message.reasonings ?? [])]
  // Pad to the swipe count first: an older message's arrays can be shorter than its swipes, and
  // assigning past the end would leave holes anywhere but the slot being written.
  requestSnapshots.length = swipes.length
  reasonings.length = swipes.length
  if (snapshot) requestSnapshots[at] = snapshot
  if (reasoning) reasonings[at] = reasonings[at] ? `${reasonings[at]}\n\n${reasoning}` : reasoning
  return { ...message, swipes, swipeIndex: at, content: text, requestSnapshots, reasonings }
}

/** The request that produced the currently selected swipe, if it was kept. */
export function snapshotFor(message: Swipeable): string | undefined {
  return message.requestSnapshots?.[swipeIndex(message)]
}

/** The model's reasoning for the currently selected swipe, if any was captured. */
export function reasoningFor(message: Swipeable): string | undefined {
  return message.reasonings?.[swipeIndex(message)]
}

/** The pre-Second-Pass text for the currently selected swipe, when the pass actually changed it. */
export function draftFor(message: Swipeable): string | undefined {
  return message.drafts?.[swipeIndex(message)]
}

/** The pre-Gold-Pass text for the selected swipe, when a rewrite replaced it. */
export function goldOriginalFor(message: Swipeable): string | undefined {
  return message.goldOriginals?.[swipeIndex(message)]
}

/** Why Gold Pass did not replace the selected swipe, when it tried and could not. */
export function goldFailedFor(message: Swipeable): string | undefined {
  return message.goldFailed?.[swipeIndex(message)]
}

/**
 * Record a Gold Pass attempt against the selected swipe. `original` set means the rewrite is in
 * `content` already and this is what it replaced; `failed` set means it isn't and this is why.
 *
 * Written after `regenerated` rather than through it: both arrays are padded to the swipe count
 * here, so an older message whose arrays are shorter than its swipes keeps its holes where they
 * belong instead of having them shifted.
 */
export function withGold<T extends Swipeable>(
  message: T,
  original?: string,
  failed?: string,
): T {
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  const goldOriginals = [...(message.goldOriginals ?? [])]
  const goldFailed = [...(message.goldFailed ?? [])]
  goldOriginals.length = swipes.length
  goldFailed.length = swipes.length
  goldOriginals[at] = original
  goldFailed[at] = failed
  return { ...message, goldOriginals, goldFailed }
}

/**
 * A finished Gold Pass rewrite of an existing message: the rewrite replaces the selected swipe in
 * place, and `original` is what it replaced. Not a new swipe, a rewrite is the same take in a
 * different voice, and re-running it a third time still starts from `original`.
 */
export function goldRewritten<T extends Swipeable>(message: T, rewrite: string, original: string): T {
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  swipes[at] = rewrite
  return {
    ...withGold({ ...message, swipes, swipeIndex: at }, original, undefined),
    content: rewrite,
  }
}

/**
 * Put the pre-Gold-Pass text back into the selected swipe and forget the rewrite. Returns null when
 * there is no original, so the caller can leave the record alone.
 */
export function revertGold<T extends Swipeable>(message: T): T | null {
  const original = goldOriginalFor(message)
  if (original === undefined) return null
  const swipes = seeded(message)
  const at = Math.min(swipeIndex(message), swipes.length - 1)
  swipes[at] = original
  return { ...withGold({ ...message, swipes, swipeIndex: at }, undefined, undefined), content: original }
}

/**
 * Drop swipes by index. Returns null when nothing would be left, the caller deletes the message.
 * The selection slides back to the nearest surviving swipe at or before where it was.
 */
export function deletedSwipes<T extends Swipeable>(message: T, indices: number[]): T | null {
  const drop = new Set(indices)
  const swipes = seeded(message).filter((_, i) => !drop.has(i))
  if (!swipes.length) return null
  const keep = (arr: (string | undefined)[] | undefined) =>
    arr ? arr.filter((_, i) => !drop.has(i)) : undefined
  const before = [...drop].filter((i) => i < swipeIndex(message)).length
  const at = Math.min(Math.max(swipeIndex(message) - before, 0), swipes.length - 1)
  return {
    ...message,
    swipes,
    swipeIndex: at,
    content: swipes[at],
    requestSnapshots: keep(message.requestSnapshots),
    reasonings: keep(message.reasonings),
    instructions: keep(message.instructions),
    drafts: keep(message.drafts),
    goldOriginals: keep(message.goldOriginals),
    goldFailed: keep(message.goldFailed),
  }
}

/**
 * The instructions that led to the selected swipe, oldest first. Everything after `swipeIndex` is
 * left out on purpose: swiping back to an earlier take is how you drop a correction you no longer
 * want, so the chain a regen sends has to stop where the selection does.
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
