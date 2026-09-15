import { useEffect, useRef, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { RiCloseLine, RiDragMove2Line, RiExternalLinkLine } from '@remixicon/react'
import { TrackerWidgets } from '../../app/TrackerWidgets'
import { useMediaQuery } from '../../app/useMediaQuery'
import { setTrackerPanelPref, useChatTrackers, useTrackerPanelPref } from './useChatTrackers'

type Trackers = NonNullable<ReturnType<typeof useChatTrackers>>

const widgets = (t: Trackers) => (
  <TrackerWidgets
    defs={t.defs}
    values={t.values}
    onChange={t.setValue}
    css={t.character.trackerCss}
    font={t.character.trackerFont}
    scope={`trackerCard${t.character.id}`}
  />
)

/** The chat sidebar section. Shows the widgets while docked. Phones stay docked. */
export default function TrackerPanel() {
  const trackers = useChatTrackers()
  const pref = useTrackerPanelPref()
  const phone = useMediaQuery('(max-width: 700px)')
  if (!trackers) return <p className="hint">This character has no trackers.</p>

  if (pref.floating && !phone) {
    return (
      <div className="trackerPanelDocked">
        <p className="hint">Floating over the chat.</p>
        <button type="button" onClick={() => setTrackerPanelPref({ floating: false })}>
          Dock
        </button>
      </div>
    )
  }

  return (
    <div className="trackerPanelDocked">
      {widgets(trackers)}
      {!phone && (
        <button type="button" title="Float over the chat" onClick={() => setTrackerPanelPref({ floating: true })}>
          <RiExternalLinkLine size={14} />
          Pop out
        </button>
      )}
    </div>
  )
}

/** The floating panel. Mounted by the chat view. Drags by its header and resizes from the corner. */
export function TrackerFloat() {
  const trackers = useChatTrackers()
  const pref = useTrackerPanelPref()
  const phone = useMediaQuery('(max-width: 700px)')
  const box = useRef<HTMLDivElement>(null)

  // The native corner handle resizes. The size saves once the pointer lets go.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const save = () => {
      const { width, height } = el.getBoundingClientRect()
      if (Math.round(width) !== pref.w || Math.round(height) !== pref.h) {
        setTrackerPanelPref({ w: Math.round(width), h: Math.round(height) })
      }
    }
    el.addEventListener('pointerup', save)
    return () => el.removeEventListener('pointerup', save)
  })

  if (!trackers || !pref.floating || phone) return null

  // Clamped so a smaller window never strands the panel off screen.
  const x = Math.max(0, Math.min(pref.x, window.innerWidth - 120))
  const y = Math.max(0, Math.min(pref.y, window.innerHeight - 40))

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return
    const el = box.current!
    const dx = e.clientX - x
    const dy = e.clientY - y
    e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev: globalThis.PointerEvent) => {
      el.style.left = `${ev.clientX - dx}px`
      el.style.top = `${ev.clientY - dy}px`
    }
    const up = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setTrackerPanelPref({ x: ev.clientX - dx, y: ev.clientY - dy })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Portalled: a skin's backdrop-filter on an ancestor would pin a fixed box to that ancestor.
  return createPortal(
    <div
      ref={box}
      className="card trackerFloat"
      style={{ left: x, top: y, width: pref.w, height: pref.h }}
    >
      <div className="trackerFloatHeader" onPointerDown={startDrag}>
        <RiDragMove2Line size={14} />
        <span className="trackerFloatTitle">Trackers</span>
        <button
          type="button"
          className="trackerFloatDock"
          title="Dock in the sidebar"
          aria-label="Dock in the sidebar"
          onClick={() => setTrackerPanelPref({ floating: false })}
        >
          <RiCloseLine size={14} />
        </button>
      </div>
      <div className="trackerFloatBody">{widgets(trackers)}</div>
    </div>,
    document.body,
  )
}
