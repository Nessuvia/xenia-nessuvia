/** Who holds the turn. Undefined when the order is empty. */
export function holder(order: string[], turnIndex: number): string | undefined {
  if (!order.length) return undefined
  return order[turnIndex]
}

/** The next index, wrapping. Returns 0 for an empty order rather than -1 or NaN. */
export function advance(order: string[], turnIndex: number): number {
  if (!order.length) return 0
  const count = order.length
  return (((turnIndex + 1) % count) + count) % count
}

/**
 * Move a participant to a new position. Returns a new array; does not mutate.
 * An out-of-range `from` or `to` is clamped rather than throwing.
 */
export function reorder(order: string[], from: number, to: number): string[] {
  const count = order.length
  if (count === 0) return []

  const fromClamped = Math.min(Math.max(0, from), count - 1)
  const toClamped = Math.min(Math.max(0, to), count - 1)

  const result = [...order]
  const removed = result.splice(fromClamped, 1)[0]
  result.splice(toClamped, 0, removed)
  return result
}

/**
 * Drop a participant and return the surviving order alongside the corrected cursor.
 * Removing the holder leaves the cursor pointing at whoever now occupies that slot: the turn
 * passes to the next person rather than skipping them. Removing someone earlier in the order
 * shifts the cursor back by one, and the holder does not change.
 */
export function removeParticipant(
  order: string[],
  turnIndex: number,
  id: string,
): { order: string[]; turnIndex: number } {
  const result = [...order]
  const index = result.indexOf(id)

  if (index === -1) {
    return { order: order, turnIndex }
  }

  result.splice(index, 1)

  if (!result.length) {
    return { order: result, turnIndex: 0 }
  }

  let newTurnIndex = turnIndex
  if (index < turnIndex && turnIndex < result.length) {
    newTurnIndex -= 1
  } else if (index === turnIndex && turnIndex >= result.length) {
    newTurnIndex = 0
  }

  return { order: result, turnIndex: newTurnIndex }
}

/** Append a participant. A duplicate id is ignored. Returns a new array. */
export function addParticipant(order: string[], id: string): string[] {
  if (order.includes(id)) return [...order]
  return [...order, id]
}
