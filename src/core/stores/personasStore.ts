import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { Persona } from '../storage/types'
import { emptyColors } from '../storage/types'
import { useSettings } from './settingsStore'

export function newPersona(name = ''): Persona {
  return { ownerId: currentOwnerId(), name, avatar: '', description: '', createdAt: 0, updatedAt: 0, colors: emptyColors() }
}

function setActiveId(activePersonaId: number | null) {
  useSettings.setState({ activePersonaId })
}

interface PersonasState {
  personas: Persona[]
  loading: boolean
  load(): Promise<void>
  save(persona: Persona): Promise<number>
  create(): Promise<number>
  /** Refused on the last one: there's always a persona to be. */
  remove(id: number): Promise<void>
  /** The persona chat should use, creating "User" on first run rather than erroring. */
  ensureActive(): Promise<Persona>
}

export const usePersonas = create<PersonasState>()((set, get) => ({
  personas: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const rows = (await storage.getAll('personas')) as unknown as Persona[]
    for (const p of rows) p.colors = { ...emptyColors(), ...p.colors }
    set({ personas: rows, loading: false })
  },

  save: async (persona) => {
    const now = Date.now()
    const record = { ...persona, createdAt: persona.createdAt || now, updatedAt: now }
    const id = await storage.put('personas', record as unknown as StoredRecord)
    await get().load()
    return id
  },

  create: async () => {
    const id = await get().save(newPersona(`Persona ${get().personas.length + 1}`))
    setActiveId(id)
    return id
  },

  remove: async (id) => {
    if (get().personas.length <= 1) return
    await storage.remove('personas', id)
    await get().load()
    if (useSettings.getState().activePersonaId === id) {
      setActiveId(get().personas[0]?.id ?? null)
    }
  },

  ensureActive: async () => {
    await get().load()
    const activePersonaId = useSettings.getState().activePersonaId
    const existing = get().personas.find((p) => p.id === activePersonaId) ?? get().personas[0]
    if (existing) {
      if (existing.id !== activePersonaId) setActiveId(existing.id!)
      return existing
    }
    const id = await get().save(newPersona('User'))
    setActiveId(id)
    return get().personas.find((p) => p.id === id)!
  },
}))
