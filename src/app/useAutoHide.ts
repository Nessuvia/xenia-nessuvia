import { useEffect, useState, type RefObject } from 'react'

/** Scrolled down this far in one run, the footer hides: a moment of scrolling, not a nudge. */
const hideAfter = 48
/** Any upward move past this shows it again. Small on purpose: "just a bit". */
const showAfter = 6

export interface HideState {
  hidden: boolean
  /** Downward distance since the last upward move. */
  down: number
}

/** One scroll step. Positive delta is down. Pure, for its check. */
export function stepHide(state: HideState, delta: number): HideState {
  if (delta < -showAfter) return { hidden: false, down: 0 }
  if (delta <= 0) return state
  const down = state.down + delta
  return { hidden: state.hidden || down >= hideAfter, down }
}

const shown: HideState = { hidden: false, down: 0 }

/**
 * Whether the rail's footer should hide. Everything is read at the rail with capture listeners:
 * `scroll` and `toggle` don't bubble, and the thing scrolling is the rail itself on a phone and
 * the chat or Story panel inside it on a wider screen.
 *
 * Shows again on an upward scroll, an upward wheel or swipe even when nothing can scroll (already
 * at the top), and when the last open `<details>` in the rail closes. `resetKey` changing (a new
 * screen in the rail) shows it too. `enabled` false keeps it shown.
 */
export function useAutoHide(rail: RefObject<HTMLElement | null>, resetKey: unknown, enabled: boolean): boolean {
  const [state, setState] = useState<HideState>(shown)

  useEffect(() => setState(shown), [resetKey, enabled])

  useEffect(() => {
    const el = rail.current
    if (!el || !enabled) return
    const tops = new WeakMap<EventTarget, number>()
    let touchY: number | undefined
    const step = (delta: number) => setState((s) => stepHide(s, delta))

    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement
      const top = target.scrollTop
      const last = tops.get(target)
      tops.set(target, top)
      if (last !== undefined) step(top - last)
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) step(e.deltaY)
    }
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (y === undefined || touchY === undefined) return
      // A finger moving down is a swipe up through the content.
      if (y - touchY > showAfter) {
        step(-(y - touchY))
        touchY = y
      } else if (y < touchY) touchY = y
    }
    const onToggle = () => {
      if (!el.querySelector('details[open]')) setState(shown)
    }

    el.addEventListener('scroll', onScroll, { capture: true, passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('toggle', onToggle, true)
    return () => {
      el.removeEventListener('scroll', onScroll, true)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('toggle', onToggle, true)
    }
  }, [rail, enabled])

  return enabled && state.hidden
}
