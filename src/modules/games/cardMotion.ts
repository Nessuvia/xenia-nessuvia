/**
 * The gate between the cards and the game loop.
 *
 * An arrival takes a couple of seconds and the loop that writes events has no idea: without this it
 * appends the next batch a beat later, React rerenders, and the card in the air is replaced by a
 * card in its final place. The board reports what it started and the store waits for it.
 *
 * The board is still the only thing that knows about motion. This is a mailbox, not a scheduler:
 * nothing here decides what animates or for how long.
 */

/** The part of `Animation` this needs. Structural so a check can hand it a fake. */
export interface Settleable {
  playState: string
  finished: Promise<unknown>
}

let running: Settleable[] = []

/** Called by the board with everything it just started. */
export function noteMotion(animations: Settleable[]) {
  // Dropping the finished ones keeps the list from growing for the length of a game. Waiting on a
  // finished animation would resolve at once anyway. Nothing is lost by forgetting it.
  running = [...running, ...animations].filter((a) => a.playState !== 'finished' && a.playState !== 'idle')
}

/**
 * Resolves when every noted animation has finished, been cancelled, or run past `timeoutMs`. The
 * timeout is the point: a wedged animation must cost a slow turn, never a game that stops.
 */
export async function motionSettled(timeoutMs = 4000): Promise<void> {
  const waiting = running
  running = []
  if (waiting.length === 0) return
  // A cancelled animation rejects `finished`, and a cancel is a settle for our purposes: whatever
  // cancelled it did so, the board moved on.
  const all = Promise.all(waiting.map((a) => a.finished.then(() => {}, () => {}))).then(() => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  const capped = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([all, capped])
  clearTimeout(timer)
}

/**
 * Whether a card is still moving. Split out here, checkable without a DOM: the board
 * hands it `element.getAnimations()`.
 *
 * A card in flight cannot be measured. `getBoundingClientRect` reports only the transform an
 * animation is applying. A commit that lands mid-arrival reads the card somewhere between the
 * deck and the hand and plays the difference against its real place.
 */
export function isFlying(animations: { playState: string }[]): boolean {
  return animations.some((a) => a.playState === 'running' || a.playState === 'paused')
}

/** Drops anything outstanding. Called when a board unmounts. A half-played hand cannot make the
 *  next game wait on it. */
export function forgetMotion() {
  running = []
}
