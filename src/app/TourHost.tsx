import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { tourFor } from '../core/tour/tours'
import { useTour } from '../core/stores/tourStore'
import Tour, { handSrc } from './Tour'
import './tour.css'

// Non-portable preference: whether this browser has been offered a tour. Straight to localStorage,
// no store and no Dexie table. It stays out of a backup by construction.
const seenKey = 'nessuTavern.tourSeen'

export default function TourHost() {
  const { pathname } = useLocation()
  const tour = tourFor(pathname)
  const running = useTour((s) => s.running)
  const start = useTour((s) => s.start)
  const stop = useTour((s) => s.stop)
  const [offered, setOffered] = useState(() => localStorage.getItem(seenKey) === '1')

  // Warm the hand before a tour starts. Fetched on first paint of the step it appears in, it
  // arrived a beat after the text box and the pointer popped in late.
  useEffect(() => {
    new Image().src = handSrc
  }, [])

  function markSeen() {
    localStorage.setItem(seenKey, '1')
    setOffered(true)
  }

  if (!tour) return null
  if (running) return <Tour tour={tour} onClose={stop} />
  if (offered) return null

  return (
    <div className="tourOffer">
      <p className="tourOfferText">This page has a tour.</p>
      <div className="tourOfferButtons">
        <button type="button" className="tourSkip" onClick={markSeen}>No thanks</button>
        <button type="button" className="tourNext" onClick={() => { markSeen(); start() }}>Take the tour</button>
      </div>
    </div>
  )
}
