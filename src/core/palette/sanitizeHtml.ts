/**
 * User background HTML, gated against a tight structural allowlist. It goes inside `.pageBackground`
 * for the user's own CSS to target. This origin holds API keys in localStorage. Raw markup
 * (which runs JS via `<img onerror>`, `<svg onload>`, inline handlers) is never trusted as-is.
 *
 * Only structural tags survive, carrying only `class`/`id` (and `src`/`alt` on images). The policy is
 * reject-the-whole-thing: if anything off the allowlist appears, `invalid` lists it and the panel
 * refuses to apply until the user removes it. No silent scrubbing that could mask an intent.
 *
 * A `<template>` is the parser on purpose. Regex over HTML misses nested and quoted forms: that is
 * how XSS slips through. `template.innerHTML` is the native parser and its content is an inert
 * document: it runs no script and loads no resource. We only walk the parsed tree, then build a
 * fresh fragment. No handler ever attaches to a live node even when the input turns out invalid.
 *
 * Not DOMParser: that runs the document insertion algorithm, which hoists a leading `<style>` or
 * `<title>` into `<head>`. Walking only `body` then silently dropped it: the same tag was flagged
 * or ignored depending on where in the input it sat. Template parses in fragment context.
 * Everything stays where the user wrote it and every tag reaches the allowlist.
 */

/** Tags kept. Anything else lands in `invalid`; a disallowed tag's allowed children are still kept. */
const allowedTags = new Set(['div', 'span', 'hr', 'br', 'p', 'img'])
/** Attributes kept. `src`/`alt` are for `<img>`; harmless (and inert) anywhere else. `style` is how
 *  per-element custom properties get set (`style="--x:75%"`), which is the only way to vary one
 *  element in a repeated set. It grants nothing the CSS box doesn't already grant: both are raw
 *  unscoped CSS, and CSS cannot run script. */
const allowedAttrs = new Set(['class', 'id', 'src', 'alt', 'style'])

/** Elements whose content is raw text, not markup. Unwrapping one would dump its stylesheet or
 *  script source into the page as visible text. They're dropped whole. */
const rawTextTags = new Set(['style', 'script', 'title', 'textarea', 'noscript', 'template'])

export interface SanitizeResult {
  nodes: DocumentFragment
  /** De-duplicated names of what fell outside the allowlist: `<tag>` for tags, `attr` for attributes.
   *  Non-empty means the input is rejected; the panel won't apply it. */
  invalid: string[]
}

/**
 * The stand-in name for the slot's own background image in `<img src="…">`. An uploaded image lives
 * in IndexedDB as a data URL with no path a user could type. The HTML box needs a name to point
 * at, and there is only ever one image per slot: one name is enough. Bare `image` counts too: the
 * extension carries no meaning here.
 *
 * The CSS box takes the same name inside `url(…)`; see `substituteImageUrl` in scopeCss.ts, which
 * asks this. One name across both boxes is what lets the four slots share a single set of HTML and
 * CSS and each still paint its own picture.
 */
const imageRef = /^image(\.(jpe?g|png|gif|webp|avif|svg))?$/i

export function isBackgroundImageRef(src: string): boolean {
  return imageRef.test(src.trim())
}

/**
 * @param imageSrc the slot's background image, substituted for `src="image.jpg"`. Omit to validate
 *   without resolving: the panel only needs `invalid`.
 */
export function sanitizeBackgroundHtml(raw: string, imageSrc = ''): SanitizeResult {
  const template = document.createElement('template')
  template.innerHTML = raw
  const invalid = new Set<string>()
  const out = document.createDocumentFragment()
  for (const child of Array.from(template.content.childNodes)) {
    // Bare text at the top level is almost always a stylesheet pasted into the wrong box. Kept
    // markup can hold text (a <p> with a line in it); loose text outside any element cannot, and
    // rendering it paints the paste across the page. Flag it so the panel refuses instead.
    if (child.nodeType === Node.TEXT_NODE && (child.nodeValue ?? '').trim()) invalid.add('text')
    out.append(...clean(child, invalid, imageSrc))
  }
  return { nodes: out, invalid: [...invalid] }
}

/** A source node → the safe nodes it becomes. A kept element returns itself rebuilt; a disallowed one
 *  returns its cleaned children (unwrapped); a text node returns a copy; anything else, nothing. */
function clean(node: Node, invalid: Set<string>, imageSrc: string): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode(node.nodeValue ?? '')]
  if (node.nodeType !== Node.ELEMENT_NODE) return [] // comments, etc.

  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const children = Array.from(el.childNodes).flatMap((c) => clean(c, invalid, imageSrc))

  if (!allowedTags.has(tag)) {
    invalid.add(`<${tag}>`)
    // unwrap: drop the tag, keep what it held, except raw-text elements, whose "children" are
    // stylesheet or script source that would render as visible text.
    return rawTextTags.has(tag) ? [] : children
  }

  const safe = document.createElement(tag)
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'src' && isBackgroundImageRef(attr.value)) {
      // The slot's own image. Left as written when there is none: the panel's validation pass
      // (which has no image to hand) neither resolves nor rejects it.
      if (imageSrc) safe.setAttribute('src', imageSrc)
      else safe.setAttribute('src', attr.value)
    } else if (allowedAttrs.has(attr.name)) safe.setAttribute(attr.name, attr.value)
    else invalid.add(attr.name)
  }
  safe.append(...children)
  return [safe]
}
