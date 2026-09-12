/**
 * User background CSS, confined to the background layer.
 *
 * `@scope` does the confining natively: every selector inside only matches inside
 * `.pageBackgroundLayer`. User CSS can't restyle the sidebar, the app chrome, or page content the
 * way unscoped injection could. `.pageBackground` stays writable as the documented handle: it's a
 * descendant of the scope root, not the root itself. That's the whole reason the layer is a
 * separate element from the thing the user targets.
 *
 * The one way out of a `@scope` block is a stray `}`: it closes the block early and everything after
 * it applies globally. Palettes are importable: that's untrusted input. Parse the wrapped text
 * and require it collapse to exactly the one `@scope` rule, otherwise refuse the whole thing.
 */

import { isBackgroundImageRef } from './sanitizeHtml.ts'

/** The scope root's class. The layer element, not the handle the user's CSS targets. */
export const scopeRootClass = 'pageBackgroundLayer'

/**
 * Per-layer scope roots. Two background layers exist at once during a crossfade, and each needs its
 * own CSS confined to its own element. `.pageBackgroundLayer` is on both: it can't do that.
 */
export const scopeRootClassFor = (parity: 0 | 1) => `${scopeRootClass}${parity}`

export interface ScopeResult {
  /** Ready to drop into a `<style>`. Empty when the input escaped its scope. */
  css: string
  /** The input broke out of the `@scope` block: nothing was emitted. */
  escaped: boolean
  /**
   * The background paints something that moves: its backdrop never holds still. Skins read this
   * to drop `backdrop-filter`, which is only cheap while what's behind it is static.
   *
   * Keyframes are the proxy, not a real answer: a background can move via `transition` on a var, or
   * an `animation` naming a keyframe the app already declares, and neither shows up here. It covers
   * what animated backgrounds actually look like, and the cost of guessing wrong is a blur that
   * stutters or one that's missing, not a broken page.
   */
  animated: boolean
}

/** A user-supplied URL goes inside a CSS `url("…")`; quotes and backslashes would break out of it. */
export function cssUrl(src: string): string {
  return src.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** One `url(…)` token, in the three forms CSS allows: double-quoted, single-quoted, bare. */
const urlToken = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi

/**
 * `url(image.jpg)` → the image the page being viewed resolves to, the same stand-in name
 * `<img src="image.jpg">` uses in the HTML box. It exists so one set of CSS can paint a different
 * picture per page: the four page slots share the CSS and each supplies its own image.
 *
 * Only the stand-in name is touched. Any other `url(…)` stays the address the user wrote. The
 * substituted value always lands inside a double-quoted string with its quotes and backslashes
 * escaped: an image address can't close the string and reach the surrounding rule.
 *
 * @param imageSrc the resolved image. Empty leaves the CSS alone: the panel's validation pass
 *   (which has no image to hand) reads the text the user typed.
 */
export function substituteImageUrl(css: string, imageSrc: string): string {
  if (!imageSrc) return css
  return css.replace(urlToken, (whole, doubled?: string, singled?: string, bare?: string) => {
    const value = doubled ?? singled ?? bare ?? ''
    return isBackgroundImageRef(value) ? `url("${cssUrl(imageSrc)}")` : whole
  })
}

export function scopeBackgroundCss(raw: string, root: string = scopeRootClass): ScopeResult {
  if (!raw.trim()) return { css: '', escaped: false, animated: false }
  const wrapped = `@scope (.${root}) {\n${raw}\n}`
  const sheet = new CSSStyleSheet()
  // Invalid selectors and declarations are dropped by the parser rather than thrown. This only
  // reports the structural failure: one rule in, one rule out.
  sheet.replaceSync(wrapped)
  if (sheet.cssRules.length !== 1) return { css: '', escaped: true, animated: false }

  // `@scope` only holds style rules and nested conditional groups. A `@keyframes` written inside
  // it is dropped by the parser and the animation silently never runs. Hoist them back out.
  // Names stay as written: a background can redefine an app animation of the same
  // name (prefix them here if that ever bites).
  const flat = new CSSStyleSheet()
  flat.replaceSync(raw)
  const keyframes: string[] = []
  const rest: string[] = []
  for (const rule of flat.cssRules) {
    ;(rule instanceof CSSKeyframesRule ? keyframes : rest).push(rule.cssText)
  }
  if (!keyframes.length) return { css: wrapped, escaped: false, animated: false }

  const css = `${keyframes.join('\n')}\n@scope (.${root}) {\n${rest.join('\n')}\n}`
  return { css, escaped: false, animated: true }
}
