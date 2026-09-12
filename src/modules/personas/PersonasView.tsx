import { useEffect, useState } from 'react'
import type { Persona } from '../../core/storage/types'
import { Avatar } from '../../app/Avatar'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings } from '../../core/stores/settingsStore'
import { ColorInput } from '../../app/ColorInput'
import TwoColumn from '../../app/TwoColumn'
import AvatarCropDialog from '../characters/AvatarCropDialog'
import GalleryLightbox from '../characters/GalleryLightbox'

// one screen, inline editor, a persona is three fields, it doesn't need its own route.
export default function PersonasView() {
  const { personas, loading, ensureActive, save, create, remove } = usePersonas()
  const activePersonaId = useSettings((s) => s.activePersonaId)
  const setActivePersona = useSettings((s) => s.setActivePersona)
  const [draft, setDraft] = useState<Persona | null>(null)
  const [saved, setSaved] = useState(true)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // ensureActive, not load: a fresh install gets its "User" persona here as well as on send.
  useEffect(() => {
    ensureActive()
  }, [ensureActive])

  const set = <K extends keyof Persona>(key: K, value: Persona[K]) => {
    if (!draft) return
    setDraft({ ...draft, [key]: value })
    setSaved(false)
  }

  // The one write path: the debounce below and Ctrl+S both go through it. An unnamed persona is
  // never written. A blank name is what the list shows, and it would read as a broken row.
  async function persist() {
    if (!draft?.name.trim()) return
    await save(draft)
    setSaved(true)
  }

  // Debounced autosave, same 1s as the character editor.
  useEffect(() => {
    if (saved || !draft?.name.trim()) return
    const timer = setTimeout(persist, 1000)
    return () => clearTimeout(timer)
  }, [saved, draft, save])

  // Closing or switching drafts can't wait out the debounce. Write the pending edit first.
  async function flush() {
    if (!saved && draft?.name.trim()) await save(draft)
  }

  // Load the picked file into the crop dialog. The ORIGINAL lands on `avatar` and the dialog's rect
  // on `avatarCrop`, one copy of the pixels, and "View full" shows the whole image.
  function readAvatar(file: File) {
    const reader = new FileReader()
    reader.onload = () => setCropSrc(String(reader.result))
    reader.readAsDataURL(file)
  }

  function setAvatar(url: string, crop?: Persona['avatarCrop']) {
    if (!draft) return
    setDraft({ ...draft, avatar: url, avatarCrop: crop })
    setSaved(false)
  }

  return (
    <div className="personas screenFrame">
      <div className="personasHeader">
        <h2>Personas</h2>
        <button
          type="button"
          onClick={async () => {
            await flush()
            const id = await create()
            setDraft(usePersonas.getState().personas.find((p) => p.id === id) ?? null)
            setSaved(true)
          }}
        >
          New persona
        </button>
      </div>

      {loading && personas.length === 0 && <p className="placeholder">Loading…</p>}

      <TwoColumn
        list={
      <ul className="personaList">
        {personas.map((p) => (
          <li
            key={p.id}
            className={`card ${p.id === activePersonaId ? 'active' : ''} ${
              p.id === draft?.id ? 'editing' : ''
            }`}
            // Whole row opens the editor, clicking the open row closes it, same as the palette
            // list. The controls inside stop the click so they don't toggle the panel too.
            onClick={async () => {
              if (p.id === draft?.id) {
                await flush()
                setDraft(null)
              } else {
                await flush()
                setDraft({ ...p })
              }
              setSaved(true)
            }}
          >
            <input
              type="radio"
              name="activePersona"
              aria-label={`Use ${p.name || 'this persona'}`}
              checked={p.id === activePersonaId}
              onClick={(e) => e.stopPropagation()}
              onChange={() => setActivePersona(p.id!)}
            />
            <Avatar of={p} name={p.name || '?'} />
            <span className="personaName">{p.name || 'Unnamed'}</span>
            <span className="personaBlurb">{p.description}</span>
            <button
              type="button"
              className="danger"
              disabled={personas.length <= 1}
              title={personas.length <= 1 ? 'You need at least one persona.' : ''}
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Delete ${p.name || 'this persona'}?`)) {
                  if (draft?.id === p.id) {
                    setDraft(null)
                    setSaved(true)
                  }
                  remove(p.id!)
                }
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
        }
        detail={
          draft && (
        <div className="panel personaEditor">
          <label>
            Name
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </label>

          <label>
            Avatar
            <span className="personaAvatarRow">
              <Avatar of={draft} />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) readAvatar(file)
                  e.target.value = '' // let the same file re-open the dialog
                }}
              />
              {draft.avatar && (
                <>
                  {/* Cropping needs the local original; a URL avatar has no copy to crop. */}
                  {draft.avatar.startsWith('data:') && (
                    <button type="button" onClick={() => setCropSrc(draft.avatar)}>
                      Crop
                    </button>
                  )}
                  <button type="button" onClick={() => setAvatar('')}>
                    Remove
                  </button>
                  <button type="button" onClick={() => setLightbox(draft.avatar)}>
                    View full
                  </button>
                </>
              )}
            </span>
          </label>

          <fieldset className="colorsGroup">
            <legend>Colors</legend>
            <p className="hint">Overrides the global colors for this persona. Empty uses the global.</p>
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

          <label>
            Description
            <textarea
              rows={8}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
          <p className="hint">
            Only reaches the model through a Persona description block in your prompt stack.
          </p>

          <div className="personaActions">
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                await flush()
                setDraft(null)
                setSaved(true)
              }}
            >
              Close
            </button>
            {!draft.name.trim() && <span className="hint">Name required</span>}
          </div>
        </div>
          )
        }
      />

      {lightbox && <GalleryLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      {cropSrc && (
        <AvatarCropDialog
          src={cropSrc}
          initialCrop={cropSrc === draft?.avatar ? draft.avatarCrop : undefined}
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
