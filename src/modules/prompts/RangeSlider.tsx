import { useRef } from 'react'
import type { BlockInput } from '../../core/storage/types'

/**
 * The two-ended slider a scroll block is edited with, one thumb per end, dragged separately.
 * Native `<input type="range">` only carries one value. The track and thumbs are drawn here and
 * driven by pointer events.
 */
export default function RangeSlider({
  input,
  onChange,
}: {
  input: BlockInput
  onChange: (input: BlockInput) => void
}) {
  const track = useRef<HTMLDivElement>(null)

  // One value, one thumb, the native control already does all of this.
  if (input.value2 === undefined) {
    return (
      <div className="rangeSlider">
        <input
          type="range"
          className="rangeSingle"
          min={input.min}
          max={input.max}
          step={input.step || 1}
          value={input.value}
          onChange={(e) => onChange({ ...input, value: Number(e.target.value) })}
        />
        <span className="rangeVals">{input.value}</span>
      </div>
    )
  }

  const value2 = input.value2
  const span = Math.max(input.max - input.min, 1)
  const pct = (v: number) => ((v - input.min) / span) * 100

  /** The value under the pointer, snapped to the step and held inside the ends. */
  function valueAt(clientX: number) {
    const box = track.current!.getBoundingClientRect()
    const raw = input.min + ((clientX - box.left) / box.width) * (input.max - input.min)
    const step = input.step || 1
    const snapped = input.min + Math.round((raw - input.min) / step) * step
    return Math.min(input.max, Math.max(input.min, snapped))
  }

  /** Dragging past the other thumb stops at it. The low end stays the low end. */
  function drag(end: 'value' | 'value2', e: React.PointerEvent) {
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      const v = valueAt(ev.clientX)
      onChange(
        end === 'value'
          ? { ...input, value: Math.min(v, value2) }
          : { ...input, value2: Math.max(v, input.value) },
      )
    }
    move(e.nativeEvent)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const at = (end: 'value' | 'value2') => (end === 'value' ? input.value : value2)

  /** Keyboard: arrows nudge by a step. The control isn't pointer-only. */
  const nudge = (end: 'value' | 'value2', e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    const v = at(end) + dir * (input.step || 1)
    onChange(
      end === 'value'
        ? { ...input, value: Math.max(input.min, Math.min(v, value2)) }
        : { ...input, value2: Math.min(input.max, Math.max(v, input.value)) },
    )
  }

  const thumb = (end: 'value' | 'value2') => (
    <button
      type="button"
      className="rangeThumb"
      style={{ left: `${pct(at(end))}%` }}
      aria-label={end === 'value' ? 'Low end' : 'High end'}
      aria-valuenow={at(end)}
      aria-valuemin={input.min}
      aria-valuemax={input.max}
      role="slider"
      onPointerDown={(e) => drag(end, e)}
      onKeyDown={(e) => nudge(end, e)}
    />
  )

  return (
    <div className="rangeSlider">
      <div className="rangeTrack" ref={track}>
        <div
          className="rangeFill"
          style={{ left: `${pct(input.value)}%`, width: `${pct(value2) - pct(input.value)}%` }}
        />
        {thumb('value')}
        {thumb('value2')}
      </div>
      <span className="rangeVals">
        {input.value}–{value2}
      </span>
    </div>
  )
}
