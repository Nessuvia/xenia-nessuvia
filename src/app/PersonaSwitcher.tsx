import { useEffect, useState } from 'react'
import { useCloseOnOutside } from './useCloseOnOutside'
import { usePersonas } from '../core/stores/personasStore'
import { useSettings } from '../core/stores/settingsStore'
import type { Persona } from '../core/storage/types'
import { Avatar } from './Avatar'
import './personaSwitcher.css'

function avatarNode(p: Persona, onClick?: () => void) {
  const title = p.description ? `${p.name || 'Unnamed'}, ${p.description}` : p.name || 'Unnamed'
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
// changes who you are everywhere. Per-chat override would be the upgrade path.
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
