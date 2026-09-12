import { useEffect, useRef, useState } from 'react'
import type { Palette } from '../../core/palette/palette'
import { listFonts, searchFonts, type FontsourceFont } from '../../core/connectors/listFonts'

const pangram = 'The quick brown fox jumps over the lazy dog'

/** The four palette fields one picker drives. Two sets exist: the chat/story font and the app font.
 *  `slot` also namespaces the preview `<link>`: both pickers can be mounted at once. */
export interface FontKeys {
  slot: string
  family: 'fontFamily' | 'appFontFamily'
  use: 'useWebfont' | 'useAppWebfont'
  webfont: 'webfont' | 'appWebfont'
  webfontId: 'webfontId' | 'appWebfontId'
}

export const chatFontKeys: FontKeys = {
  slot: 'chat',
  family: 'fontFamily',
  use: 'useWebfont',
  webfont: 'webfont',
  webfontId: 'webfontId',
}

export const appFontKeys: FontKeys = {
  slot: 'app',
  family: 'appFontFamily',
  use: 'useAppWebfont',
  webfont: 'appWebfont',
  webfontId: 'appWebfontId',
}

/**
 * The Font row in the Appearance panel, with a Webfont checkbox that swaps the stack dropdown for a
 * Fontsource catalog search.
 *
 * The Webfont checkbox is an on/off toggle: unchecking it keeps the chosen family stored and falls
 * the app back to the stack `<select>`. While off, the row is the four-option `<select>`. While on,
 * the `<select>` is hidden and a search input plus a scrollable results list take its place, with
 * the current family previewed above and highlighted in the list.
 *
 * Results are plain family names and paginate by infinite scroll: a sentinel `<li>` at the list
 * bottom drives an `IntersectionObserver` that appends the next 10.
 */
export default function WebfontPicker({
  palette,
  locked,
  patch,
  fonts,
  rewind,
  compact = false,
  keys = chatFontKeys,
}: {
  palette: Palette
  locked: boolean
  patch: (fields: Partial<Palette>) => void
  /** The four hardcoded stacks from AppearancePanel, passed in to keep this component free of it. */
  fonts: [string, string][]
  /** Optional rewind control rendered after the row, used by PalettesPanel. */
  rewind?: React.ReactNode
  /** Chat rail mode: no Webfont toggle, no preview, no per-row font loading. Either the four
   *  stacks or, when the palette already names a webfont, just the search box and list. */
  compact?: boolean
  /** Which set of palette fields this picker edits: the chat/story font or the app font. */
  keys?: FontKeys
}) {
  const fontFamily = palette[keys.family]
  const useWebfont = palette[keys.use]
  const webfont = palette[keys.webfont]
  const webfontId = palette[keys.webfontId]
  const setFamily = (value: string) => patch({ [keys.family]: value })
  const setWebfont = (f: FontsourceFont) =>
    patch({ [keys.webfont]: f.family, [keys.webfontId]: f.id, [keys.use]: true })
  // Local picker preference: whether result rows load their own font as they scroll into view.
  const [loadFonts, setLoadFonts] = useState(false)
  // Editable sample text, seeded with a pangram on each pick and on open when the palette already
  // has a webfont. Local state that the palette never stores.
  const [sample, setSample] = useState(webfont ? pangram : '')

  if (compact) {
    return (
      <section className="webfontRow">
        <div className="appearanceRow">
          {useWebfont && webfont ? (
            <WebfontSearch
              family={webfont}
              id={webfontId}
              slot={keys.slot}
              locked={locked}
              loadFonts={false}
              onPick={setWebfont}
            />
          ) : (
            <select value={fontFamily} disabled={locked} onChange={(e) => setFamily(e.target.value)}>
              {fonts.map(([value, label]) => (
                <option key={label} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="webfontRow">
      <div className="appearanceRow">
        <div className="webfontLeft">
          <button
            type="button"
            className="webfontToggle"
            aria-pressed={useWebfont}
            disabled={locked}
            onClick={() => patch({ [keys.use]: !useWebfont })}
          >
            Webfont
          </button>
          {useWebfont && (
            <label className="checkboxRow webfontOption">
              <input
                type="checkbox"
                checked={loadFonts}
                disabled={locked}
                onChange={(e) => setLoadFonts(e.target.checked)}
              />
              <span>Load fonts while scrolling</span>
              <span className="hint">May be slow.</span>
            </label>
          )}
        </div>
        {!useWebfont ? (
          <select value={fontFamily} disabled={locked} onChange={(e) => setFamily(e.target.value)}>
            {fonts.map(([value, label]) => (
              <option key={label} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <>
            {webfont && (
              <textarea
                className="webfontPreview"
                style={{ fontFamily: `"${webfont}", sans-serif` }}
                value={sample}
                disabled={locked}
                onChange={(e) => setSample(e.target.value)}
              />
            )}
            <WebfontSearch
              family={webfont}
              id={webfontId}
              slot={keys.slot}
              locked={locked}
              loadFonts={loadFonts}
              onPick={(f) => {
                setWebfont(f)
                setSample(pangram)
              }}
            />
          </>
        )}
        {rewind}
      </div>
    </section>
  )
}

/** The search box + scrollable results list, shown while Webfont is on. */
function WebfontSearch({
  family,
  id,
  slot,
  locked,
  loadFonts,
  onPick,
}: {
  family: string
  id: string
  /** Namespaces the preview `<link>`: the chat and app pickers don't overwrite each other's. */
  slot: string
  locked: boolean
  /** Load each result's font as it renders: the name shows in its own typeface. Slow at scale. */
  loadFonts: boolean
  onPick: (f: FontsourceFont) => void
}) {
  // Seeded with the current family. Initial value only: picking a result doesn't overwrite it.
  const [query, setQuery] = useState(family)
  const [page, setPage] = useState(0)
  const [results, setResults] = useState<FontsourceFont[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const catalog = useRef<FontsourceFont[] | null>(null)
  const sentinel = useRef<HTMLLIElement | null>(null)
  const root = useRef<HTMLUListElement | null>(null)

  // Loads the selected family's CSS for the preview.
  useEffect(() => {
    const linkId = `webfontPreview-${slot}`
    if (!family || !id) {
      document.getElementById(linkId)?.remove()
      return
    }
    let link = document.getElementById(linkId) as HTMLLinkElement | null
    const href = `https://cdn.jsdelivr.net/fontsource/css/${id}@latest/index.css`
    if (link?.getAttribute('href') === href) return
    if (!link) {
      link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      document.head.append(link)
    }
    link.setAttribute('href', href)
  }, [family, id, slot])

  // Reset paging whenever the query changes.
  useEffect(() => {
    setResults([])
    setPage(0)
    setHasMore(true)
  }, [query])

  // Loads a page. Runs on query change and on each page bump. `loading` is deliberately not a dep.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        if (!catalog.current) catalog.current = await listFonts()
        if (cancelled) return
        const next = searchFonts(catalog.current, query, page)
        setResults((prev) => (page === 0 ? next : [...prev, ...next]))
        // If the slice was short, there are no more rows for this query.
        setHasMore(next.length === 10)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [query, page])

  // Infinite scroll: when the sentinel enters view, load the next page.
  useEffect(() => {
    const el = sentinel.current
    const rootEl = root.current
    if (!el || !rootEl) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) setPage((p) => p + 1)
      },
      { root: rootEl, rootMargin: '40px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, loading])

  return (
    <div className="webfontSearch">
      <input
        type="search"
        placeholder="Search Fontsource families"
        value={query}
        disabled={locked}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="hint">{error}</p>}
      <ul ref={root} className="panel webfontResults">
        {results.map((f) => (
          <li key={f.id}>
            {loadFonts && <WebfontFace id={f.id} />}
            <button
              type="button"
              className={f.id === id ? 'webfontResult selected' : 'webfontResult'}
              style={loadFonts ? { fontFamily: `"${f.family}", sans-serif` } : undefined}
              disabled={locked}
              onClick={() => onPick(f)}
            >
              {f.family}
            </button>
          </li>
        ))}
        {!results.length && !loading && !error && (
          <li className="webfontEmpty">No families match.</li>
        )}
        {loading && <li className="webfontEmpty">Loading...</li>}
        <li ref={sentinel} aria-hidden />
      </ul>
    </div>
  )
}

/** Injects the Fontsource CSS `<link>` for one family: a result row can render in it. Deduped by
 *  id across rows. The link is removed when the last row using it unmounts. */
function WebfontFace({ id }: { id: string }) {
  useEffect(() => {
    const linkId = `webfontFace-${id}`
    let link = document.getElementById(linkId) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.dataset.refs = '0'
      link.href = `https://cdn.jsdelivr.net/fontsource/css/${id}@latest/index.css`
      document.head.append(link)
    }
    link.dataset.refs = String(Number(link.dataset.refs) + 1)
    return () => {
      const refs = Number(link!.dataset.refs) - 1
      if (refs <= 0) link!.remove()
      else link!.dataset.refs = String(refs)
    }
  }, [id])
  return null
}
