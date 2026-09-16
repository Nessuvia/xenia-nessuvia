// Extension-ful imports on purpose: checkSnapshots.ts runs this under `node --experimental-strip-types`.
import { swipeIndex } from './swipes.ts'

/**
 * The request behind each swipe, for the prompt inspector. Held in memory for the session and never
 * stored: a snapshot is the whole prompt, up to ~256 KB per swipe, and it went into every message
 * row, every sync push and every backup. A reload forgets them.
 *
 * Keyed by message id, parallel to that message's swipes, holes where nothing was captured.
 * ponytail: entries for deleted messages stay until reload. Dexie ids are not reused, so they never
 * show up on the wrong message.
 */
const byMessage = new Map<number, (string | undefined)[]>()

export function rememberSnapshot(messageId: number, index: number, snapshot?: string) {
  if (!snapshot) return
  const list = byMessage.get(messageId) ?? []
  list[index] = snapshot
  byMessage.set(messageId, list)
}

/** The request that produced the selected swipe, if this session saw it. */
export function snapshotFor(message: { id?: number; swipeIndex?: number }): string | undefined {
  return message.id === undefined ? undefined : byMessage.get(message.id)?.[swipeIndex(message as { content: string })]
}

/** Drop swipes by index so the rest stay lined up, matching `deletedSwipes`. */
export function forgetSwipes(messageId: number, indices: number[]) {
  const list = byMessage.get(messageId)
  if (!list) return
  const drop = new Set(indices)
  byMessage.set(messageId, Array.from(list, (s) => s).filter((_, i) => !drop.has(i)))
}
