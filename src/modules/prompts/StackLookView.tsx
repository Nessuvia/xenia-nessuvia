import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PromptStack, StackVariable } from '../../core/storage/types'
import { stackVariables, withValue } from '../../core/prompt/stackTemplate'
import { lookPolicy, sanitizeBackgroundHtml } from '../../core/palette/sanitizeHtml'
import { scopeBackgroundCss } from '../../core/palette/scopeCss'
import VariableControl from './VariableControl'
import { lookDataAttrs, lookScope } from './stackLook'
import { groupIds, groupPick, groupWrite } from './lookGroup'
import './stackLook.css'

/**
 * A stack's variables laid out by its custom look. Only rendered after `lookProblems` came back
 * with no errors: the markup here is the sanitizer's output, attached with `replaceChildren`, the
 * same route `PageBackground` uses. Controls are React portals into the `data-var` elements.
 * An element with `data-group="a, b"` gets one dropdown over those checkboxes (see `lookGroup.ts`).
 * Variables without a slot follow in the standard style unless the look sets `hideUnplaced`.
 */
export default function StackLookView({
  stack,
  onChange,
}: {
  stack: PromptStack
  onChange: (stack: PromptStack) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState<HTMLElement[]>([])
  const [groups, setGroups] = useState<HTMLElement[]>([])
  const html = stack.look?.html ?? ''
  const scope = lookScope(stack)
  const css = useMemo(() => scopeBackgroundCss(stack.look?.css ?? '', scope).css, [stack.look?.css, scope])
  const variables = stackVariables(stack)

  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    el.replaceChildren(sanitizeBackgroundHtml(html, '', lookPolicy).nodes)
    setSlots(Array.from(el.querySelectorAll<HTMLElement>('[data-var]')))
    setGroups(Array.from(el.querySelectorAll<HTMLElement>('[data-group]')))
  }, [html])

  const onVariable = (next: StackVariable) => onChange(withValue(stack, next))
  const control = (v: StackVariable) => (
    <VariableControl key={v.id} variable={v} onChange={onVariable} />
  )
  const current = Object.fromEntries(variables.map((v) => [v.id, v.value]))
  const groupControl = (el: HTMLElement) => {
    const members = groupIds(el.dataset.group ?? '')
      .map((id) => variables.find((v) => v.id === id && v.kind === 'checkbox'))
      .filter((v) => !!v)
    const ids = members.map((v) => v.id)
    const pick = groupPick(ids, current)
    const none = el.dataset.none
    return (
      <select
        className="lookGroupPick"
        value={pick}
        onChange={(e) => onChange({ ...stack, values: { ...stack.values, ...groupWrite(ids, e.target.value) } })}
      >
        {(none !== undefined || !pick) && <option value="">{none || 'None'}</option>}
        {members.map((v) => (
          <option key={v.id} value={v.id} title={v.info || undefined}>
            {v.label}
          </option>
        ))}
      </select>
    )
  }
  const slotted = new Set([...slots.map((el) => el.dataset.var), ...groups.flatMap((el) => groupIds(el.dataset.group ?? ''))])

  return (
    <div className={`stackLook ${scope}`} {...lookDataAttrs(variables)}>
      {css && <style>{css}</style>}
      <div ref={host} />
      {slots.map((el, n) => {
        const v = variables.find((x) => x.id === el.dataset.var)
        return v ? createPortal(control(v), el, `${el.dataset.var}-${n}`) : null
      })}
      {groups.map((el, n) => createPortal(groupControl(el), el, `group-${n}`))}
      {variables.map((v) =>
        slotted.has(v.id) || stack.look?.hideUnplaced ? null : (
          <div key={v.id} className="optionalBlock">
            {control(v)}
          </div>
        ),
      )}
    </div>
  )
}
