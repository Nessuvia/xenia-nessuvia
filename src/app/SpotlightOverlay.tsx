import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useMediaQuery } from './useMediaQuery'
import './spotlight.css'

export type Side = 'left' | 'right' | 'top' | 'bottom'
export type Dock = 'top' | 'bottom'

// The margin the box keeps off the viewport edge.
const gap = 16

/** How far the fingertip stops short of the highlighted element. */
const tipGap = 8

/** The pointer art. Exported so a host can warm it before the overlay first renders. */
export const handSrc = '/pointer.png'
const handSize = 64

// How much room a hand needs beside the target: its own length, plus the gap it leaves off the
// target. Only the side the hand is standing on has to reserve this; the box hugs the target with
// the ordinary gap everywhere else.
const handRoom = handSize + tipGap

// The art points up. Pointing up is the readable pose: the hand goes under the target and only
// flips to pointing down when there is no room under it. This is independent of which side the box
// landed on: a hand under the target still reads as pointing at it with the box off to the left.
const handTurn = { up: 0, down: 180 }

// The fingertip sits at 97,15 in the 256px art: 24,4 at the size it renders, which is -8,-28
// from the image centre. Placement runs backwards from that: the tip goes where it should point,
// and the image is positioned around it.
const tipFromCentre = { up: { x: -8, y: -28 }, down: { x: 8, y: 28 } }

interface Props {
  /** CSS selector for the element to spotlight. Omitted means a centred box and no cutout. */
  target?: string
  /** Preferred side for the box on desktop. Ignored when there is no room on that side. */
  side?: Side
  /** Forces the phone dock edge. Without it the edge flips away from the target. */
  dock?: Dock
  /** The selector matched nothing. A tour skips the step; a tutorial has to say it is stuck. */
  onMissingTarget?(): void
  /** Click on the dim, outside the box. */
  onOverlayClick?(): void
  /**
   * Bump when the box contents change without the target changing. The box is placed from its own
   * measured height, and `children` cannot be a dependency: a new element object every render
   * would re-measure forever.
   */
  revision?: string | number
  /** Box contents. The box itself, its size and its position, belong to the overlay. */
  children: ReactNode
}

/**
 * The dim, the cutout, the hand and the box that holds a step's copy. Two engines render through
 * it: the passive tour and the gated tutorial. It owns geometry and nothing else. A caller's
 * only job is to say what to point at and what to put in the box.
 */
export default function SpotlightOverlay({ target, side, dock, onMissingTarget, onOverlayClick, revision, children }: Props) {
  const phone = useMediaQuery('(max-width: 700px)')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)
  const [hand, setHand] = useState<{ left: number; top: number; rot: number } | null>(null)
  const [dockEdge, setDockEdge] = useState<Dock>('bottom')
  const boxRef = useRef<HTMLDivElement>(null)

  // Find the target, put it on screen, then measure it.
  useEffect(() => {
    if (!target) {
      setRect(null)
      return
    }
    const el = document.querySelector(target)
    if (!el) {
      onMissingTarget?.()
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const measure = () => setRect(el.getBoundingClientRect())
    const frame = requestAnimationFrame(measure)
    // Capture phase: the scroll happens inside whichever pane owns the target, not on window.
    window.addEventListener('scroll', measure, { capture: true, passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [target, onMissingTarget])

  // Place the box once its own size is known. Measured rather than assumed: the copy sets the
  // height, and a two-line step and a five-line one want different sides.
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el || !rect) {
      setBox(null)
      setHand(null)
      return
    }
    const w = el.offsetWidth
    const h = el.offsetHeight

    // On a phone the box docks to an edge, and the edge flips away from the target: a target up top
    // gets the box at the bottom. Otherwise the instructions cover the field they are about.
    const edge: Dock = dock ?? (rect.top + rect.height / 2 < window.innerHeight / 2 ? 'bottom' : 'top')
    setDockEdge(edge)

    const room: Record<Side, number> = {
      right: window.innerWidth - rect.right,
      left: rect.left,
      bottom: window.innerHeight - rect.bottom,
      top: rect.top,
    }
    // Only the side the hand stands on has to make room for it. The docked box takes one edge of
    // the screen: on a phone the room on that side ends where the box starts.
    const floor = window.innerHeight - (phone && edge === 'bottom' ? h : 0) - gap
    const ceiling = (phone && edge === 'top' ? h : 0) + gap
    const handUp = rect.bottom + handRoom <= floor || rect.top - handRoom < ceiling
    const handSide: Side = handUp ? 'bottom' : 'top'
    const offset = (s: Side) => (s === handSide ? handRoom : gap)
    const needed: Record<Side, number> = {
      right: w + offset('right'),
      left: w + offset('left'),
      top: h + offset('top'),
      bottom: h + offset('bottom'),
    }
    const sides: Side[] = ['right', 'left', 'bottom', 'top']
    const chosen =
      side && room[side] >= needed[side]
        ? side
        : (sides.find((s) => room[s] >= needed[s]) ??
          sides.reduce((best, s) => (room[s] - needed[s] > room[best] - needed[best] ? s : best)))

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))
    const d = offset(chosen)
    const top =
      chosen === 'top' ? rect.top - h - d : chosen === 'bottom' ? rect.bottom + d : rect.top + rect.height / 2 - h / 2
    const left =
      chosen === 'left' ? rect.left - w - d : chosen === 'right' ? rect.right + d : rect.left + rect.width / 2 - w / 2

    setBox(
      phone
        ? null
        : {
            top: clamp(top, gap, window.innerHeight - h - gap),
            left: clamp(left, gap, window.innerWidth - w - gap),
          },
    )

    // The fingertip stops just short of the target and lines up with its centre.
    const pose = handUp ? 'up' : 'down'
    const tipX = clamp(rect.left + rect.width / 2, gap + handSize / 2, window.innerWidth - gap - handSize / 2)
    const tipY = handUp ? rect.bottom + tipGap : rect.top - tipGap
    const tip = tipFromCentre[pose]
    setHand({ left: tipX - tip.x - handSize / 2, top: tipY - tip.y - handSize / 2, rot: handTurn[pose] })
  }, [rect, phone, side, dock, revision])

  const anchored = !phone && !!target
  const mode = phone
    ? dockEdge === 'top'
      ? 'spotlightBoxDockedTop'
      : 'spotlightBoxDockedBottom'
    : target
      ? 'spotlightBoxAnchored'
      : 'spotlightBoxCentered'

  return (
    <div className="spotlightOverlay" onClick={onOverlayClick}>
      {/* A centred step has no rect: the cutout collapses to nothing in the middle of the
          screen and its 9999px shadow dims everything. */}
      <div
        className="spotlightCutout"
        style={{
          top: rect?.top ?? window.innerHeight / 2,
          left: rect?.left ?? window.innerWidth / 2,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        }}
      />

      {/* Outside the box, and before it in the DOM: the wrist end passes behind the box instead
          of painting on top of it. */}
      {hand && (
        <img
          className="spotlightHand"
          src={handSrc}
          alt=""
          style={{ top: hand.top, left: hand.left, transform: `rotate(${hand.rot}deg)` }}
        />
      )}

      <div
        ref={boxRef}
        className={`spotlightBox ${mode}`}
        style={anchored ? { top: box?.top ?? 0, left: box?.left ?? 0, visibility: box ? 'visible' : 'hidden' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
