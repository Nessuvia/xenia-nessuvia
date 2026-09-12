import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Step, Tour as TourData } from '../core/tour/types'
import SpotlightOverlay from './SpotlightOverlay'
import { useMediaQuery } from './useMediaQuery'
import './tour.css'

export { handSrc } from './SpotlightOverlay'

interface Props {
  tour: TourData
  onClose(): void
}

export default function Tour({ tour, onClose }: Props) {
  const phone = useMediaQuery('(max-width: 700px)')
  const steps = useMemo(
    () => tour.steps.filter((s) => !s.only || (s.only === 'mobile') === phone),
    [tour, phone],
  )

  const [index, setIndex] = useState(0)
  // Which way the user was going: a step whose target has gone missing is skipped in the same
  // direction rather than bouncing back into the step they just left.
  const direction = useRef(1)

  const step: Step | undefined = steps[index]

  // An index past the last step ends the tour, in an effect rather than inside the updater: the
  // updater runs twice under StrictMode.
  const next = useCallback(() => {
    direction.current = 1
    setIndex((i) => Math.min(i + 1, steps.length))
  }, [steps.length])

  useEffect(() => {
    if (index >= steps.length) onClose()
  }, [index, steps.length, onClose])

  const back = useCallback(() => {
    direction.current = -1
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  // A step whose selector no longer matches anything is skipped: a renamed class shortens a tour,
  // it does not break the app.
  const onMissingTarget = useCallback(() => {
    if (import.meta.env.DEV) console.warn(`tour "${tour.id}" step ${index}: no element for ${step?.target}`)
    if (direction.current < 0 && index === 0) onClose()
    else if (direction.current < 0) back()
    else next()
  }, [tour.id, index, step?.target, next, back, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key === 'ArrowLeft') return back()
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back, onClose])

  if (!step) return null

  return (
    <SpotlightOverlay
      target={step.target}
      side={step.side}
      revision={index}
      onMissingTarget={onMissingTarget}
      onOverlayClick={next}
    >
      {step.body.map((p, i) => (
        <p key={i} className="tourText">{p}</p>
      ))}

      <div className="tourFoot">
        <span className="tourCount">{index + 1} / {steps.length}</span>
        <button type="button" className="tourSkip" onClick={onClose}>Close</button>
        {index > 0 && <button type="button" className="tourBack" onClick={back}>Back</button>}
        <button type="button" className="tourNext" onClick={next}>
          {index + 1 === steps.length ? 'Done' : 'Next'}
        </button>
      </div>
    </SpotlightOverlay>
  )
}
