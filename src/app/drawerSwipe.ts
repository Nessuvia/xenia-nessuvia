/**
 * The arithmetic behind a phone drawer's swipe, kept apart from the listeners: the release
 * decision can be asserted without a DOM. useSideDrawer.ts owns the touch events.
 *
 * A drawer lives on one edge of the screen. Everything below works in `pull`: how far the finger
 * has moved in the direction that opens *this* drawer. That way a left drawer and a right drawer
 * share the same numbers and read the same on release. `towardOpen` is what converts a raw dx.
 */

export type DrawerSide = 'left' | 'right'

/** Past this the gesture is a fling and distance stops mattering. Pixels per millisecond. */
export const flingSpeed = 0.5

/** How much of the width a slow drag has to cross to change the drawer's state. */
export const settleFraction = 1 / 3

/** A horizontal drag in the direction that opens a drawer on this side: positive opens it. */
export function towardOpen(side: DrawerSide, dx: number): number {
  return side === 'left' ? dx : -dx
}

/**
 * How far the drawer is pulled from closed, `0…width`. A closed drawer only tracks pull toward
 * open and an open one only away; dragging the other way clamps to where it already rests rather
 * than pushing it past its own edge.
 */
export function clampDrag(startOpen: boolean, pull: number, width: number): number {
  const from = startOpen ? width : 0
  return Math.min(width, Math.max(0, from + pull))
}

export interface Settle {
  startOpen: boolean
  /** Movement in the direction that opens this drawer. See `towardOpen`. */
  pull: number
  width: number
  /** Milliseconds the touch lasted. */
  elapsed: number
}

/**
 * Where the drawer lands when the finger lifts. A flick counts on speed alone: a short sharp
 * swipe opens it. Anything slower has to drag it a third of the way across. Both directions read
 * the same, which is what makes closing feel like opening in reverse.
 */
export function settleDrawer({ startOpen, pull, width, elapsed }: Settle): boolean {
  const toward = startOpen ? -pull : pull
  // A drag the wrong way never changes the state, however fast it was.
  if (toward <= 0) return startOpen
  // elapsed can be 0 when two touch events share a timestamp, which is a fling by any reading.
  if (elapsed <= 0 || Math.abs(pull) / elapsed > flingSpeed) return !startOpen
  return toward > width * settleFraction ? !startOpen : startOpen
}

/**
 * Which drawers are open right now. Every drawer listens to the whole document, so on a screen
 * with more than one they would all answer the same swipe: the navbar opening from the left at
 * the moment a right-hand panel is swiped shut, say.
 *
 * The rule that sorts it out: closing beats opening. A drawer takes a gesture if it is the one
 * that is open, or if nothing is open at all.
 */
const openDrawers = new Set<object>()

/** Call while a drawer is open; the returned function takes it back out. */
export function markDrawerOpen(id: object): () => void {
  openDrawers.add(id)
  return () => {
    openDrawers.delete(id)
  }
}

export function anyOtherDrawerOpen(id: object): boolean {
  for (const other of openDrawers) if (other !== id) return true
  return false
}
