// Creator CSS for tracker widgets arrives on imported cards: untrusted. This gate refuses anything
// that fetches, and `scopeBackgroundCss` confines what passes to the widget root. Pure.

export const trackerCssLimit = 20000

/** Why the CSS is refused, or '' when it passes. */
export function trackerCssProblem(css: string): string {
  if (css.length > trackerCssLimit) return `The CSS is over ${trackerCssLimit} characters.`
  // An escape can spell a function name the checks below would miss: u\72l( is url(.
  if (css.includes('\\')) return 'The CSS contains a backslash.'
  if (/\b(url|image|image-set|cross-fade|element|src)\s*\(|@import|@font-face/i.test(css)) {
    return 'The CSS loads a resource. Remove url(), image(), @import and @font-face.'
  }
  // Fixed positioning escapes the panel and can cover the app.
  if (/position\s*:\s*fixed/i.test(css)) return 'The CSS uses position: fixed.'
  return ''
}

/** A Fontsource slug: `roboto-slab`. */
export const isFontId = (id: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)

/** `roboto-slab` to `Roboto Slab`, the family name Fontsource declares. */
export const fontFamilyOf = (id: string) =>
  id
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
