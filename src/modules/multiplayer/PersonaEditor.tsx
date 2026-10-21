import { useState } from 'react'
import type { JSX } from 'react'
import { Avatar } from '../../app/Avatar'
import { downscaleImage } from './downscale'
import './multiplayer.css'

/** The same caps the host validates against, so the field stops you before the wire does. */
const nameMax = 100
const descriptionMax = 2000

export interface PersonaDraft {
  name: string
  description: string
  avatar?: string
}

/**
 * One editor for a room persona, used by a guest on its own and by the host on anyone's. It reports
 * a draft and nothing more, who may save it, and when the change takes effect, is the host's call.
 */
export default function PersonaEditor({
  persona,
  onSave,
  onCancel,
}: {
  persona: PersonaDraft
  onSave: (persona: PersonaDraft) => void
  onCancel: () => void
}): JSX.Element {
  const [name, setName] = useState(persona.name)
  const [description, setDescription] = useState(persona.description)
  const [avatar, setAvatar] = useState(persona.avatar ?? '')
  const [avatarError, setAvatarError] = useState('')

  async function pickAvatar(file: File) {
    setAvatarError('')
    try {
      setAvatar(await downscaleImage(file))
    } catch {
      setAvatarError('Not a decodable image.')
    }
  }

  return (
    <form
      className="personaEditor"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSave({ name: name.trim(), description: description.trim(), avatar: avatar || undefined })
      }}
    >
      <div className="personaEditorIdentity">
        <Avatar of={avatar ? { avatar } : undefined} name={name} />
        <input
          className="personaEditorName"
          value={name}
          maxLength={nameMax}
          placeholder="Name"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <textarea
        className="personaEditorDescription"
        rows={4}
        value={description}
        maxLength={descriptionMax}
        placeholder="Description"
        onChange={(e) => setDescription(e.target.value)}
      />
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void pickAvatar(file)
        }}
      />
      {avatarError && <p className="chatError">{avatarError}</p>}
      <div className="personaEditorActions">
        <button type="submit" disabled={!name.trim()}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {avatar && (
          <button type="button" onClick={() => setAvatar('')}>
            Remove picture
          </button>
        )}
      </div>
    </form>
  )
}
