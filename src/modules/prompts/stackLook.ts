// A stack's custom look: maker-written HTML and CSS laid over its variables in the chat and Story
// panels. The HTML goes through the palette sanitizer (`lookPolicy`) and the CSS through the same
// `@scope` wrapper backgrounds use. An element with `data-var="id"` gets that variable's standard
// control mounted inside it. The panel root carries every value as a data attribute, so the CSS can
// react to settings: `:scope[data-internal-states="false"] .dndOptions { display: none }`.
//
// Anything wrong (a disallowed tag, a stray `}`, an outside address without `allowRemote`) makes
// the panel fall back to the standard list. The stack still saves; the editor shows the problem.
import type { PromptStack, StackVariable } from '../../core/storage/types'
import { lookPolicy, sanitizeBackgroundHtml } from '../../core/palette/sanitizeHtml'
import { scopeBackgroundCss } from '../../core/palette/scopeCss'
import { cssRemoteRefs, isRemote } from '../../core/palette/remoteRefs'

/** The class the CSS is scoped to. One per stack, so two stacks' CSS never meet. */
export const lookScope = (stack: PromptStack) => `stackLook${stack.id ?? 'Draft'}`

export const hasLook = (stack: PromptStack) => !!stack.look?.html.trim()

const kebab = (id: string) => id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/_/g, '-').toLowerCase()

/** `data-*` attributes for the panel root: one per variable, two for a range. */
export function lookDataAttrs(variables: StackVariable[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of variables) {
    const name = `data-${kebab(v.id)}`
    if (Array.isArray(v.value)) {
      out[`${name}-start`] = String(v.value[0])
      out[`${name}-end`] = String(v.value[1])
    } else out[name] = String(v.value)
  }
  return out
}

/** The attribute names the CSS can use, for the editor's guide. */
export const lookAttrNames = (variables: StackVariable[]) => Object.keys(lookDataAttrs(variables))

/** Every `url()` the scoped CSS would load, read back from the parsed sheet so escapes are undone. */
function parsedCssRefs(css: string, scope: string): string[] {
  const wrapped = scopeBackgroundCss(css, scope).css
  if (!wrapped) return []
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(wrapped)
  // Raw text as well: a constructed sheet drops @import, a <style> element might not.
  return [...Array.from(sheet.cssRules, (r) => cssRemoteRefs(r.cssText)).flat(), ...cssRemoteRefs(css)]
}

export interface LookReport {
  /** Any of these and the panel shows the standard list instead. */
  errors: string[]
  /** Shown in the editor; the look still renders. */
  warnings: string[]
}

export function lookProblems(stack: PromptStack): LookReport {
  const errors: string[] = []
  const warnings: string[] = []
  const look = stack.look
  if (!look || !hasLook(stack)) return { errors, warnings }
  const scope = lookScope(stack)

  const { nodes, invalid } = sanitizeBackgroundHtml(look.html, '', lookPolicy)
  if (invalid.length) errors.push(`Not allowed in the HTML: ${invalid.join(', ')}.`)
  if (look.css.trim() && scopeBackgroundCss(look.css, scope).escaped) {
    errors.push('The CSS closes a } it never opened.')
  }

  if (!stack.allowRemote) {
    const refs = new Set(parsedCssRefs(look.css, scope))
    for (const el of Array.from(nodes.querySelectorAll('[src]'))) {
      const src = el.getAttribute('src') ?? ''
      if (isRemote(src)) refs.add(src)
    }
    for (const el of Array.from(nodes.querySelectorAll<HTMLElement>('[style]'))) {
      for (const ref of [...cssRemoteRefs(el.style.cssText), ...cssRemoteRefs(el.getAttribute('style') ?? '')]) {
        refs.add(ref)
      }
    }
    if (refs.size) {
      errors.push(`Loads from outside this page: ${[...refs].join(', ')}. Turn on external links to allow it.`)
    }
  }

  const ids = new Set((stack.variables ?? []).map((v) => v.id))
  const unknown = Array.from(nodes.querySelectorAll('[data-var]'), (el) => el.getAttribute('data-var') ?? '').filter(
    (id) => !ids.has(id),
  )
  if (unknown.length) warnings.push(`No variable for data-var: ${[...new Set(unknown)].join(', ')}.`)

  return { errors, warnings }
}
