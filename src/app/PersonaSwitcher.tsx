import { useEffect, useState } from 'react'
import { useCloseOnOutside } from './useCloseOnOutside'
import { usePersonas } from '../core/stores/personasStore'
import { useSettings } from '../core/stores/settingsStore'
import type { Persona } from '../core/storage/types'
import { Avatar } from './Avatar'
import { RiQuillPenLine } from '@remixicon/react'
import { isNarrator, narratorName } from '../core/multiplayer/narrator'
import './personaSwitcher.css'

function avatarNode(p: Persona, onClick?: () => void) {
  const title = p.description ? `${p.name || 'Unnamed'}, ${p.description}` : p.name || 'Unnamed'
  // The Narrator has no portrait and never will: it's a role rather than a person. The quill sits
  // in the same 36px circle as the real avatars, with a slow ring behind it so the odd one out in
  // the row reads as deliberate.
  if (isNarrator(p.id)) {
    return (
      <span
        key={p.id}
        className="personaSwitchAvatar narratorPersona"
        title="Narrator. Your messages are direction for the scene."
        onClick={onClick}
        aria-label={narratorName}
      >
        <RiQuillPenLine size={18} />
      </span>
    )
  }
  return (
    <Avatar
      of={p}
      key={p.id}
      name={p.name || '?'}
      className="personaSwitchAvatar"
      title={title}
      onClick={onClick}
    />
  )
}

// Avatar quick-switch for the active persona; clicking opens the others as icons.
// The active persona is a global default (settingsStore), not per-chat, switching here
// changes who you're everywhere. Per-chat override would be the upgrade path.
export default function PersonaSwitcher() {
  const personas = usePersonas((s) => s.personas)
  const activePersonaId = useSettings((s) => s.activePersonaId)
  const setActivePersona = useSettings((s) => s.setActivePersona)
  const load = usePersonas((s) => s.load)
  const [open, setOpen] = useState(false)
  const ref = useCloseOnOutside(open, () => setOpen(false))

  // The rail shows this on every screen. It can't wait for a view that loads personas.
  useEffect(() => {
    if (personas.length === 0) void load()
  }, [personas.length, load])

  const active = personas.find((p) => p.id === activePersonaId) ?? personas[0]
  if (!active) return null

  return (
    <div className="personaSwitch" ref={ref}>
      {open && (
        <div className="panel personaSwitchMenu">
          {personas
            .filter((p) => p.id !== active.id)
            .map((p) =>
              avatarNode(p, () => {
                setActivePersona(p.id!)
                setOpen(false)
              }),
            )}
        </div>
      )}
      {avatarNode(active, () => setOpen((v) => !v))}
    </div>
  )
}
