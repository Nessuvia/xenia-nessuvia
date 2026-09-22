import { useRef } from 'react'

interface Props {
  min: number
  max: number
  step: number
  /** A pair draws two thumbs, dragged separately. The low end is held at or below the high end. */
  value: number | [number, number]
  onChange: (value: number | [number, number]) => void
}

/**
 * A slider variable's control. Native `<input type="range">` only carries one value, so the
 * two-ended one draws its own track and thumbs and drives them with pointer events.
 */
export default function RangeSlider({ min, max, step, value, onChange }: Props) {
  const track = useRef<HTMLDivElement>(null)

  if (!Array.isArray(value)) {
    return (
      <div className="rangeSlider">
        <input
          type="range"
          className="rangeSingle"
          min={min}
          max={max}
          step={step || 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="rangeVals">{value}</span>
      </div>
    )
  }

  const input = { min, max, step, value: value[0] }
  const value2 = value[1]
  const emit = (next: { value: number; value2?: number }) => onChange([next.value, next.value2 ?? value2])
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
      emit(end === 'value' ? { value: Math.min(v, value2) } : { value: input.value, value2: Math.max(v, input.value) })
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
    emit(
      end === 'value'
        ? { value: Math.max(input.min, Math.min(v, value2)) }
        : { value: input.value, value2: Math.min(input.max, Math.max(v, input.value)) },
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
