import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  anyOtherDrawerOpen,
  clampDrag,
  markDrawerOpen,
  settleDrawer,
  towardOpen,
  type DrawerSide,
} from './drawerSwipe'

/**
 * A phone drawer: a panel that leaves the layout at phone width, covers the screen, and tracks the
 * finger in and out from one edge. The navbar, the Story panel, the Write shelf's preview and the
 * multiplayer session panels all run on this.
 *
 * touchstart/touchmove/touchend deltas, no gesture library. `dragX` is the live pull in
 * pixels while a swipe is in flight and null the rest of the time, which is the cue to go back to
 * the CSS transition and let it ease home.
 *
 * The swipe is eligible from anywhere rather than from an edge strip. That only works when
 * nothing else in the app scrolls sideways: see the overflow rules in index.css.
 *
 * Open state is the caller's: a drawer is usually something the caller can open on its own (a
 * button, picking a Story), and two sources of truth for one panel is the bug that follows.
 */
export function useSideDrawer({
  side,
  enabled,
  swipeOpen = true,
  open,
  setOpen,
}: {
  side: DrawerSide
  /** Phone width, normally. Off leaves the panel in the layout and binds no listeners. */
  enabled: boolean
  /** Whether a swipe from closed opens it. Off for a drawer that something else opens. */
  swipeOpen?: boolean
  open: boolean
  setOpen: (next: boolean) => void
}): { dragX: number | null; className: string; style: CSSProperties } {
  const [dragX, setDragX] = useState<number | null>(null)
  // Read inside the listeners, which are bound once and would otherwise close over the first value.
  const openRef = useRef(open)
  openRef.current = open
  const setOpenRef = useRef(setOpen)
  setOpenRef.current = setOpen
  // Identity in the open-drawer registry. An object rather than a string: two Story panels would
  // share a name, and never their own ref.
  const id = useRef({})

  // While this drawer is open every other drawer stands down. A swipe that closes this one
  // cannot open one on the opposite edge at the same time.
  useEffect(() => {
    if (!enabled || !open) return
    return markDrawerOpen(id.current)
  }, [enabled, open])

  useEffect(() => {
    if (!enabled) {
      // Leaving phone width mid-gesture: drop the pull so the panel isn't left translated.
      setDragX(null)
      return
    }

    let x0 = 0
    let y0 = 0
    let t0 = 0
    let startOpen = false
    // Set on the first move that is clearly sideways. Until then the touch could still turn out to
    // be a scroll. Nothing is claimed and the page behaves normally.
    let claimed = false
    let live = false

    const width = () => window.innerWidth

    // Controls that own a sideways drag of their own. A range slider is the one that matters most:
    // the navbar is full of them (font size, line height, the skin knobs), and without this every
    // slider drag would pull the drawer instead. `data-noSwipe` is the opt-out for anything else.
    const ownsDrag = 'input[type="range"], textarea, .ReactCrop, [data-noSwipe]'

    const start = (e: TouchEvent) => {
      live = e.touches.length === 1
      if (!live) return
      // Closed and either not swipe-openable or standing down for whichever drawer is open.
      if (!openRef.current && (!swipeOpen || anyOtherDrawerOpen(id.current))) { live = false; return }
      if ((e.target as HTMLElement | null)?.closest(ownsDrag)) { live = false; return }
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
      t0 = e.timeStamp
      startOpen = openRef.current
      claimed = false
    }

    const move = (e: TouchEvent) => {
      if (!live) return
      const dx = e.touches[0].clientX - x0
      const dy = e.touches[0].clientY - y0
      if (!claimed) {
        // Vertical first means it's a scroll: hand the gesture back for the rest of the touch.
        if (Math.abs(dy) > Math.abs(dx)) { live = false; return }
        if (Math.abs(dx) < 8) return
        claimed = true
      }
      // A claimed swipe is ours, not the browser's back/forward navigation. Needs a non-passive
      // listener to be allowed to say so.
      if (e.cancelable) e.preventDefault()
      setDragX(clampDrag(startOpen, towardOpen(side, dx), width()))
    }

    const end = (e: TouchEvent) => {
      if (!live || !claimed) { live = false; return }
      live = false
      setDragX(null)
      setOpenRef.current(
        settleDrawer({
          startOpen,
          pull: towardOpen(side, e.changedTouches[0].clientX - x0),
          width: width(),
          elapsed: e.timeStamp - t0,
        }),
      )
    }

    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', end, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
    }
  }, [enabled, side, swipeOpen])

  // The drag transform is inline: it beats the .drawerOpen class while the finger is down. On
  // release it goes away and the class takes over, easing the rest of the distance.
  const style: CSSProperties =
    dragX === null
      ? {}
      : {
          transform:
            side === 'left'
              ? `translateX(calc(-100% + ${dragX}px))`
              : `translateX(calc(100% - ${dragX}px))`,
        }

  const className = [
    'sideDrawer',
    side === 'left' ? 'leftDrawer' : 'rightDrawer',
    open ? 'drawerOpen' : '',
    dragX !== null ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return { dragX, className, style }
}
