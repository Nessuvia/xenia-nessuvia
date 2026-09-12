import { useEffect, useRef } from 'react'
import { paletteVars } from './palette'
import { applySystemBars } from './themeColor'
import { skinVars } from '../../app/skins/skins'
import { usePalette } from '../stores/palettesStore'

/** Vars written on the last run. A palette that drops one removes it instead of leaving it set. */
let applied: string[] = []

/**
 * Writes the active palette onto `document.documentElement`. Runtime vars there win over the
 * `:root` block in index.css, which stays as the fallback. Default sets the same values.
 * Nothing changes visually until another palette is picked.
 *
 * Mounted once, in App.
 */
export function useApplyPalette() {
  const palette = usePalette()
  const lastId = useRef(palette.id)

  useEffect(() => {
    const root = document.documentElement
    const style = root.style

    // An unknown or missing skin id matches no rules, the same thing 'default' does.
    // There is nothing to validate here.
    root.dataset.skin = palette.skin || 'default'

    // The OS chrome lives outside the document and can't read a CSS var (themeColor.ts).
    applySystemBars(palette.bg)

    // A flag rather than a var: the widths are set inline per view. The phone-width override has
    // to beat them on the width property itself (index.css).
    if (palette.mobileFullWidth) root.dataset.mobileFullWidth = ''
    else delete root.dataset.mobileFullWidth

    // Fade only on an actual swap to another palette, not while live-editing the current one:
    // editing wants instant feedback.
    if (palette.id !== lastId.current) {
      lastId.current = palette.id
      root.classList.add('paletteFading')
      const done = setTimeout(() => root.classList.remove('paletteFading'), 500)
      applyVars(style)
      return () => clearTimeout(done)
    }
    applyVars(style)

    function applyVars(style: CSSStyleDeclaration) {
      // Only the active skin's knobs are written. The stored map keeps values for the others, and
      // writing those too would be harmless but would leave stale vars on the root element.
      const vars = { ...paletteVars(palette), ...skinVars(palette.skin, palette.skinVars) }
      for (const name of applied) if (!(name in vars)) style.removeProperty(name)
      for (const [name, value] of Object.entries(vars)) style.setProperty(name, value)
      applied = Object.keys(vars)
    }
  }, [palette])
}
