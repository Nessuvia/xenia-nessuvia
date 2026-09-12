import { useEffect, useId, useState } from 'react'
import { useSettings } from '../core/stores/settingsStore'
import './splashScreen.css'

const REVEAL = 1500
const FADE = 500
const BUBBLES = 26

// circle positions computed at module scope: they never change, and need no useMemo.
const circles = Array.from({ length: BUBBLES }, (_, i) => {
  const a = i * 2.399963 // golden angle: the scatter fills evenly without overlapping runs
  const rad = 46 * Math.sqrt(i / BUBBLES)
  return {
    cx: 50 + rad * Math.cos(a),
    cy: 50 + rad * Math.sin(a),
    r: 14 + 10 * (i / BUBBLES),
    delay: (i / BUBBLES) * (REVEAL * 0.75),
  }
})

export default function SplashScreen() {
  const [done, setDone] = useState(false)
  const maskId = useId()
  const splashOff = useSettings((s) => s.splashOff)
  useEffect(() => {
    const t = setTimeout(() => setDone(true), REVEAL + FADE)
    return () => clearTimeout(t)
  }, [])
  if (done || splashOff) return null
  return (
    <div className="splash">
      <svg viewBox="0 0 100 100" width="220" height="220">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="black" />
            {circles.map((c, i) => (
              <circle
                key={i}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                fill="white"
                className="splashBubble"
                style={{
                  transformOrigin: `${c.cx}px ${c.cy}px`,
                  animationDelay: `${c.delay}ms`,
                }}
              />
            ))}
          </mask>
        </defs>
        <image
          href="/pwa-512x512.png"
          x="0"
          y="0"
          width="100"
          height="100"
          preserveAspectRatio="xMidYMid meet"
          mask={`url(#${maskId})`}
        />
      </svg>
    </div>
  )
}
