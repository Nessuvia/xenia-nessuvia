// Addresses in user CSS and markup that would make the browser fetch something when it renders.
// A shared prompt stack can carry a custom look, and a look that loads `url(https://…)` tells a
// stranger's server the player's IP address every time the chat panel opens. Stacks refuse these
// unless their maker turned on external links (`PromptStack.allowRemote`).
//
// Feed this what the browser parsed, never the raw text: CSS as serialized by a CSSStyleSheet
// (which undoes escapes like `\75 rl(`), `src` from the sanitized DOM (which undoes `&#104;ttps`).
// See `lookProblems` in modules/prompts/stackLook.ts. It over-reports: anything that isn't a
// `data:` URI or a `#fragment` counts, relative paths included.

// url(...) in its three forms.
const urlToken = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi
// @import takes a bare string as well as url().
const importRule = /@import\s+(?:"([^"]*)"|'([^']*)')/gi
// image-set() takes bare strings too.
const imageSetString = /image-set\([^)]*?(?:"([^"]*)"|'([^']*)')/gi

/** Whether loading this address leaves the page. */
export function isRemote(target: string): boolean {
  const t = target.trim().toLowerCase()
  return !!t && !t.startsWith('data:') && !t.startsWith('#')
}

/** Every address a stylesheet (or a style attribute's text) would load, de-duplicated. */
export function cssRemoteRefs(css: string): string[] {
  const out = new Set<string>()
  for (const pattern of [urlToken, importRule, imageSetString]) {
    for (const m of css.matchAll(pattern)) {
      const target = (m[1] ?? m[2] ?? m[3] ?? '').trim()
      if (isRemote(target)) out.add(target)
    }
  }
  return [...out]
}
