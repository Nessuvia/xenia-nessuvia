import { useEffect } from 'react'
import { usePalette } from '../stores/palettesStore'

/**
 * Loads the Fontsource CSS for the active palette's two webfonts (the chat/story font and the app
 * font), and clears the matching var on failure so the app falls back to the stack rather than
 * rendering in a font that never arrived.
 *
 * Mounted once, in App, alongside `useApplyPalette`. `useApplyPalette` writes `--chatFont` and
 * `--appFont` from `effectiveFont`/`effectiveAppFont`; this hook only owns the `<link>`s that
 * deliver the families. The two are separate: a font stays loaded across a palette swap to
 * another palette using the same family, and `paletteVars` is a pure var emitter. It should not
 * touch the DOM.
 */
export function useApplyWebfont() {
  const palette = usePalette()
  const { useWebfont, webfontId, useAppWebfont, appWebfontId } = palette

  useEffect(() => {
    loadWebfont('webfont', useWebfont, webfontId, '--chatFont')
  }, [useWebfont, webfontId])

  useEffect(() => {
    loadWebfont('appWebfont', useAppWebfont, appWebfontId, '--appFont')
  }, [useAppWebfont, appWebfontId])
}

/** Points the `<link id=linkId>` at `fontId`'s Fontsource stylesheet, or removes it when off. */
function loadWebfont(linkId: string, on: boolean, fontId: string, clearVar: string) {
  if (!on || !fontId) {
    document.getElementById(linkId)?.remove()
    return
  }

  let link = document.getElementById(linkId) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = linkId
    link.rel = 'stylesheet'
    // `display=swap` is not a Fontsource CSS param; the @font-face rules already set
    // font-display: swap. A missing font falls back immediately while it loads.
    document.head.append(link)
  }
  const href = `https://cdn.jsdelivr.net/fontsource/css/${fontId}@latest/index.css`
  if (link.getAttribute('href') === href) return

  link.setAttribute('href', href)
  // If the stylesheet itself fails to load (offline, blocked, bad id), drop the font var so those
  // locations fall back to the System Default stack. A woff2 that fails after the CSS loads is
  // already handled by the `sans-serif` fallback inside the var value.
  link.onerror = () => document.documentElement.style.removeProperty(clearVar)
}
