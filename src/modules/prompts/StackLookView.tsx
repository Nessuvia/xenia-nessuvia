import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PromptStack, StackVariable } from '../../core/storage/types'
import { lookPolicy, sanitizeBackgroundHtml } from '../../core/palette/sanitizeHtml'
import { scopeBackgroundCss } from '../../core/palette/scopeCss'
import VariableControl from './VariableControl'
import { lookDataAttrs, lookScope } from './stackLook'

/**
 * A stack's variables laid out by its custom look. Only rendered after `lookProblems` came back
 * with no errors: the markup here is the sanitizer's output, attached with `replaceChildren`, the
 * same route `PageBackground` uses. Controls are React portals into the `data-var` elements.
 * Variables without a slot follow in the standard style, so a missed slot never hides a control.
 */
export default function StackLookView({
  stack,
  onVariable,
}: {
  stack: PromptStack
  onVariable: (index: number, next: StackVariable) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState<HTMLElement[]>([])
  const html = stack.look?.html ?? ''
  const scope = lookScope(stack)
  const css = useMemo(() => scopeBackgroundCss(stack.look?.css ?? '', scope).css, [stack.look?.css, scope])
  const variables = stack.variables ?? []

  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    el.replaceChildren(sanitizeBackgroundHtml(html, '', lookPolicy).nodes)
    setSlots(Array.from(el.querySelectorAll<HTMLElement>('[data-var]')))
  }, [html])

  const control = (v: StackVariable, i: number) => (
    <VariableControl key={v.id} variable={v} onChange={(next) => onVariable(i, next)} />
  )
  const slotted = new Set(slots.map((el) => el.dataset.var))

  return (
    <div className={`stackLook ${scope}`} {...lookDataAttrs(variables)}>
      {css && <style>{css}</style>}
      <div ref={host} />
      {slots.map((el, n) => {
        const i = variables.findIndex((v) => v.id === el.dataset.var)
        return i < 0 ? null : createPortal(control(variables[i], i), el, `${el.dataset.var}-${n}`)
      })}
      {variables.map((v, i) =>
        slotted.has(v.id) ? null : (
          <div key={v.id} className="optionalBlock">
            {control(v, i)}
          </div>
        ),
      )}
    </div>
  )
}
