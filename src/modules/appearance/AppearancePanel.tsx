import type { MarkerKind } from '../../core/stores/settingsStore'
import { appFontMatched, matchAppFontPatch, type Palette } from '../../core/palette/palette'
import { lockedHint, usePaletteEditor } from '../../core/stores/palettesStore'
import ColorStack from '../../app/ColorStack'
import WebfontPicker, { appFontKeys } from './WebfontPicker'
import './appearance.css'

export const fonts: [string, string][] = [
  ['', 'App default'],
  ['Georgia, serif', 'Serif'],
  ['system-ui, sans-serif', 'Sans'],
  ['ui-monospace, monospace', 'Mono'],
]

// The color field each marker kind edits.
export const colorField: Record<MarkerKind, 'emphasisColor' | 'boldColor' | 'quoteColor'> = {
  emphasis: 'emphasisColor',
  bold: 'boldColor',
  quotes: 'quoteColor',
}

/** Font, size and the chat marker colors, read from and written to the active palette.
 *  `colors` off drops the chat color list, leaving the font and size. `heading` off drops the
 *  section heading. `font` off drops the webfont picker and its Fontsource credit. */
export default function AppearancePanel({
  colors = true,
  heading = true,
  font = true,
}: {
  colors?: boolean
  heading?: boolean
  /** `'compact'` is the chat rail's font row: the four stacks, or the webfont search list alone
   *  when the palette names a webfont. */
  font?: boolean | 'compact'
}) {
  const { palette, locked, patch } = usePaletteEditor()

  const matched = appFontMatched(palette)

  // While matched, every chat font edit mirrors onto the app fields.
  const patchChatFont = (fields: Partial<Palette>) => {
    if (!matched) return patch(fields)
    const mirrored: Partial<Palette> = { ...fields }
    if ('fontFamily' in fields) mirrored.appFontFamily = fields.fontFamily
    if ('useWebfont' in fields) mirrored.useAppWebfont = fields.useWebfont
    if ('webfont' in fields) mirrored.appWebfont = fields.webfont
    if ('webfontId' in fields) mirrored.appWebfontId = fields.webfontId
    patch(mirrored)
  }

  return (
    <section className="appearance">
      {heading && <h3>Text</h3>}
      {locked && <p className="hint">{lockedHint}</p>}
      {font && (
        <>
          {font === true && <h4 className="appearanceSubhead">Chat and story font</h4>}
          <WebfontPicker
            palette={palette}
            locked={locked}
            patch={font === true ? patchChatFont : patch}
            fonts={fonts}
            compact={font === 'compact'}
          />
        </>
      )}

      <label className="appearanceRow">
        <span>Size</span>
        <input
          type="number"
          min={10}
          max={32}
          value={palette.fontSize}
          disabled={locked}
          onChange={(e) => patch({ fontSize: Number(e.target.value) })}
        />
        px
      </label>

      <label className="appearanceRow">
        <span>Line height</span>
        <input
          type="number"
          min={1}
          max={3}
          step={0.05}
          value={palette.lineHeight}
          disabled={locked}
          onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
        />
      </label>

      {font === true && (
        <>
          <h4 className="appearanceSubhead">App font</h4>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={matched}
              disabled={locked}
              onChange={(e) => patch(matchAppFontPatch(palette, e.target.checked))}
            />
            Match the chat and story font
          </label>
          {!matched && (
            <WebfontPicker
              palette={palette}
              locked={locked}
              patch={patch}
              fonts={fonts}
              keys={appFontKeys}
            />
          )}
        </>
      )}

      <label className="appearanceRow">
        <span>Text weight</span>
        <input
          type="number"
          min={300}
          max={800}
          step={100}
          value={palette.textWeight}
          disabled={locked}
          onChange={(e) => patch({ textWeight: Number(e.target.value) })}
        />
      </label>

      {colors && (
        <>
          <ColorStack
            order={palette.colorOrder}
            colorOf={(kind) => palette[colorField[kind]]}
            textColor={palette.textColor}
            onOrder={(colorOrder) => patch({ colorOrder })}
            onColor={(kind, color) => patch({ [colorField[kind]]: color })}
            onTextColor={(textColor) => patch({ textColor })}
          />
          <p className="hint">
            Colors text in double quotes, asterisks and underscores. Where they overlap, the top row
            wins.
          </p>
        </>
      )}

      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={palette.mobileFullWidth}
          disabled={locked}
          onChange={(e) => patch({ mobileFullWidth: e.target.checked })}
        />
        Use max width on mobile
      </label>

      {font === true && (
        <p className="hint webfontCredit">
          Fonts provided by{' '}
          <a href="https://fontsource.org/" target="_blank" rel="noreferrer">
            Fontsource
          </a>
          .
        </p>
      )}
    </section>
  )
}
