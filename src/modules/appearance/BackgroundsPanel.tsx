import { useEffect, useMemo, useState } from 'react'
import { RiDeleteBinLine, RiUploadLine } from '@remixicon/react'
import {
  backgroundFits,
  backgroundSlots,
  type Background,
  type BackgroundFit,
  type BackgroundSlot,
} from '../../core/palette/palette'
import { sanitizeBackgroundHtml } from '../../core/palette/sanitizeHtml'
import { scopeBackgroundCss } from '../../core/palette/scopeCss'
import { lockedHint, usePaletteEditor } from '../../core/stores/palettesStore'
import { useBackgroundCss } from '../../core/stores/backgroundCssStore'
import { useBackgroundImages } from '../../core/stores/backgroundImagesStore'
import PageTabs from '../../app/PageTabs'
import { CodeEditor, CodeReference } from '../../app/CodeEditor'
import { useMediaQuery } from '../../app/useMediaQuery'
import './backgrounds.css'

const slotLabel: Record<BackgroundSlot, string> = {
  all: 'All pages',
  chat: 'Chat',
  write: 'Write',
  prompts: 'Prompts',
}

const fitLabel: Record<BackgroundFit, string> = {
  center: 'Center',
  cover: 'Fill',
  contain: 'Fit',
  stretch: 'Stretch',
  tile: 'Tile',
  none: 'None',
}

/** How long after the last keystroke the layer picks up the drafts. */
const previewDelay = 250

const langTabs = [
  ['html', 'HTML'],
  ['css', 'CSS'],
] as const
const paneTabs = [
  ['image', 'Image'],
  ['code', 'Code'],
] as const

type Drafts = Record<BackgroundSlot, { css: string; html: string }>

function draftsFor(backgrounds: Record<BackgroundSlot, Background>): Drafts {
  return Object.fromEntries(
    backgroundSlots.map((id) => [id, { css: backgrounds[id].css, html: backgrounds[id].html }]),
  ) as Drafts
}

/** A slot keeps its own HTML and CSS when either one is stored. Empty falls it back to the
 *  baseline's pair: the same question asked of the stored row. */
function separateFor(
  backgrounds: Record<BackgroundSlot, Background>,
): Record<BackgroundSlot, boolean> {
  return Object.fromEntries(
    backgroundSlots.map((id) => [id, backgrounds[id].css !== '' || backgrounds[id].html !== '']),
  ) as Record<BackgroundSlot, boolean>
}

export default function BackgroundsPanel() {
  const { palette, locked, patch } = usePaletteEditor()
  const images = useBackgroundImages((s) => s.images)
  const loadImages = useBackgroundImages((s) => s.load)
  const removeImage = useBackgroundImages((s) => s.remove)
  const addImage = useBackgroundImages((s) => s.add)
  const setPreview = useBackgroundCss((s) => s.setPreview)
  const clearPreview = useBackgroundCss((s) => s.clearPreview)

  const [slot, setSlot] = useState<BackgroundSlot>('all')
  const [lang, setLang] = useState<'html' | 'css'>('html')
  // Half-width and down: one side at a time. A layout shape, so a media query in code.
  const narrow = useMediaQuery('(max-width: 1300px)')
  const [pane, setPane] = useState<'image' | 'code'>('image')
  // The CSS and HTML boxes hold their own per-slot drafts, applied to the palette on Apply.
  const [drafts, setDrafts] = useState(() => draftsFor(palette.backgrounds))
  // Which slots keep HTML and CSS of their own, versus editing the "All pages" set.
  const [separate, setSeparate] = useState(() => separateFor(palette.backgrounds))

  // The slot the boxes below edit: this one when it keeps its own, the baseline otherwise.
  const editSlot: BackgroundSlot = slot === 'all' || separate[slot] ? slot : 'all'
  const { css: cssDraft, html: htmlDraft } = drafts[editSlot]
  const setCssDraft = (css: string) =>
    setDrafts((d) => ({ ...d, [editSlot]: { ...d[editSlot], css } }))
  const setHtmlDraft = (html: string) =>
    setDrafts((d) => ({ ...d, [editSlot]: { ...d[editSlot], html } }))

  const invalidHtml = useMemo(() => sanitizeBackgroundHtml(htmlDraft).invalid, [htmlDraft])
  const cssEscaped = useMemo(() => scopeBackgroundCss(cssDraft).escaped, [cssDraft])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  const background = palette.backgrounds[slot]
  const baseline = palette.backgrounds.all
  const inherits = slot !== 'all' && !background.imageId && !background.url
  const shown = inherits ? baseline : background
  const image = images.find((img) => img.id === shown.imageId)
  const preview = image?.dataUrl || shown.url

  // Switching preset abandons drafts.
  useEffect(() => {
    setDrafts(draftsFor(palette.backgrounds))
    setSeparate(separateFor(palette.backgrounds))
  }, [palette.id]) // eslint-disable-line

  // Live preview, debounced, held in memory only.
  const previewCss = editSlot === 'all' ? cssDraft : cssDraft || drafts.all.css
  const previewHtml = editSlot === 'all' ? htmlDraft : htmlDraft || drafts.all.html

  useEffect(() => {
    const timer = setTimeout(() => setPreview(slot, previewCss, previewHtml), previewDelay)
    return () => clearTimeout(timer)
  }, [slot, previewCss, previewHtml, setPreview])

  useEffect(() => () => clearPreview(), [clearPreview])

  const edited = palette.backgrounds[editSlot]
  const dirty = cssDraft !== edited.css || htmlDraft !== edited.html
  const canApply = dirty && !locked && invalidHtml.length === 0 && !cssEscaped

  const patchSlot = (fields: Partial<Background>, id: BackgroundSlot = slot) =>
    patch({ backgrounds: { ...palette.backgrounds, [id]: { ...palette.backgrounds[id], ...fields } } })

  const apply = () => {
    if (!canApply) return
    patchSlot({ css: cssDraft, html: htmlDraft }, editSlot)
  }

  const discard = () => {
    setCssDraft(edited.css)
    setHtmlDraft(edited.html)
  }

  // Turning it on seeds the boxes from the shared set. Turning it off drops the slot's own pair.
  const toggleSeparate = () => {
    if (locked) return
    const own = !separate[slot]
    setSeparate((s) => ({ ...s, [slot]: own }))
    if (own) setDrafts((d) => ({ ...d, [slot]: { ...d.all } }))
    else {
      setDrafts((d) => ({ ...d, [slot]: { css: '', html: '' } }))
      patchSlot({ css: '', html: '' })
    }
  }

  return (
    <section className="screenBody backgrounds">
      {locked && <p className="backgroundsHint">{lockedHint}</p>}

      <PageTabs
        tabs={backgroundSlots.map((id) => [id, slotLabel[id]] as const)}
        current={slot}
        onPick={setSlot}
      />

      <p className="backgroundsHint">
        {slot === 'all'
          ? 'Applies to every page unless a page sets its own image.'
          : `Applies to ${slotLabel[slot]}. With no image here, the one from "All pages" is used.`}
      </p>

      {narrow && <PageTabs tabs={paneTabs} current={pane} onPick={setPane} />}

      <div className="backgroundsLayout">
        {(!narrow || pane === 'image') && (
          <div className="backgroundsLeft">
            <div className="backgroundPreview">
              {preview ? (
                <img src={preview} alt="" />
              ) : (
                <span className="backgroundEmpty">No image</span>
              )}
              {inherits && preview && <span className="backgroundInherited">From All pages</span>}
            </div>

            <div className="backgroundSource">
              {/* File inputs can't be styled; the label is the button. */}
              <label className="backgroundUpload">
                <RiUploadLine size={16} />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  disabled={locked}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    const imageId = await addImage(file)
                    patchSlot({ imageId, url: '' })
                  }}
                />
              </label>

              <label>
                Image URL
                <input
                  type="text"
                  value={background.url}
                  disabled={locked}
                  placeholder="https://"
                  onChange={(e) => patchSlot({ url: e.target.value, imageId: 0 })}
                />
              </label>

              <button
                type="button"
                className="secondary"
                disabled={locked || (!background.imageId && !background.url)}
                onClick={() => patchSlot({ imageId: 0, url: '' })}
              >
                Clear
              </button>
            </div>

            <label className="backgroundFit">
              Fit
              <select
                value={background.fit}
                disabled={locked}
                onChange={(e) => patchSlot({ fit: e.target.value as BackgroundFit })}
              >
                {backgroundFits.map((fit) => (
                  <option key={fit} value={fit}>
                    {fitLabel[fit]}
                  </option>
                ))}
              </select>
            </label>
            {background.fit === 'none' && (
              <p className="hint">Hides uploaded images; for using with custom HTML/CSS</p>
            )}

            <label className="backgroundExcludeNav">
              <input
                type="checkbox"
                checked={background.excludeNav}
                disabled={locked}
                onChange={(e) => patchSlot({ excludeNav: e.target.checked })}
              />
              Start after the navigation bar
            </label>

          {images.length > 0 && (
            <div className="backgroundLibrary">
            <h3>Uploaded images</h3>
            <ul>
              {images.map((img) => (
                <li key={img.id}>
                  <button
                    type="button"
                    className={`backgroundThumb${background.imageId === img.id ? ' current' : ''}`}
                    disabled={locked}
                    title={img.name}
                    onClick={() => patchSlot({ imageId: img.id!, url: '' })}
                  >
                    <img src={img.dataUrl} alt="" />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    title="Delete"
                    onClick={() => removeImage(img.id!)}
                  >
                    <RiDeleteBinLine size={14} />
                  </button>
                </li>
              ))}
            </ul>
            </div>
          )}
          </div>
        )}

        {(!narrow || pane === 'code') && (
          <section className="panel codePanel">
            <div className="codePanelToolbar">
              <PageTabs tabs={langTabs} current={lang} onPick={setLang} />
              {slot !== 'all' && (
                <label
                  className="codePanelToggle"
                  title={`On: this page keeps its own HTML and CSS. Off: it uses the pair shared by every page.`}
                >
                  <input
                    type="checkbox"
                    checked={!!separate[slot]}
                    disabled={locked}
                    onChange={toggleSeparate}
                  />
                  Separate for {slotLabel[slot]}
                </label>
              )}
              <CodeReference>
                <p className="hint">
                  The background layer is <code>.pageBackground</code>. HTML elements are placed inside it
                  for the CSS to target.
                </p>
                <dl className="tokenGuide">
                  <div>
                    <dt>Tags</dt>
                    <dd>div, span, hr, br, p, img. Anything else is rejected until it's removed.</dd>
                  </div>
                  <div>
                    <dt>Attributes</dt>
                    <dd>class, id, style, src, alt</dd>
                  </div>
                  <div>
                    <dt>The page's image</dt>
                    <dd>
                      <code>&lt;img src="image.jpg"&gt;</code> in the HTML and <code>url(image.jpg)</code> in the
                      CSS load the image of the page being viewed.
                    </dd>
                  </div>
                  <div>
                    <dt>Turn it off</dt>
                    <dd>
                      Load the page with <code>?nocss=1</code> to turn saved CSS and HTML off.
                    </dd>
                  </div>
                </dl>
                <p className="hint">
                  CSS belongs in the CSS tab: a <code>&lt;style&gt;</code> tag is rejected. The page updates as you
                  type; nothing is saved to the preset until Apply.
                </p>
              </CodeReference>
              <button type="button" onClick={apply} disabled={!canApply}>
                Apply
              </button>
              <button type="button" className="secondary" onClick={discard} disabled={!dirty}>
                Discard
              </button>
            </div>

            <CodeEditor
              key={editSlot}
              lang={lang}
              value={lang === 'html' ? htmlDraft : cssDraft}
              disabled={locked}
              placeholder={lang === 'html' ? '<div class="orb"></div>' : '.pageBackground { filter: blur(4px); }'}
              onChange={lang === 'html' ? setHtmlDraft : setCssDraft}
            />

            {(invalidHtml.length > 0 || cssEscaped) && (
              <ul className="codePanelProblems">
                {invalidHtml.length > 0 && <li className="error">Not allowed: {invalidHtml.join(', ')}</li>}
                {cssEscaped && <li className="error">Unbalanced braces. The CSS ends before its last rule.</li>}
              </ul>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
