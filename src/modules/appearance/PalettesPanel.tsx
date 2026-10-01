import { useMemo, useRef, useState } from 'react'
import {
  RiAddLine,
  RiArrowDownLine,
  RiArrowGoBackLine,
  RiArrowUpLine,
  RiDeleteBinLine,
  RiDownloadLine,
  RiFileCopyLine,
  RiPaletteLine,
  RiUploadLine,
} from '@remixicon/react'
import { ColorInput } from '../../app/ColorInput'
import ColorStack from '../../app/ColorStack'
import { findSkin, skins } from '../../app/skins/skins'
import { changedFields, type Palette } from '../../core/palette/palette'
import PalettePromptModal from './PalettePromptModal'
import {
  buildPaletteFile,
  downloadPalettes,
  parsePalettes,
  remapImages,
  type PaletteFileImage,
} from '../../core/palette/importPalettes'
import { bundledPalettes } from '../../core/palette/bundledPalettes'
import { useBackgroundImages } from '../../core/stores/backgroundImagesStore'
import { lockedHint, usePalette, usePalettes } from '../../core/stores/palettesStore'
import { useSettings, type MarkerKind } from '../../core/stores/settingsStore'
import { AskError, useAskContext, type AskContext } from '../../core/stores/askStore'
import TwoColumn from '../../app/TwoColumn'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import AppearancePanel, { colorField as chatColorField, fonts } from './AppearancePanel'
import WebfontPicker from './WebfontPicker'
import './appearance.css'

/** Field names the color controls edit. Every one holds a string; the reads assert it. */
type ColorField = Extract<keyof Palette, string>

const groups: [string, ColorField[]][] = [
  [
    'Surfaces',
    ['bg', 'surfaceSunken', 'surface', 'surfaceRaised', 'surfaceHover', 'surfaceActive', 'surfaceSelected'],
  ],
  ['Borders', ['border', 'borderStrong', 'borderAccent']],
  ['Text', ['text', 'textBright', 'textSoft', 'textMuted', 'textDim']],
  ['Accents', ['accent', 'danger']],
]

/** What a color tile reads as. The var name stays in the tooltip for theme makers writing CSS. */
const colorLabel: Partial<Record<ColorField, string>> = {
  bg: 'Background',
  surfaceSunken: 'Sunken',
  surface: 'Surface',
  surfaceRaised: 'Raised',
  surfaceHover: 'Hover',
  surfaceActive: 'Active',
  surfaceSelected: 'Selected',
  border: 'Border',
  borderStrong: 'Strong',
  borderAccent: 'Accent',
  text: 'Text',
  textBright: 'Bright',
  textSoft: 'Soft',
  textMuted: 'Muted',
  textDim: 'Dim',
  accent: 'Accent',
  danger: 'Danger',
  overlay: 'Overlay',
}

const storyColorField: Record<MarkerKind, ColorField> = {
  emphasis: 'storyEmphasisColor',
  bold: 'storyBoldColor',
  quotes: 'storyQuoteColor',
}

/** The Themes tab's page-header actions. The page header belongs to AppearanceView, so these read
 *  the stores themselves rather than PalettesPanel's state. A new preset becomes the active one,
 *  which is the palette the editor shows. */
export function PaletteActions() {
  const create = usePalettes((s) => s.create)
  const setActive = useSettings((s) => s.setActivePalette)
  const [editingPrompt, setEditingPrompt] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setEditingPrompt(true)}>
        Edit Palette Prompt
      </button>
      <button type="button" onClick={() => create().then(setActive)}>
        <RiAddLine size={16} />
        Add preset
      </button>
      {editingPrompt && <PalettePromptModal onClose={() => setEditingPrompt(false)} />}
    </>
  )
}

export default function PalettesPanel() {
  const palettes = usePalettes((s) => s.palettes)
  const create = usePalettes((s) => s.create)
  const remove = usePalettes((s) => s.remove)
  const update = usePalettes((s) => s.update)
  const add = usePalettes((s) => s.add)
  const move = usePalettes((s) => s.move)
  const snapshot = usePalettes((s) => s.snapshot)
  const rewind = usePalettes((s) => s.rewind)
  const importImages = useBackgroundImages((s) => s.importImages)
  const activeId = useSettings((s) => s.activePaletteId)
  const setActive = useSettings((s) => s.setActivePalette)
  const palette = usePalette()
  // The Ask run reads the palette as it is at send time.
  const latestPalette = useRef(palette)
  latestPalette.current = palette
  const askContext = useMemo<AskContext>(
    () => ({
      id: 'palettes',
      label: 'Appearance → Palettes',
      info: '',
      run: async (text, signal, connection) => {
        const store = usePalettes.getState()
        const target = latestPalette.current
        if (target.id === undefined) throw new Error(lockedHint)
        signal.addEventListener('abort', () => store.cancelGenerate())
        await store.generate(text, target, connection)
        const { generateError, generateAttempt: attempt } = usePalettes.getState()
        if (signal.aborted) throw new Error('Cancelled.')
        if (generateError) {
          throw new AskError(
            generateError,
            attempt
              ? `Request mode: ${attempt.mode} · finish_reason: ${attempt.finishReason || 'none'}

${attempt.reasoning ? `${attempt.reasoning}

` : ''}${attempt.reply || '(empty)'}`
              : undefined,
          )
        }
        return { reply: 'Palette updated.', undo: () => usePalettes.getState().rewindAll() }
      },
    }),
    [],
  )
  useAskContext(askContext)
  // No row matches the active id, every palette deleted, or a stale id. Nothing to write to.
  const locked = palette.id === undefined
  const [editorOpen, setEditorOpen] = useState(true)
  const [bundledOpen, setBundledOpen] = useState(false)
  const bundledRef = useCloseOnOutside(bundledOpen, () => setBundledOpen(false))
  // The files ship with the build. Parsing them once per mount is enough.
  const bundled = useMemo(bundledPalettes, [])

  /** Store the images a set of palettes came with, then append the palettes pointed at the new
   *  rows. Both the file import and the bundled picker land here. */
  const addPalettes = async (incoming: Palette[], images: Record<number, PaletteFileImage>) => {
    const map = await importImages(images)
    await add(incoming.map((p) => remapImages(p, map)))
  }

  /** Selecting another palette always shows its editor. The panel can't look empty. */
  const pick = (id: number | null) => {
    setActive(id)
    setEditorOpen(true)
  }

  // Editing is live and autosaved, the same as every other setting here.
  const patch = (fields: Partial<Palette>) => {
    if (!locked && palette.id !== undefined) update(palette.id, fields)
  }

  // Rewind belongs to the palette the request was made against; switching palettes hides it.
  const before = snapshot && snapshot.paletteId === palette.id ? snapshot.palette : null
  const changed = before ? changedFields(before, palette) : []

  /** The rewind control for one field, or nothing when the field hasn't been overwritten. */
  const rewindOf = (field: keyof Palette) =>
    changed.includes(field) ? (
      <button
        type="button"
        className="paletteRewind"
        title="Undo the generated value"
        // Several of these sit inside a <label>; without this the click also activates the label.
        onClick={(e) => {
          e.preventDefault()
          rewind(field as Exclude<keyof Palette, 'id' | 'ownerId'>)
        }}
      >
        <RiArrowGoBackLine size={13} />
      </button>
    ) : null

  /** One rewind for a whole marker stack. ColorStack is shared by three panels: its rows stay
   *  as they're and the group heading carries the control instead. */
  const rewindGroup = (fields: (keyof Palette)[]) => {
    const mine = fields.filter((f) => changed.includes(f))
    if (!mine.length) return null
    return (
      <button
        type="button"
        className="paletteRewind"
        title="Undo the generated values"
        onClick={(e) => {
          e.preventDefault()
          mine.forEach((f) => rewind(f as Exclude<keyof Palette, 'id' | 'ownerId'>))
        }}
      >
        <RiArrowGoBackLine size={13} />
      </button>
    )
  }

  return (
    <section className="palettes screenFrame">
      <TwoColumn
        list={
          <>
            <ul className="paletteList">
              {palettes.map((p, i) => {
                const id = p.id!
                const open = id === activeId && editorOpen
                return (
                  <li
                    key={id}
                    className={`card ${id === activeId ? 'active' : ''} ${open ? 'editing' : ''}`}
                    title={open ? 'Hide the editor' : undefined}
                    // Whole row opens the editor, clicking the open row closes it. The buttons
                    // inside stop the click: they don't toggle the panel too.
                    onClick={() => (id === activeId ? setEditorOpen(!editorOpen) : pick(id))}
                  >
                    <span className="paletteName">
                      <span className="paletteSwatches">
                        {[p.bg, p.surface, p.accent, p.text].map((c, i) => (
                          <span key={i} className="paletteSwatch" style={{ background: c }} />
                        ))}
                      </span>
                      {p.name}
                    </span>
                    <span className="paletteActions">
                      {id === activeId && <em>active</em>}
                      <button
                        type="button"
                        title="Move up"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          move(id, -1)
                        }}
                      >
                        <RiArrowUpLine size={16} />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        aria-label="Move down"
                        disabled={i === palettes.length - 1}
                        onClick={(e) => {
                          e.stopPropagation()
                          move(id, 1)
                        }}
                      >
                        <RiArrowDownLine size={16} />
                      </button>
                      <button
                        type="button"
                        title="Copy"
                        aria-label="Copy"
                        onClick={(e) => {
                          e.stopPropagation()
                          create(id).then(pick)
                        }}
                      >
                        <RiFileCopyLine size={16} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={palettes.length === 1}
                        aria-label="Delete"
                        title={
                          palettes.length === 1 ? "The last preset can't be deleted." : 'Delete'
                        }
                        onClick={(e) => {
                          e.stopPropagation()
                          remove(id)
                        }}
                      >
                        <RiDeleteBinLine size={16} />
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="paletteTransfer">
              {/* File inputs can't be styled; the label is the button. */}
              <label className="paletteImport">
                <RiUploadLine size={16} />
                Import
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    const { palettes: incoming, images } = parsePalettes(await file.text())
                    await addPalettes(incoming, images)
                  }}
                />
              </label>

              {bundled.length > 0 && (
                <div className="paletteBundled" ref={bundledRef}>
                  <button type="button" onClick={() => setBundledOpen(!bundledOpen)}>
                    <RiPaletteLine size={16} />
                    Bundled
                  </button>
                  {bundledOpen && (
                    <div className="panel paletteBundledMenu">
                      {bundled.map(({ key, palette: p, images }) => (
                        <button
                          key={key}
                          type="button"
                          // This adds a new palette: an existing copy stays as it's and the new
                          // row takes a numbered name.
                          onClick={() => {
                            setBundledOpen(false)
                            addPalettes([p], images)
                          }}
                        >
                          <span className="paletteSwatches">
                            {[p.bg, p.surface, p.accent, p.text].map((c, i) => (
                              <span key={i} className="paletteSwatch" style={{ background: c }} />
                            ))}
                          </span>
                          <span className="paletteBundledName">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                // The image library isn't needed to render this panel and may not be loaded yet.
                // The export reads it fresh rather than subscribing.
                onClick={async () => {
                  const store = useBackgroundImages.getState()
                  if (!store.loaded) await store.load()
                  downloadPalettes(
                    buildPaletteFile([palette], useBackgroundImages.getState().images),
                  )
                }}
                disabled={locked}
                title={locked ? lockedHint : undefined}
              >
                <RiDownloadLine size={16} />
                Export Selected
              </button>
            </div>
          </>
        }
        detail={
          editorOpen && (
            <>
      {locked && <p className="hint">{lockedHint}</p>}

      <fieldset className="panel paletteEditor appearance" disabled={locked}>
        <div className="appearanceRow nameRow">
          <span>Name</span>
          <input
            className="paletteNameInput"
            value={palette.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
          {rewindOf('name')}
          <span className="skinLabel">Panels</span>
          <select
            className="skinSelect"
            value={palette.skin}
            onChange={(e) => patch({ skin: e.target.value })}
          >
            {skins.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {rewindOf('skin')}
          <span title="Auto reads the Background color.">Mode</span>
          <select
            className="schemeSelect"
            value={palette.scheme}
            title="Auto reads the Background color."
            onChange={(e) => patch({ scheme: e.target.value as Palette['scheme'] })}
          >
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          {rewindOf('scheme')}
        </div>

        {/* The active skin's knobs get their own row. A skin with no knobs has no row: an empty one
            still took its padding and left a band under the name. */}
        {(findSkin(palette.skin)?.knobs ?? []).length > 0 && (
        <div className="appearanceRow skinRow">
          <div className="skinKnobs">
            {(findSkin(palette.skin)?.knobs ?? []).map((knob) => {
              const value = palette.skinVars[knob.name] ?? knob.fallback
              return (
                <label
                  key={knob.name}
                  className="skinKnob"
                  title={`${knob.name}, double-click to reset`}
                >
                  <span className="skinKnobLabel">{knob.label}</span>
                  <div className="skinKnobControls">
                    <input
                      type="range"
                      min={knob.min}
                      max={knob.max}
                      step={knob.step}
                      value={value}
                      // Dropping the key restores the skin's own default, the same as never having
                      // touched it, matches the sidebar width handle.
                      onDoubleClick={() => {
                        const { [knob.name]: _dropped, ...rest } = palette.skinVars
                        patch({ skinVars: rest })
                      }}
                      onChange={(e) =>
                        patch({
                          skinVars: { ...palette.skinVars, [knob.name]: Number(e.target.value) },
                        })
                      }
                    />
                    {/* Typed values take the same range as the slider. Clamped on entry: a
                        stray digit can't push a skin var out of what the skin supports. */}
                    <input
                      type="number"
                      className="skinKnobNumber"
                      min={knob.min}
                      max={knob.max}
                      step={knob.step}
                      value={value}
                      onChange={(e) => {
                        const next = Number(e.target.value)
                        if (Number.isNaN(next)) return
                        patch({
                          skinVars: {
                            ...palette.skinVars,
                            [knob.name]: Math.min(knob.max, Math.max(knob.min, next)),
                          },
                        })
                      }}
                    />
                    {knob.unit && <span className="skinKnobUnit">{knob.unit}</span>}
                  </div>
                </label>
              )
            })}
          </div>
        </div>
        )}

        {/* The font, size and chat colors also live in the Typography and Chat colors groups
            below; this is the same palette fields, hoisted to the top and open by default. */}
        {/* Every section is a card in one grid: two columns on a wide editor, one on a narrow one.
            The column count follows the editor's own width, not the window's. */}
        <div className="paletteCards">
        <details className="paletteGroup card" open>
          <summary>Quick settings</summary>
          <AppearancePanel heading={false} />
        </details>

        {groups.map(([label, fields]) => (
          <details key={label} className="paletteGroup card" open>
            <summary>{label}</summary>
            <div className="paletteTiles">
              {fields.map((field) => (
                <div key={field} className="paletteTile">
                  <ColorInput
                    value={palette[field] as string}
                    title={`--${field}`}
                    compact
                    onChange={(color) => patch({ [field]: color })}
                  />
                  <span className="paletteTileLabel" title={`--${field}`}>
                    {colorLabel[field] ?? field}
                    {rewindOf(field)}
                  </span>
                </div>
              ))}
              {label === 'Accents' && (
                <div className="paletteTile">
                  {/* The one field that carries an alpha channel: the swatch gets the alpha
                      slider and stores 8-digit hex. */}
                  <ColorInput
                    value={palette.overlay}
                    title="--overlay"
                    compact
                    alpha
                    onChange={(color) => patch({ overlay: color })}
                  />
                  <span className="paletteTileLabel" title="--overlay">
                    {colorLabel.overlay}
                    {rewindOf('overlay')}
                  </span>
                </div>
              )}
            </div>
          </details>
        ))}

        <details className="paletteGroup card" open>
          <summary>Typography</summary>
          <WebfontPicker
            palette={palette}
            locked={locked}
            patch={patch}
            fonts={fonts}
            rewind={rewindGroup(['fontFamily', 'webfont', 'webfontId', 'useWebfont'])}
          />
          <label className="appearanceRow">
            <span>Size (px)</span>
            <input
              type="number"
              min={10}
              max={32}
              value={palette.fontSize}
              onChange={(e) => patch({ fontSize: Number(e.target.value) })}
            />
            {rewindOf('fontSize')}
          </label>
          <label className="appearanceRow">
            <span>Line height</span>
            <input
              type="number"
              min={1}
              max={3}
              step={0.05}
              value={palette.lineHeight}
              onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
            />
            {rewindOf('lineHeight')}
          </label>
          <p className="hint">Also sets the space a blank line puts between paragraphs.</p>
        </details>

        <details className="paletteGroup card" open>
          <summary>Layout</summary>
          <label className="appearanceRow">
            <span>Chat width (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={palette.chatWidth}
              onChange={(e) => patch({ chatWidth: Number(e.target.value) })}
            />
            {rewindOf('chatWidth')}
          </label>
          <label className="appearanceRow">
            <span>Story width (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={palette.storyWidth}
              onChange={(e) => patch({ storyWidth: Number(e.target.value) })}
            />
            {rewindOf('storyWidth')}
          </label>
          <label className="appearanceRow">
            <span>Sidebar width (px)</span>
            <input
              type="number"
              min={0}
              max={560}
              value={palette.sidebarWidth}
              onChange={(e) => patch({ sidebarWidth: Number(e.target.value) })}
              // Clamped on blur rather than on change: clamping mid-typing eats the first digit.
              // 0 means "use the default". Anything else gets the drag floor from Sidebar.tsx:
              // narrower clips the chat settings labels.
              onBlur={(e) => {
                const n = Number(e.target.value)
                patch({ sidebarWidth: n <= 0 ? 0 : Math.min(560, Math.max(300, n)) })
              }}
            />
            {rewindOf('sidebarWidth')}
          </label>
          <p className="hint">Sidebar width 0 uses the default of 300px. Minimum is 300px.</p>
          <label className="appearanceRow">
            <span>Corner radius (px)</span>
            <input
              type="number"
              min={0}
              max={24}
              value={palette.radius}
              onChange={(e) => patch({ radius: Number(e.target.value) })}
            />
            {rewindOf('radius')}
          </label>
        </details>

        <details className="paletteGroup card" open>
          <summary>
            Chat colors
            {rewindGroup([
              'textColor',
              'emphasisColor',
              'boldColor',
              'quoteColor',
              'colorOrder',
              'overwriteCharColor',
            ])}
          </summary>
          <ColorStack
            order={palette.colorOrder}
            colorOf={(kind) => palette[chatColorField[kind]]}
            textColor={palette.textColor}
            onOrder={(colorOrder) => patch({ colorOrder })}
            onColor={(kind, color) => patch({ [chatColorField[kind]]: color })}
            onTextColor={(textColor) => patch({ textColor })}
          />
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={palette.overwriteCharColor}
              onChange={(e) => patch({ overwriteCharColor: e.target.checked })}
            />
            Overwrite Char. Color
          </label>
        </details>

        <details className="paletteGroup card" open>
          <summary>
            Story colors
            {rewindGroup([
              'storyTextColor',
              'storyEmphasisColor',
              'storyBoldColor',
              'storyQuoteColor',
              'storyColorOrder',
            ])}
          </summary>
          <ColorStack
            order={palette.storyColorOrder}
            colorOf={(kind) => palette[storyColorField[kind]] as string}
            textColor={palette.storyTextColor}
            onOrder={(storyColorOrder) => patch({ storyColorOrder })}
            onColor={(kind, color) => patch({ [storyColorField[kind]]: color })}
            onTextColor={(storyTextColor) => patch({ storyTextColor })}
          />
        </details>
        </div>
      </fieldset>
            </>
          )
        }
      />
    </section>
  )
}
