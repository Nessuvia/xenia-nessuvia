import type { StackVariable } from '../../core/storage/types'
import RangeSlider from './RangeSlider'

/** One stack variable's value control. The declaration (kind, bounds, options) isn't edited here. */
export default function VariableControl({
  variable: v,
  onChange,
}: {
  variable: StackVariable
  onChange: (variable: StackVariable) => void
}) {
  switch (v.kind) {
    case 'checkbox':
      return (
        <label className="checkboxRow" title={v.info || undefined}>
          <input type="checkbox" checked={v.value} onChange={(e) => onChange({ ...v, value: e.target.checked })} />
          {v.label}
        </label>
      )
    case 'dropdown':
      return (
        <label className="optionPick" title={v.info || undefined}>
          {v.label}
          <select value={v.value} onChange={(e) => onChange({ ...v, value: e.target.value })}>
            {v.options.filter((o) => o.trim()).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      )
    case 'text':
      return (
        <label className="optionPick" title={v.info || undefined}>
          {v.label}
          <input value={v.value} onChange={(e) => onChange({ ...v, value: e.target.value })} />
        </label>
      )
    case 'sliderSingle':
      return (
        <div className="scrollPick" title={v.info || undefined}>
          <span>{v.label}</span>
          <RangeSlider {...v} onChange={(value) => onChange({ ...v, value: value as number })} />
        </div>
      )
    case 'sliderRange':
      return (
        <div className="scrollPick" title={v.info || undefined}>
          <span>{v.label}</span>
          <RangeSlider {...v} onChange={(value) => onChange({ ...v, value: value as [number, number] })} />
        </div>
      )
  }
}
