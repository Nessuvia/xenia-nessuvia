import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  backgroundSlots,
  fitStyle,
  resolveBackground,
  type BackgroundFit,
  type BackgroundSlot,
} from '../core/palette/palette'
import { sanitizeBackgroundHtml } from '../core/palette/sanitizeHtml'
import {
  cssUrl,
  scopeBackgroundCss,
  scopeRootClass,
  scopeRootClassFor,
  substituteImageUrl,
} from '../core/palette/scopeCss'
import { usePalette } from '../core/stores/palettesStore'
import { useBackgroundCss } from '../core/stores/backgroundCssStore'
import { useBackgroundImages } from '../core/stores/backgroundImagesStore'
import { useMultiplayer } from '../core/stores/multiplayerStore'

/** `?nocss=1` disables custom CSS and HTML for one page load. The way back when either broke the app. */
const cssDisabled = new URLSearchParams(window.location.search).get('nocss') === '1'

/** Crossfade length. Must match the fadeBackground animations in index.css. */
const fadeMs = 500

/** How long to wait for an image to decode before swapping anyway. */
const decodeTimeout = 2000

/** Everything that decides what one layer paints. */
interface LayerSpec {
  key: number
  /** Which of the two style elements and scope roots this layer owns. */
  parity: 0 | 1
  slot: BackgroundSlot
  src: string
  fit: BackgroundFit
  excludeNav: boolean
  css: string
  html: string
}

/**
 * The layer behind the page content, and the custom CSS that goes with it.
 *
 * Two elements per layer, not one. `.pageBackgroundLayer` is the box: positioned inside `.appShell`
 * so it spans the window and the sidebar sits over it, clipped and contained so user HTML can't move
 * page content, and the `@scope` root that keeps user CSS from reaching anything outside it.
 * `.pageBackground` is the documented handle inside it, what the user's CSS targets and where their
 * HTML is placed.
 *
 * Which slot applies comes from the route. Chat, write and prompts each have one. Everything else
 * uses the baseline.
 *
 * A change to any of that builds a whole new layer rather than editing the live one: the image is
 * decoded first, the HTML goes in while the element is still transparent, and the two layers
 * crossfade. There are two `@scope` roots and two `<style>` elements for that reason: during the
 * fade both sets of user CSS are live at once and each has to reach only its own layer.
 *
 * Mounted once, in App.
 */
export default function PageBackground() {
  const palette = usePalette()
  const { pathname } = useLocation()
  const preview = useBackgroundCss((s) => s.preview)
  const images = useBackgroundImages((s) => s.images)
  const loadImages = useBackgroundImages((s) => s.load)
  // A guest in a room paints the host's background instead of its own. Both see one scene.
  const shared = useMultiplayer((s) => (s.role === 'guest' ? s.appearance : null))

  useEffect(() => {
    loadImages()
  }, [loadImages])

  // A live preview renders its own slot rather than the route's: the Backgrounds panel lives on
  // /appearance. Editing the chat background would otherwise show nothing until it was saved.
  const slot = preview ? preview.slot : slotForPath(pathname)

  const background = useMemo(() => {
    // The host sends no imageId. An uploaded image's bytes stay in its own table: a shared
    // background reaches the layer through `url` only.
    if (shared) return { imageId: 0, ...shared.background }
    const stored = palette.backgrounds
    // Unsaved css/html wins over the stored value for its own slot while the panel is open.
    const backgrounds = preview
      ? { ...stored, [preview.slot]: { ...stored[preview.slot], css: preview.css, html: preview.html } }
      : stored
    return resolveBackground(backgrounds, slot)
  }, [palette.backgrounds, preview, slot, shared])

  const src = background.imageId
    ? (images.find((img) => img.id === background.imageId)?.dataUrl ?? '')
    : background.url

  const css = cssDisabled ? '' : background.css
  const html = cssDisabled ? '' : background.html

  // One string: the swap effect runs on a real change and not on every render.
  const signature = JSON.stringify([slot, src, background.fit, background.excludeNav, css, html])

  const nextKey = useRef(0)
  // Parity is not derived from the key: a cancelled swap still burns a key. `key % 2` can otherwise
  // repeat the parity of the layer already on screen, two layers sharing a <style> and a scope root,
  // where the outgoing one's cleanup wipes the incoming one's CSS. It's assigned against the layer
  // being kept instead, inside the state updater.
  const build = () => ({
    key: nextKey.current++,
    slot,
    src,
    fit: background.fit,
    excludeNav: background.excludeNav,
    css,
    html,
  })

  // Oldest first. Two entries means a fade is running; the first one is on its way out.
  const [layers, setLayers] = useState<LayerSpec[]>(() => [{ ...build(), parity: 0 }])

  // Typing in the Backgrounds panel is exempt: the preview is debounced to 250ms. Crossfading
  // each burst would leave the editor permanently mid-fade. Edits land on the live layer instead.
  const editing = preview !== null

  useEffect(() => {
    const spec = build()
    if (editing || contentSig(spec) === contentSig(layers[layers.length - 1])) {
      // Nothing visible differs, only the slot did: the slot falls back to `all`. Fading
      // one background into an identical copy of itself is a visible flicker for no reason.
      // Same element, new content: keeping the key and parity means no fade and no second layer.
      setLayers((prev) => {
        const live = prev[prev.length - 1]
        return [{ ...spec, key: live.key, parity: live.parity }]
      })
      return
    }
    let cancelled = false
    const swap = () => {
      if (cancelled) return
      setLayers((prev) => {
        // Only the newest layer is kept. A third swap mid-fade replaces the one still fading out
        // rather than stacking: there are never more than two.
        const keep = prev[prev.length - 1]
        return [keep, { ...spec, parity: (1 - keep.parity) as 0 | 1 }]
      })
    }
    if (spec.src) decoded(spec.src).then(swap)
    else swap()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line
  }, [signature, editing])

  // `data-bgAnimated` on <html>, from the newest layer's CSS. Skins drop backdrop-filter under it:
  // a blur over a backdrop that repaints every frame is re-run every frame, once per blurred
  // element. Set here rather than in BackgroundLayer: there is one writer. During a crossfade both
  // layers are live, and the incoming one is the one that decides.
  const liveCss = layers[layers.length - 1].css
  const animated = useMemo(() => (liveCss ? scopeBackgroundCss(liveCss).animated : false), [liveCss])

  useEffect(() => {
    const root = document.documentElement
    if (animated) root.dataset.bgAnimated = ''
    else delete root.dataset.bgAnimated
  }, [animated])

  // The outgoing layer leaves the DOM once its fade is done, taking its <style> with it.
  useEffect(() => {
    if (layers.length < 2) return
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), fadeMs)
    return () => clearTimeout(timer)
  }, [layers])

  return (
    <>
      {layers.map((spec, i) => (
        <BackgroundLayer key={spec.key} spec={spec} leaving={i < layers.length - 1} />
      ))}
    </>
  )
}

function BackgroundLayer({ spec, leaving }: { spec: LayerSpec; leaving: boolean }) {
  const layer = useRef<HTMLDivElement>(null)

  // The user's own elements, sanitized to the structural allowlist, placed inside the layer via
  // replaceChildren, never innerHTML: this origin holds API keys. Nothing bypasses sanitizeHtml.
  // sanitizeBackgroundHtml hands back a fragment. The subtree is built off-document and attached
  // in one go, while this layer is still transparent.
  useEffect(() => {
    const el = layer.current
    if (!el) return
    // Reject-the-whole-thing, same rule the panel applies on Apply: a stored value with anything off
    // the allowlist renders nothing. Rendering the stripped remainder is worse than rendering none:
    // a half-built layout, and for a raw-text tag it was the stylesheet source shown as text.
    // spec.src is handed in: `<img src="image.jpg">` resolves to this slot's own image. The
    // uploaded one is a data URL in IndexedDB and has no address the user could type.
    const { nodes, invalid } = sanitizeBackgroundHtml(spec.html, spec.src)
    el.replaceChildren(...(invalid.length ? [] : [nodes]))
  }, [spec.html, spec.src])

  useEffect(() => {
    // One <style> element per layer, contents replaced, the same shape useApplyPalette uses for
    // root vars.
    const id = `backgroundCss${spec.parity}`
    let style = document.getElementById(id) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = id
    }
    // Wrapped in @scope: it only reaches inside this layer, and is refused whole if it breaks out.
    // spec.src is substituted for `url(image.jpg)` first, the CSS half of the same stand-in name the
    // HTML box uses. Four pages share one stylesheet this way and each paints its own image.
    style.textContent = scopeBackgroundCss(
      substituteImageUrl(spec.css, spec.src),
      scopeRootClassFor(spec.parity),
    ).css
    // Which layer's CSS is in there: unmounting doesn't clear a style another layer has claimed.
    style.dataset.owner = String(spec.key)
    // Appended every time, not just on create: `append` moves an existing node, which keeps this
    // last in <head>. Custom CSS has to outrank the module stylesheets at equal specificity, and
    // a user writing `.pageBackground { … }` shouldn't have to guess at selector weight.
    document.head.append(style)
    const owned = style
    return () => {
      // The layer is gone; its CSS would otherwise sit in <head> scoped to nothing.
      if (owned.dataset.owner === String(spec.key)) owned.textContent = ''
    }
  }, [spec.css, spec.src, spec.parity, spec.key])

  return (
    <div
      className={`${scopeRootClass} ${scopeRootClassFor(spec.parity)}${
        spec.excludeNav ? ' excludeNav' : ''
      }${leaving ? ' leaving' : ''}`}
      aria-hidden
    >
      <div
        ref={layer}
        className={`pageBackground pageBackground-${spec.slot}`}
        style={
          spec.src && spec.fit !== 'none'
            ? { backgroundImage: `url("${cssUrl(spec.src)}")`, ...fitStyle(spec.fit) }
            : undefined
        }
      />
    </div>
  )
}

/** What a layer actually paints, minus which slot asked for it. Equal means a fade would show nothing. */
function contentSig(spec: Omit<LayerSpec, 'key' | 'parity'>): string {
  return JSON.stringify([spec.src, spec.fit, spec.excludeNav, spec.css, spec.html])
}

/** The first path segment, when it names a slot. `/chat/12` → `chat`, `/settings` → `all`. */
function slotForPath(pathname: string): BackgroundSlot {
  const first = pathname.split('/').filter(Boolean)[0] ?? ''
  return backgroundSlots.includes(first as BackgroundSlot) && first !== 'all'
    ? (first as BackgroundSlot)
    : 'all'
}

/**
 * Resolves once the image is painted-ready: the fade reveals the picture rather than a blank box.
 * Never rejects, and gives up after `decodeTimeout`. A bad URL must not strand the old background
 * on screen forever.
 */
function decoded(src: string): Promise<void> {
  const img = new Image()
  img.src = src
  const ready = img.decode ? img.decode() : Promise.resolve()
  return Promise.race([
    ready.catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, decodeTimeout)),
  ])
}
