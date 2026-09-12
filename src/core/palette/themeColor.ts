/**
 * What the OS paints its own chrome with, derived from the active palette's background.
 *
 * Android, in a standalone PWA: `<meta name="theme-color">` colors the status bar and Chrome reads
 * it live. A palette swap repaints it. The navigation bar at the bottom is not directly settable:
 * Chrome derives it from the manifest's `background_color` at launch and from the page's own
 * background after that. The honest lever there is `body { background: var(--bg) }`, which
 * index.css already sets.
 *
 * iOS, from the home screen: `apple-mobile-web-app-status-bar-style` takes a style name rather than
 * a color, and Safari reads it once when the app launches. Writing it here means a palette swap
 * shows up on the next launch, not immediately.
 *
 * The manifest colors in vite.config.ts are the pre-load half of this: they are what shows before
 * any of the app has run, and they are baked in when the app is installed.
 */
import { isLight } from './palette.ts'

/** The `--bg` in index.css's `:root`: what a palette that leaves `bg` cleared shows through to. */
export const fallbackBg = '#101014'

/** `default` is dark text on a light bar, `black` is light text on a black one. `black-translucent`
 *  is deliberately not an option: it puts the page under the status bar, which needs safe-area
 *  padding the layout doesn't have. */
export type IosStatusBarStyle = 'default' | 'black'

export interface SystemBars {
  themeColor: string
  iosStatusBarStyle: IosStatusBarStyle
}

/**
 * The bar values for a palette background. Anything that isn't a `#rgb`/`#rrggbb` color (cleared,
 * or junk from an imported file) falls back to the stylesheet's background, which is what the page
 * paints in that case anyway.
 */
export function systemBars(bg: string): SystemBars {
  const trimmed = bg.trim()
  const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : fallbackBg
  return { themeColor: color, iosStatusBarStyle: isLight(color) ? 'default' : 'black' }
}

/** Writes both meta tags. A missing tag is created rather than skipped: this doesn't depend on
 *  index.html shipping them. */
export function applySystemBars(bg: string) {
  const bars = systemBars(bg)
  metaTag('theme-color').content = bars.themeColor
  metaTag('apple-mobile-web-app-status-bar-style').content = bars.iosStatusBarStyle
}

function metaTag(name: string): HTMLMetaElement {
  const existing = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (existing) return existing
  const meta = document.createElement('meta')
  meta.name = name
  document.head.appendChild(meta)
  return meta
}
