import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'

// A preference of this browser, not of the user's data: it stays out of a backup by construction.
const key = 'nessuTavern.chatBarFolded'
const ms = 400

/**
 * Folds the roster bar above the composer into its caret button beside the persona avatar, and back.
 *
 * Fold, in two halves of the 400ms: the bar clips in from the left until only the caret is left,
 * then that rectangle slides to its slot by the avatar, which grows open as it arrives and pushes
 * the avatar left. Unfold is the same animation played in reverse.
 *
 * While moving both ends are mounted: the bar is lifted to `position: fixed` over its own spot, a
 * spacer holds the row's height (and gives it back to the message list in the second half), and
 * the slot's button stays hidden until the bar lands in it.
 */
export function useBarFold() {
  const [folded, setFolded] = useState(() => localStorage.getItem(key) === '1')
  const [moving, setMoving] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const caret = useRef<HTMLButtonElement>(null)
  const spacer = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const slotButton = useRef<HTMLButtonElement>(null)

  function save(next: boolean) {
    localStorage.setItem(key, next ? '1' : '0')
  }

  function toggle() {
    if (moving) return
    const next = !folded
    save(next)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFolded(next)
      return
    }
    // Before the commit, the slot's button is where an unfold starts. After it, both ends exist.
    const from = next ? null : slotButton.current?.getBoundingClientRect()
    flushSync(() => {
      setMoving(true)
      setFolded(next)
    })
    const b = bar.current
    const c = caret.current
    const s = slot.current
    const sb = slotButton.current
    const sp = spacer.current
    if (!b || !c || !s || !sb || !sp) {
      setMoving(false)
      return
    }
    const B = b.getBoundingClientRect()
    const C = c.getBoundingClientRect()
    const slotWidth = s.getBoundingClientRect().width
    const T = from ?? sb.getBoundingClientRect()

    // Lift the bar out of the flow over its own spot; the spacer keeps the row's height.
    Object.assign(b.style, {
      position: 'fixed',
      left: `${B.left}px`,
      top: `${B.top}px`,
      width: `${B.width}px`,
      margin: '0',
      // Over the composer it slides onto, which follows it in the DOM. Sibling order, not a tier.
      zIndex: '1',
    })
    sp.style.height = `${B.height}px`
    // Folded, the row and its flex gap are both gone. A zero-height spacer still has its gap, so the
    // spacer ends on a negative margin that eats it, and nothing jumps when it unmounts.
    const gap = parseFloat(getComputedStyle(sp.parentElement!).rowGap) || 0

    // In px, not var(--radius): a keyframe value is interpolated, and a var() in it isn't.
    const round = getComputedStyle(c).borderTopLeftRadius
    const clip = `inset(${C.top - B.top}px ${B.right - C.right}px ${B.bottom - C.bottom}px ${C.left - B.left}px round ${round})`
    const move = `translate(${T.left - C.left}px, ${T.top - C.top}px)`
    const timing: KeyframeAnimationOptions = {
      duration: ms,
      easing: 'ease-in-out',
      fill: 'both',
      direction: next ? 'normal' : 'reverse',
    }
    const animations = [
      b.animate(
        [
          { clipPath: `inset(0px 0px 0px 0px round ${round})`, transform: 'translate(0px, 0px)' },
          { clipPath: clip, transform: 'translate(0px, 0px)', offset: 0.5 },
          { clipPath: clip, transform: move },
        ],
        timing,
      ),
      sp.animate(
        [
          { height: `${B.height}px`, marginTop: '0px' },
          { height: `${B.height}px`, marginTop: '0px', offset: 0.5 },
          { height: '0px', marginTop: `${-gap}px` },
        ],
        timing,
      ),
      s.animate([{ width: '0px' }, { width: '0px', offset: 0.5 }, { width: `${slotWidth}px` }], timing),
      c.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }], timing),
    ]

    animations[0].onfinish = () => {
      flushSync(() => setMoving(false))
      for (const a of animations) a.cancel()
      b.removeAttribute('style')
    }
  }

  return { folded, moving, toggle, bar, caret, spacer, slot, slotButton }
}
