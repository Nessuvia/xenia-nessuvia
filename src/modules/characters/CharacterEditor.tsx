import { useEffect, useRef, useState, type ReactNode } from 'react'
import { newCharacter, useCharacters } from '../../core/stores/charactersStore'
import { useSettings, useActiveConnection } from '../../core/stores/settingsStore'
import { ColorInput } from '../../app/ColorInput'
import type { BlockSource, Character } from '../../core/storage/types'
import { sourceLabels } from '../prompts/blockTypes'
import ParamEditor from './ParamEditor'
import AvatarCropDialog from './AvatarCropDialog'
import GalleryLightbox from './GalleryLightbox'
import { Avatar } from '../../app/Avatar'
import { CollapseButton } from '../../app/CollapseButton'
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiDeleteBinLine,
  RiImageCircleLine,
} from '@remixicon/react'
import LorebookTab from './LorebookTab'
import TrackersSection from './TrackersSection'
import TagChips from './TagChips'
import { useStacks } from '../../core/stores/stacksStore'
import { hasSource } from '../prompts/stackKinds'

// Identity and Metadata were Main and About: neither said what it held, and the labels are the
// first thing anyone reads when working out what a card is made of.
const sectionIds = ['Identity', 'Openings', 'Media', 'Lorebook', 'Trackers', 'Prompt', 'Metadata'] as const
type SectionId = (typeof sectionIds)[number]

// Not persisted, which sections are open is a glance-level choice, not a setting. Everything
// starts shut: with a summary on every header the collapsed strip is the table of contents, and
// it only fits under the chat list while it stays six rows tall.
const allShut: Record<SectionId, boolean> = {
  Identity: false,
  Openings: false,
  Media: false,
  Lorebook: false,
  Trackers: false,
  Prompt: false,
  Metadata: false,
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The leading number of a summary, for the rail badge. Empty summary means no badge. */
const railCount = (summary: string | undefined) => summary?.split(' ')[0] ?? ''

/**
 * `characterId` null means a brand new character, it's written on the first autosave, and
 * `onCreated` hands back its new id. Edits autosave 1s after the last keystroke; there is no
 * Save button.
 *
 * `header` renders inside the scrolling column above the first section: CharacterSheet passes the
 * identity block, the chat actions and the chat list through it, so reading a character and
 * editing it are one page rather than two routes.
 */
export default function CharacterEditor({
  characterId,
  onCreated,
  header,
  onSaveState,
}: {
  characterId: number | null
  onCreated?: (id: number) => void
  header?: ReactNode
  /** Save state goes to whoever owns the header bar. */
  onSaveState?: (state: string) => void
}) {
  const { characters, load, save } = useCharacters()
  const connection = useActiveConnection()
  // For the "this text is not sent" notice below: the card's prompt fields only reach the model
  // through a block, and the default stacks carry neither.
  const stacks = useStacks((s) => s.stacks)
  const loadStacks = useStacks((s) => s.load)
  const activeStackId = useSettings((s) => s.activeStackId)
  const activeStack = stacks.find((s) => s.id === activeStackId)
  // The shut Lorebook header counts attached books, not entries: the entries belong to the book
  // now, and the character only holds the attachment.
  const [draft, setDraft] = useState<Character | null>(
    characterId === null ? newCharacter() : null,
  )
  const [saved, setSaved] = useState(true)
  // A new character has no identity block or chat list above it, so open the one section there is
  // something to type into.
  const [open, setOpen] = useState<Record<SectionId, boolean>>(
    characterId === null ? { ...allShut, Identity: true } : allShut,
  )
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [galleryUrl, setGalleryUrl] = useState('')
  // Uncommitted text in the Avatar URL field; null means the field shows `draft.avatar`.
  const [urlDraft, setUrlDraft] = useState<string | null>(null)
  // Which URLs failed to load. Keyed by URL, not index, so removing an entry doesn't shift the
  // broken marks onto its neighbours.
  const [brokenUrls, setBrokenUrls] = useState<string[]>([])
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({})

  useEffect(() => {
    if (characters.length === 0) load()
  }, [characters.length, load])

  useEffect(() => {
    if (stacks.length === 0) loadStacks()
  }, [stacks.length, loadStacks])

  // Fills once, when the characters land. Switching character remounts this component
  // (the parent keys it on the id), so the draft never needs resetting in place.
  useEffect(() => {
    if (characterId === null || draft) return
    const found = characters.find((c) => c.id === characterId)
    if (found) setDraft({ ...found })
  }, [characterId, draft, characters])

  // The one write path: the debounce below and Ctrl+S both go through it. An unnamed character is
  // never written, otherwise opening the New form and typing nothing would leave a blank record.
  async function persist() {
    if (!draft || !draft.name.trim()) return
    const id = await save(draft)
    setSaved(true)
    if (draft.id === undefined) {
      setDraft({ ...draft, id })
      onCreated?.(id)
    }
  }

  // Debounced autosave, same 1s as the stack editor.
  useEffect(() => {
    if (saved || !draft || !draft.name.trim()) return
    const timer = setTimeout(persist, 1000)
    return () => clearTimeout(timer)
  }, [saved, draft, save, onCreated])

  // The header bar belongs to the sheet now, so the state it shows is reported rather than drawn.
  const saveState = !draft ? '' : draft.name.trim() ? (saved ? 'Saved' : 'Saving…') : 'Name required'
  useEffect(() => {
    onSaveState?.(saveState)
  }, [saveState, onSaveState])

  if (!draft) return <p className="placeholder">Loading…</p>

  function change(next: Character) {
    setDraft(next)
    setSaved(false)
  }

  // The default stacks carry neither block, so text typed above goes nowhere until someone adds
  // one. Say so rather than let it fail quietly. Silent only when the field is empty, a blank
  // field has nothing to drop.
  const missingBlock = (source: BlockSource, value: string | undefined) =>
    value?.trim() && activeStack && !hasSource(activeStack, source) ? (
      <p className="hint">The active prompt stack has no {sourceLabels[source]} block. This text is not sent.</p>
    ) : null

  const set = <K extends keyof Character>(key: K, value: Character[K]) =>
    change({ ...draft!, [key]: value })

  // Load the picked file into the crop dialog. The ORIGINAL lands on `avatar` and the dialog's rect
  // on `avatarCrop`, one copy of the pixels, and the Gallery shows the whole image.
  function readAvatar(file: File) {
    const reader = new FileReader()
    reader.onload = () => setCropSrc(String(reader.result))
    reader.readAsDataURL(file)
  }

  // Swapping the avatar keeps the outgoing one: it moves into the gallery so an uploaded PNG isn't
  // lost when the avatar is pointed at a URL. The crop rect goes with the avatar, not the gallery.
  function setAvatar(url: string, crop?: Character['avatarCrop']) {
    const old = draft!.avatar
    const gallery =
      old && old !== url && !draft!.gallery.includes(old)
        ? [...draft!.gallery, old]
        : draft!.gallery
    change({ ...draft!, avatar: url, avatarCrop: crop, gallery })
  }

  // The URL field commits on blur/Enter rather than per keystroke, otherwise every character typed
  // would count as an avatar swap and drop a half-typed url into the gallery.
  function commitAvatarUrl() {
    if (urlDraft === null) return
    const url = urlDraft.trim()
    setUrlDraft(null)
    if (url !== draft!.avatar) setAvatar(url)
  }

  const variants = draft.altDescriptions
  const setVariants = (
    next: Character['altDescriptions'],
    activeIndex = draft!.activeDescriptionIndex,
  ) => change({ ...draft!, altDescriptions: next, activeDescriptionIndex: activeIndex })

  const greetings = draft.alternateGreetings
  const greetingTitles = draft.greetingTitles ?? []
  // The two arrays are keyed by index, so every edit that changes the shape of one changes both.
  const setGreetings = (next: string[], titles: string[]) =>
    change({ ...draft!, alternateGreetings: next, greetingTitles: titles })

  const gallery = draft.gallery

  // The avatar shows in the gallery as a derived tile. "Set as avatar" can point `avatar` at a
  // url that's also a gallery entry, so drop that url from the gallery tiles, otherwise the same
  // url renders twice with the same key and React leaves stale duplicates until a remount.
  const galleryTiles = [
    ...(draft.avatar ? [{ url: draft.avatar, avatar: true }] : []),
    ...gallery.filter((url) => url !== draft.avatar).map((url) => ({ url, avatar: false })),
  ]

  function addGalleryImage() {
    const url = galleryUrl.trim()
    if (!url || gallery.includes(url)) return
    set('gallery', [...gallery, url])
    setGalleryUrl('')
  }

  const toggle = (id: SectionId) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }))

  const setAll = (value: boolean) =>
    setOpen(
      Object.fromEntries(sectionIds.map((id) => [id, value])) as Record<SectionId, boolean>,
    )

  // A rail click always opens; it never shuts what it scrolls to.
  const jump = (id: SectionId) => {
    setOpen((prev) => ({ ...prev, [id]: true }))
    sectionRefs.current[id]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // Every section says what it holds, open or shut. With all six shut on arrival these summaries
  // are the only thing telling you the card system is there at all, so an empty section says
  // nothing rather than "0 of x", a blank row looks like room, a zero looks like broken.
  const openings = greetings.length + (draft.firstMessage.trim() ? 1 : 0)
  const promptFields =
    (draft.systemPrompt?.trim() ? 1 : 0) +
    (draft.postHistoryInstructions?.trim() ? 1 : 0) +
    Object.keys(draft.paramOverrides ?? {}).length
  const summaries: Partial<Record<SectionId, string>> = {
    Identity: variants.length ? plural(variants.length, 'description variant') : '',
    Openings: openings ? plural(openings, 'greeting') : '',
    Media: galleryTiles.length ? plural(galleryTiles.length, 'image') : '',
    Lorebook: (draft.lorebookIds ?? []).length
      ? plural((draft.lorebookIds ?? []).length, 'lorebook')
      : '',
    Trackers: draft.trackers?.length ? plural(draft.trackers.length, 'tracker') : '',
    Prompt: promptFields ? plural(promptFields, 'override') : '',
    Metadata: (draft.tags ?? []).length ? plural((draft.tags ?? []).length, 'tag') : '',
  }

  // Top and bottom of the strip: from either end, every section is one click from open or shut.
  const bulkRow = (
    <div className="sectionBulk">
      <button
        type="button"
        title="Collapse all"
        aria-label="Collapse all"
        onClick={() => setAll(false)}
      >
        <RiArrowUpSLine size={18} />
      </button>
      <button
        type="button"
        title="Expand all"
        aria-label="Expand all"
        onClick={() => setAll(true)}
      >
        <RiArrowDownSLine size={18} />
      </button>
    </div>
  )

  const section = (id: SectionId, children: ReactNode) => (
    <section
      key={id}
      className={open[id] ? 'editorSection' : 'editorSection shut'}
      ref={(el) => {
        sectionRefs.current[id] = el
      }}
    >
      <div className="editorSectionHeader" onClick={() => toggle(id)}>
        <h3>{id}</h3>
        {summaries[id] && <span className="hint">{summaries[id]}</span>}
        <span onClick={(e) => e.stopPropagation()}>
          <CollapseButton label={id} collapsed={!open[id]} onToggle={() => toggle(id)} />
        </span>
      </div>
      {open[id] && <div className="editorSectionBody">{children}</div>}
    </section>
  )

  return (
    <div className="characters characterEditor screenFrame">
      <div className="editorLayout">
        {/* Hidden below the breakpoint by CSS, the shut section headers are the table of
            contents on a phone. The counts make the rail a map of what this card holds rather
            than six identical words. */}
        <nav className="editorRail">
          {sectionIds.map((id) => (
            <button key={id} type="button" onClick={() => jump(id)}>
              {id}
              {railCount(summaries[id]) && (
                <span className="railCount">{railCount(summaries[id])}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="screenBody editorSections">
          {header}

          {bulkRow}

          {section(
            'Identity',
            <>
              <label title="Sent to the model and swapped in for {{char}}.">
                Name
                <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
              </label>

              <label title="Shown in the app only.">
                Display name
                <input
                  value={draft.displayName ?? ''}
                  placeholder={draft.name}
                  onChange={(e) => set('displayName', e.target.value)}
                />
              </label>
              <p className="hint">Shown in lists, the character page, and chats. Empty uses the name. {'{{char}}'} and requests always use the name.</p>

              <div className="descriptionList">
                <div
                  className={
                    draft.activeDescriptionIndex === -1
                      ? 'descriptionRow active'
                      : 'descriptionRow'
                  }
                >
                  <div
                    className="descriptionRowHeader"
                    onClick={() => set('activeDescriptionIndex', -1)}
                  >
                    <span className="descriptionTitle" title="Click a description to make it the one sent.">Default description</span>
                  </div>
                  <textarea
                    rows={12}
                    value={draft.description}
                    onChange={(e) => set('description', e.target.value)}
                  />
                </div>

                {variants.map((v, i) => (
                  <div
                    key={i}
                    className={
                      draft.activeDescriptionIndex === i
                        ? 'descriptionRow active'
                        : 'descriptionRow'
                    }
                  >
                    <div
                      className="descriptionRowHeader"
                      onClick={() => set('activeDescriptionIndex', i)}
                    >
                      <input
                        className="descriptionTitle"
                        value={v.title}
                        placeholder="Title"
                        onChange={(e) =>
                          setVariants(
                            variants.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          const next = variants.filter((_, j) => j !== i)
                          // Removing the active one (or anything before it) must not shift the
                          // selection onto a different variant.
                          const active =
                            draft.activeDescriptionIndex === i
                              ? -1
                              : draft.activeDescriptionIndex > i
                                ? draft.activeDescriptionIndex - 1
                                : draft.activeDescriptionIndex
                          setVariants(next, active)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    <textarea
                      rows={6}
                      value={v.content}
                      onChange={(e) =>
                        setVariants(
                          variants.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setVariants([...variants, { title: '', content: '' }])}
              >
                Add variant
              </button>

              <label title="A short summary of how the character behaves. Sent through a Character personality block.">
                Personality
                <textarea
                  rows={4}
                  value={draft.personality}
                  onChange={(e) => set('personality', e.target.value)}
                />
              </label>

              <label title="The situation the chat starts in. Sent through a Character scenario block.">
                Scenario
                <textarea
                  rows={4}
                  value={draft.scenario}
                  onChange={(e) => set('scenario', e.target.value)}
                />
              </label>

              <label title="Sample exchanges that show the character's voice. Sent through a Character example dialogue block.">
                Example dialogue
                <textarea
                  rows={8}
                  value={draft.exampleDialogue}
                  onChange={(e) => set('exampleDialogue', e.target.value)}
                />
              </label>
            </>,
          )}

          {section(
            'Openings',
            <>
              {/* Same row layout as the descriptions above: a greeting is as long as a
                  description and was getting a quarter of the space. The rows aren't selectable
                  here, every greeting becomes a swipe on the first message, so there's no
                  active one to pick. */}
              <div className="descriptionList openingsList">
                <div className="descriptionRow">
                  <div className="descriptionRowHeader">
                    <span className="descriptionTitle" title="The character's opening line in a new chat. Alternate greetings become swipes on it.">First message</span>
                  </div>
                  <textarea
                    rows={10}
                    value={draft.firstMessage}
                    onChange={(e) => set('firstMessage', e.target.value)}
                  />
                </div>

                {greetings.map((g, i) => (
                  <div key={i} className="descriptionRow">
                    <div className="descriptionRowHeader">
                      <input
                        className="descriptionTitle"
                        value={greetingTitles[i] ?? ''}
                        placeholder={`Alternate greeting ${i + 1}`}
                        onChange={(e) =>
                          setGreetings(
                            greetings,
                            // Pad rather than index past the end: naming the third greeting first
                            // must not leave holes the first two can't be typed into.
                            greetings.map((_, j) =>
                              j === i ? e.target.value : (greetingTitles[j] ?? ''),
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          setGreetings(
                            greetings.filter((_, j) => j !== i),
                            greetings.map((_, j) => greetingTitles[j] ?? '').filter((_, j) => j !== i),
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                    <textarea
                      rows={8}
                      value={g}
                      onChange={(e) =>
                        setGreetings(
                          greetings.map((x, j) => (j === i ? e.target.value : x)),
                          greetingTitles,
                        )
                      }
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                // Padded first: an imported card has greetings and no titles at all, and appending
                // to the short array would name the wrong rows.
                onClick={() =>
                  setGreetings(
                    [...greetings, ''],
                    [...greetings.map((_, j) => greetingTitles[j] ?? ''), ''],
                  )
                }
              >
                Add greeting
              </button>
            </>,
          )}

          {section(
            'Media',
            <>
              <label>
                Avatar
                <span className="avatarRow">
                  <Avatar of={draft} />
                  <label className="fileButton">
                    Replace
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) readAvatar(file)
                        e.target.value = '' // let the same file re-open the dialog
                      }}
                    />
                  </label>
                  {draft.avatar && (
                    <>
                      {/* Cropping re-bakes the pixels, which only works on the uploaded base64
                          original, a URL avatar has no local copy to crop. */}
                      {draft.avatar.startsWith('data:') && (
                        <button type="button" onClick={() => setCropSrc(draft.avatar)}>
                          Crop
                        </button>
                      )}
                      <button type="button" onClick={() => setAvatar('')}>
                        Remove
                      </button>
                    </>
                  )}
                </span>
              </label>

              <label title="An image address. Replaces the uploaded avatar.">
                Avatar URL
                <input
                  type="url"
                  placeholder="https://"
                  value={urlDraft ?? (draft.avatar.startsWith('data:') ? '' : draft.avatar)}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onBlur={commitAvatarUrl}
                  onKeyDown={(e) => e.key === 'Enter' && commitAvatarUrl()}
                />
              </label>
              {draft.avatar && !draft.avatar.startsWith('data:') && (
                <p className="hint">
                  This avatar loads from a URL. If the link breaks, the image is lost. Download it
                  and upload it to keep a local copy.
                </p>
              )}

              <label>
                Image URL
                <span className="galleryAdd">
                  <input
                    type="url"
                    value={galleryUrl}
                    placeholder="https://"
                    onChange={(e) => setGalleryUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addGalleryImage()
                      }
                    }}
                  />
                  <button type="button" onClick={addGalleryImage}>
                    Add
                  </button>
                </span>
              </label>
              <p className="hint">Images load from their URL each time. A broken link loses the image.</p>

              {galleryTiles.length === 0 ? (
                <p className="placeholder">No images.</p>
              ) : (
                <div className="galleryGrid">
                  {galleryTiles.map(({ url, avatar }) => (
                    <figure key={url}>
                      {brokenUrls.includes(url) ? (
                        <div className="galleryBroken">
                          <span>Image did not load</span>
                          {/* A data URL is the whole image; printing it would fill the tile. */}
                          {!url.startsWith('data:') && (
                            <span className="galleryBrokenUrl">{url}</span>
                          )}
                        </div>
                      ) : (
                        <img
                          src={url}
                          alt=""
                          onClick={() => setLightbox(url)}
                          onError={() =>
                            setBrokenUrls((prev) => (prev.includes(url) ? prev : [...prev, url]))
                          }
                        />
                      )}
                      {avatar ? (
                        <span className="galleryTileNote">Avatar</span>
                      ) : (
                        <span className="galleryTileActions">
                          {/* A gallery data URL carries its own bytes; a gallery URL becomes a URL
                              avatar (crop is dropped, it framed a different image). */}
                          <button type="button" onClick={() => setAvatar(url)}>
                            <RiImageCircleLine size={14} />
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => set('gallery', gallery.filter((g) => g !== url))}
                          >
                            <RiDeleteBinLine size={14} />
                          </button>
                        </span>
                      )}
                    </figure>
                  ))}
                </div>
              )}

              <fieldset className="colorsGroup">
                <legend>Colors</legend>
                <p className="hint">Overrides the global colors for this character. Empty uses the global.</p>
                <label>
                  Text
                  <ColorInput
                    value={draft.colors.textColor}
                    onChange={(v) => set('colors', { ...draft.colors, textColor: v })}
                  />
                </label>
                <label>
                  Emphasis
                  <ColorInput
                    value={draft.colors.emphasisColor}
                    onChange={(v) => set('colors', { ...draft.colors, emphasisColor: v })}
                  />
                </label>
                <label>
                  Bold
                  <ColorInput
                    value={draft.colors.boldColor}
                    onChange={(v) => set('colors', { ...draft.colors, boldColor: v })}
                  />
                </label>
                <label>
                  Quote
                  <ColorInput
                    value={draft.colors.quoteColor}
                    onChange={(v) => set('colors', { ...draft.colors, quoteColor: v })}
                  />
                </label>
              </fieldset>
            </>,
          )}

          {section(
            'Lorebook',
            <LorebookTab
              character={draft}
              onChange={(lorebookIds) => change({ ...draft, lorebookIds })}
            />,
          )}

          {section('Trackers', <TrackersSection character={draft} onChange={(p) => change({ ...draft, ...p })} />)}

          {section(
            'Prompt',
            <>
              <label title="Replaces the text of a Character system prompt block for this character.">
                System prompt
                <textarea
                  rows={4}
                  value={draft.systemPrompt ?? ''}
                  onChange={(e) => set('systemPrompt', e.target.value)}
                />
              </label>
              <p className="hint">
                Used by a Character system prompt block. Empty uses the block's own text.{' '}
                {'{{original}}'} inserts that text.
              </p>
              {missingBlock('characterSystemPrompt', draft.systemPrompt)}

              <label title="Replaces the text of a Character post-history instructions block. Sent after the chat history.">
                Post-history instructions
                <textarea
                  rows={4}
                  value={draft.postHistoryInstructions ?? ''}
                  onChange={(e) => set('postHistoryInstructions', e.target.value)}
                />
              </label>
              {missingBlock('characterPostHistory', draft.postHistoryInstructions)}

              {connection ? (
                <>
                  <p className="hint">
                    Parameters are used for every chat with this character. An empty field uses the
                    connection's value.
                  </p>
                  <ParamEditor
                    overrides={draft.paramOverrides ?? {}}
                    connection={connection}
                    onChange={(paramOverrides) => set('paramOverrides', paramOverrides)}
                  />
                </>
              ) : (
                <p className="hint">Pick an active connection in Settings to set parameters.</p>
              )}
            </>,
          )}

          {section(
            'Metadata',
            <>
              <label title="The first tag groups the character in the picker.">
                Tags
                <TagChips tags={draft.tags ?? []} onChange={(tags) => set('tags', tags)} />
              </label>

              <label title="Who made the card. Not sent to the model.">
                Creator
                <input value={draft.creator ?? ''} onChange={(e) => set('creator', e.target.value)} />
              </label>

              <label title="The card's version. Not sent to the model.">
                Character version
                <input
                  value={draft.characterVersion ?? ''}
                  onChange={(e) => set('characterVersion', e.target.value)}
                />
              </label>

              <label title="Notes for people using the card.">
                Creator notes
                <textarea
                  rows={4}
                  value={draft.creatorNotes ?? ''}
                  onChange={(e) => set('creatorNotes', e.target.value)}
                />
              </label>
              <p className="hint">Not sent to the model.</p>
            </>,
          )}

          {bulkRow}
        </div>
      </div>

      {lightbox && <GalleryLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      {cropSrc && (
        <AvatarCropDialog
          src={cropSrc}
          initialCrop={cropSrc === draft.avatar ? draft.avatarCrop : undefined}
          onCancel={() => setCropSrc(null)}
          onConfirm={({ crop }) => {
            setAvatar(cropSrc, crop)
            setCropSrc(null)
          }}
        />
      )}
    </div>
  )
}
