import type { MarkerKind } from '../stores/settingsStore'

/** The four background slots: a baseline for every page, and one per interacting page. */
export type BackgroundSlot = 'all' | 'chat' | 'write' | 'prompts'
export type BackgroundFit = 'center' | 'cover' | 'contain' | 'stretch' | 'tile' | 'none'

export const backgroundSlots: BackgroundSlot[] = ['all', 'chat', 'write', 'prompts']
export const backgroundFits: BackgroundFit[] = ['center', 'cover', 'contain', 'stretch', 'tile', 'none']

/**
 * One page's background layer. `imageId` points at a row in the `backgroundImages` table: the bytes
 * live there, not here, and loading a palette list doesn't drag megabytes of base64 along. `url` is
 * an externally hosted image. They are exclusive: setting one clears the other.
 *
 * `css` is raw CSS, wrapped in `@scope` so it only reaches inside the background layer (see
 * scopeCss.ts). `html` is the user's own elements, placed inside `.pageBackground` for their CSS to
 * target: sanitized to a tight structural allowlist on render (see sanitizeHtml.ts), never trusted
 * as-is. Both are reject-the-whole-thing: anything off the allowlist, or CSS that closes its own
 * scope early, renders nothing rather than a half-applied result.
 *
 * Both name the slot's image the same way, `<img src="image.jpg">` and `url(image.jpg)`, and both
 * fall back to the baseline's when empty. That is how one pair of boxes on `all` dresses all four
 * slots while each slot supplies its own picture.
 *
 * The Backgrounds panel is the only editor in the app that doesn't autosave. These two fields are
 * why: the layer previews the drafts live, and Apply is the separate step that writes them, so an
 * experiment that went wrong is gone on reload instead of stored.
 */
export interface Background {
  imageId: number // 0 = none
  url: string // '' = none
  fit: BackgroundFit
  /** True: the layer starts at the sidebar's right edge instead of spanning the window behind it. */
  excludeNav: boolean
  css: string
  html: string
}

export const emptyBackground: Background = {
  imageId: 0,
  url: '',
  fit: 'cover',
  excludeNav: false,
  css: '',
  html: '',
}

/**
 * One named record holding every appearance value the app has. Field names match the CSS var names
 * minus the `--`, so applying a palette is a loop rather than a mapping table.
 *
 * `''` means "no color" for the marker fields, the same as it did on the old Appearance object.
 */
export interface Palette {
  id?: number
  ownerId: string
  name: string
  /** Where the row sits in the palette list. Not indexed: the list is small and gets sorted
   *  after the read. Missing on rows written before the field existed; those sort last, by id. */
  orderId?: number

  // Surfaces
  bg: string
  surfaceSunken: string
  surface: string
  surfaceRaised: string
  surfaceHover: string
  surfaceActive: string
  surfaceSelected: string

  // Borders
  border: string
  borderStrong: string
  borderAccent: string

  // Text
  text: string
  textBright: string
  textSoft: string
  textMuted: string
  textDim: string

  // Accents
  accent: string
  danger: string
  overlay: string

  // Chat markers
  textColor: string
  emphasisColor: string
  boldColor: string
  quoteColor: string
  colorOrder: MarkerKind[]
  // When on, per-character color overrides are ignored and the palette is the only source of marker
  // color. The overrides stay stored: this hides them and does not erase them.
  overwriteCharColor: boolean

  // Story markers
  storyTextColor: string
  storyEmphasisColor: string
  storyBoldColor: string
  storyQuoteColor: string
  storyColorOrder: MarkerKind[]

  // Typography
  fontFamily: string // '' = inherit from the app
  // A Fontsource family picked from the Webfont picker. While `useWebfont` is on, this overrides
  // `fontFamily` for the chat locations (chat, ask, write). `webfontId` is the Fontsource slug used
  // to build the CDN CSS URL; kept alongside so applying a palette does not need the catalog loaded.
  webfont: string
  webfontId: string
  useWebfont: boolean
  // The app chrome's font (sidebar, panels, settings), separate from the chat/story font above.
  // Same three-field webfont shape; '' = the stylesheet's system-ui stack.
  appFontFamily: string
  appWebfont: string
  appWebfontId: string
  useAppWebfont: boolean
  fontSize: number // px
  // Base font weight for body text, set at :root. Elements with a weight of their own (headings,
  // buttons) keep it: this is the knob for text that would otherwise inherit 400.
  textWeight: number
  // Unitless: it scales with the font size. Text is pre-wrap, which makes a paragraph break a
  // literal blank line. This knob sets the space between paragraphs as well as between lines.
  lineHeight: number

  // Layout
  chatWidth: number // %, the default a Chat with no width of its own uses
  storyWidth: number // %, same for a Story
  // On at phone width, the chat and story widths are ignored and the view fills the screen.
  mobileFullWidth: boolean
  sidebarWidth: number // px, 0 = the stylesheet's default
  radius: number // px

  // Structure. A skin id from app/skins/skins.ts: 'default' means no skin, the base stylesheet.
  skin: string
  /**
   * Values for the active skin's knobs, keyed by CSS var name (`--glassBlur`). One loose map rather
   * than typed per-skin fields: a skin declares its own knobs, so adding one is a line in skins.ts
   * and never a change to this interface or to stored rows.
   *
   * Keys for skins that aren't active are kept, so switching away from Glass and back keeps the
   * tuning. A missing key means the skin's stylesheet default applies.
   */
  skinVars: Record<string, number>

  // Backgrounds
  backgrounds: Record<BackgroundSlot, Background>
}

const allKinds: MarkerKind[] = ['emphasis', 'bold', 'quotes']

/**
 * The built-in palette. Colors are the `:root` block in index.css verbatim.
 *
 * It plays three parts: seeded into the palettes table on first run as an ordinary, editable row;
 * the field values a new preset starts from; and the fallback the app renders with when no row is
 * active: what a user who deleted every palette sees.
 */
export const defaultPalette: Palette = {
  ownerId: 'local',
  name: 'Default',

  bg: '#101014',
  surfaceSunken: '#131318',
  surface: '#16161c',
  surfaceRaised: '#1b1b26',
  surfaceHover: '#22222b',
  surfaceActive: '#2d2d3a',
  surfaceSelected: '#3f3f52',

  border: '#2a2a33',
  borderStrong: '#3a3a48',
  borderAccent: '#4a4a6a',

  text: '#e6e6ea',
  textBright: '#ffffff',
  textSoft: '#c8c8d2',
  textMuted: '#a0a0ac',
  textDim: '#6c6c7a',

  accent: '#6c6cff',
  danger: '#ff8a8a',
  overlay: '#00000099',

  textColor: '',
  emphasisColor: '',
  boldColor: '',
  quoteColor: '',
  colorOrder: [...allKinds],
  overwriteCharColor: false,

  storyTextColor: '',
  storyEmphasisColor: '',
  storyBoldColor: '',
  storyQuoteColor: '',
  storyColorOrder: [...allKinds],

  fontFamily: '',
  webfont: '',
  webfontId: '',
  useWebfont: false,
  appFontFamily: '',
  appWebfont: '',
  appWebfontId: '',
  useAppWebfont: false,
  fontSize: 15,
  lineHeight: 1.55,
  textWeight: 400,

  chatWidth: 100,
  storyWidth: 100,
  mobileFullWidth: true,
  sidebarWidth: 0,
  radius: 6,

  skin: 'default',
  skinVars: {},

  backgrounds: {
    all: { ...emptyBackground },
    chat: { ...emptyBackground },
    write: { ...emptyBackground },
    prompts: { ...emptyBackground },
  },
}

/** The var names written to the root element. The marker colors and the widths are per-view and
 *  stay inline where character overrides can still layer on top. */
export const rootVarFields = [
  'bg',
  'surfaceSunken',
  'surface',
  'surfaceRaised',
  'surfaceHover',
  'surfaceActive',
  'surfaceSelected',
  'border',
  'borderStrong',
  'borderAccent',
  'text',
  'textBright',
  'textSoft',
  'textMuted',
  'textDim',
  'accent',
  'danger',
  'overlay',
] as const

/**
 * Merge a stored row over the defaults so a partial or older row still resolves every field: the
 * same defaults-merge-on-read shape `useAppearance()` used.
 */
export function resolvePalette(p?: Partial<Palette> | null): Palette {
  return {
    ...defaultPalette,
    ...(p ?? {}),
    colorOrder: normalizeOrder(p?.colorOrder),
    storyColorOrder: normalizeOrder(p?.storyColorOrder),
    backgrounds: normalizeBackgrounds(p?.backgrounds),
    skinVars: normalizeSkinVars(p?.skinVars),
  }
}

/**
 * Numbers keyed by CSS var name, and nothing else. A row from a file can hold strings, nulls or
 * nested objects here, and these values go straight into a `style.setProperty` call. Junk is
 * dropped rather than coerced. Range is not checked: the knob that owns the key clamps it, and this
 * module has no access to the skin declarations.
 */
export function normalizeSkinVars(stored?: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!stored || typeof stored !== 'object') return out
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (key.startsWith('--') && typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  return out
}

/**
 * Every slot present with every field of the right type. A row written before backgrounds existed
 * has no object at all, and a row from a file can be short a slot or hold junk in one.
 */
export function normalizeBackgrounds(
  stored?: Partial<Record<BackgroundSlot, Partial<Background>>> | null,
): Record<BackgroundSlot, Background> {
  const out = {} as Record<BackgroundSlot, Background>
  for (const slot of backgroundSlots) {
    const raw = (stored ?? {})[slot] ?? {}
    out[slot] = {
      imageId: typeof raw.imageId === 'number' && Number.isFinite(raw.imageId) ? raw.imageId : 0,
      url: typeof raw.url === 'string' ? raw.url : '',
      fit: backgroundFits.includes(raw.fit as BackgroundFit)
        ? (raw.fit as BackgroundFit)
        : emptyBackground.fit,
      excludeNav: raw.excludeNav === true,
      css: typeof raw.css === 'string' ? raw.css : '',
      html: typeof raw.html === 'string' ? raw.html : '',
    }
  }
  return out
}

/**
 * A page's effective background: the slot's own fields over the baseline's, field by field. A
 * page that sets only a fit still shows the baseline image. CSS and HTML replace rather than merge:
 * a page with either one non-empty renders its own and none of the baseline's. A page background
 * can't end up painted over the baseline's. Empty falls back to the baseline. They fall back
 * independently: a page can set only CSS and still get the baseline's elements to style.
 */
export function resolveBackground(
  backgrounds: Record<BackgroundSlot, Background>,
  slot: BackgroundSlot,
): {
  imageId: number
  url: string
  fit: BackgroundFit
  excludeNav: boolean
  css: string
  html: string
} {
  const base = backgrounds.all
  const own = backgrounds[slot]
  const hasOwnImage = own.imageId !== 0 || own.url !== ''
  return {
    imageId: hasOwnImage ? own.imageId : base.imageId,
    url: hasOwnImage ? own.url : base.url,
    // A slot with no image of its own is showing the baseline's. It uses the baseline's fit too.
    fit: hasOwnImage ? own.fit : base.fit,
    // Layer geometry, not an image property: a slot that sets only css/html still owns its own box.
    excludeNav: own.imageId || own.url || own.css || own.html ? own.excludeNav : base.excludeNav,
    css: own.css || base.css,
    html: own.html || base.html,
  }
}

/**
 * How one fit mode paints. Applied inline, and only when there is an image: a slot with no image
 * leaves `.pageBackground` with no background properties at all. Custom CSS starts from nothing.
 */
export function fitStyle(fit: BackgroundFit): {
  backgroundSize: string
  backgroundRepeat: string
  backgroundPosition: string
} {
  const at = { backgroundPosition: 'center' }
  // 'none' hides the image entirely. The caller skips the style object; this is just a safe value.
  if (fit === 'none') return { backgroundSize: 'auto', backgroundRepeat: 'no-repeat', ...at }
  if (fit === 'tile') return { backgroundSize: 'auto', backgroundRepeat: 'repeat', ...at }
  if (fit === 'stretch') return { backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', ...at }
  if (fit === 'center') return { backgroundSize: 'auto', backgroundRepeat: 'no-repeat', ...at }
  return { backgroundSize: fit, backgroundRepeat: 'no-repeat', ...at } // cover | contain
}

/**
 * List order: by `orderId`, with rows written before the field existed sorting last, by id. Ties
 * break on id so the order is stable however the rows came out of the table.
 */
export function sortByOrder(rows: Palette[]): Palette[] {
  return rows.slice().sort((a, b) => {
    const ao = a.orderId ?? Infinity
    const bo = b.orderId ?? Infinity
    return ao === bo ? (a.id ?? 0) - (b.id ?? 0) : ao - bo
  })
}

/** The position a new row appends at: one past the highest in use, 0 for an empty list. */
export function nextOrder(rows: Palette[]): number {
  return rows.reduce((max, p) => Math.max(max, (p.orderId ?? -1) + 1), 0)
}

/** A stored order can be partial or hold junk; keep every known kind exactly once, order kept. */
export function normalizeOrder(order?: MarkerKind[]): MarkerKind[] {
  const list = Array.isArray(order) ? order : []
  const kept = list.filter((k, i) => allKinds.includes(k) && list.indexOf(k) === i)
  return [...kept, ...allKinds.filter((k) => !kept.includes(k))]
}

/**
 * The font stack applied to chat locations. A webfont overrides the stack dropdown while on; both
 * the family and a fallback are written so a font that fails to load degrades instead of vanishing.
 * The actual `<link>` to the Fontsource CSS is managed by `useApplyWebfont`; this string alone will
 * not load the font. Empty string means inherit the app default.
 */
export function effectiveFont(p: Pick<Palette, 'fontFamily' | 'useWebfont' | 'webfont'>): string {
  return p.useWebfont && p.webfont ? `"${p.webfont}", sans-serif` : p.fontFamily
}

/** The same, for the app chrome. Empty string means the stylesheet's system-ui stack. */
export function effectiveAppFont(
  p: Pick<Palette, 'appFontFamily' | 'useAppWebfont' | 'appWebfont'>,
): string {
  return p.useAppWebfont && p.appWebfont ? `"${p.appWebfont}", sans-serif` : p.appFontFamily
}

/** Whether the app font's four fields already equal the chat font's. Derived rather than stored as
 *  a flag: a flag would be a fifth field to keep true, and this can't drift out of sync. */
export function appFontMatched(p: Palette): boolean {
  return (
    p.appFontFamily === p.fontFamily &&
    p.useAppWebfont === p.useWebfont &&
    p.appWebfont === p.webfont &&
    p.appWebfontId === p.webfontId
  )
}

/** The patch that turns the match on or off. Off drops the app font back to the default stack, but
 *  when the chat font *is* the default, that would still read as matched and the toggle could never
 *  come off, so it takes the equivalent named stack instead: same typeface, different value. */
export function matchAppFontPatch(p: Palette, on: boolean): Partial<Palette> {
  if (on)
    return {
      appFontFamily: p.fontFamily,
      useAppWebfont: p.useWebfont,
      appWebfont: p.webfont,
      appWebfontId: p.webfontId,
    }
  return {
    appFontFamily: !p.fontFamily && !p.useWebfont ? 'system-ui, sans-serif' : '',
    useAppWebfont: false,
  }
}

/** `--name` -> value for every var applied at the root element. A cleared color is left out:
 *  the `:root` block in index.css shows through as the fallback. */
export function paletteVars(p: Palette): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const field of rootVarFields) if (p[field]) vars[`--${field}`] = p[field]
  vars['--radius'] = `${p.radius}px`
  vars['--chatFont'] = effectiveFont(p)
  // Unlike --chatFont, which the views also set inline, this one only lives at the root: the app
  // chrome is precisely what sits outside those views. Empty means the index.css fallback wins.
  vars['--appFont'] = effectiveAppFont(p)
  vars['--textWeight'] = String(p.textWeight || 400)
  // Derived, not a knob: the browser paints scrollbars and form controls from `color-scheme`.
  // A light palette with dark controls looks broken. Any palette with a light background gets it.
  vars['--colorScheme'] = isLight(p.bg) ? 'light' : 'dark'
  return vars
}

/**
 * Which fields differ between two palettes: what the rewind controls render from. `id`,
 * `ownerId` and `orderId` are identity and list position, not appearance. They never count as
 * a change.
 */
export function changedFields(before: Palette, after: Palette): (keyof Palette)[] {
  const changed: (keyof Palette)[] = []
  for (const key of Object.keys(before) as (keyof Palette)[]) {
    if (key === 'id' || key === 'ownerId' || key === 'orderId') continue
    const a = before[key]
    const b = after[key]
    // Objects and arrays compare by contents: `backgrounds` and the marker orders are rebuilt on
    // every resolve, so `===` would report them changed on every render.
    const same =
      a !== null && typeof a === 'object' && b !== null && typeof b === 'object'
        ? JSON.stringify(a) === JSON.stringify(b)
        : a === b
    if (!same) changed.push(key)
  }
  return changed
}

/** Rough perceived brightness of a `#rgb`/`#rrggbb` color. Anything else counts as dark. */
export function isLight(color: string): boolean {
  const hex = color.trim().replace('#', '')
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6)
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 > 140
}
