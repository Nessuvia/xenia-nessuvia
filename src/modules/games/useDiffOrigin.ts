import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Where a card that's new to the board came from: the zone that just lost one.
 *
 * The diff is the board's to make, because the board is the only thing that knows where it drew the
 * zones. What's not the board's business is remembering the previous state, and doing it in the
 * render body is a bug: StrictMode renders twice, the second pass sees the state it just stored,
 * the diff comes back empty and the card fades in from nowhere instead of flying off the deck.
 *
 * So the previous state is written in a layout effect, which runs once per commit. The origin is
 * handed back in a ref rather than returned, since the value belongs to the commit that hasn't
 * happened yet: call this before `useCardMotion` and its effect runs first, which is what makes the
 * ref current by the time the motion pass reads it.
 */
export function useDiffOrigin<T>(state: T, diff: (previous: T, next: T) => string | null): RefObject<string | null> {
  const previous = useRef<T | null>(null)
  const origin = useRef<string | null>(null)

  useLayoutEffect(() => {
    origin.current = previous.current === null ? null : diff(previous.current, state)
    previous.current = state
  })

  return origin
}
