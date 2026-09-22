import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { Persona } from '../storage/types'
import { emptyColors } from '../storage/types'
import { useSettings } from './settingsStore'
import { isNarrator, narratorPersona, realPersonas } from '../multiplayer/narrator'

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
    // The Narrator rides at the end of the list rather than in Dexie, so every
    // `personas.find(p => p.id === activePersonaId)` in the app resolves it with no special case.
    // Last, so `personas[0]` stays a real persona everywhere it's used as a fallback.
    set({ personas: [...rows, narratorPersona()], loading: false })
  },

  save: async (persona) => {
    if (isNarrator(persona.id)) return persona.id!
    const now = Date.now()
    const record = { ...persona, createdAt: persona.createdAt || now, updatedAt: now }
    const id = await storage.put('personas', record as unknown as StoredRecord)
    await get().load()
    return id
  },

  create: async () => {
    const id = await get().save(newPersona(`Persona ${realPersonas(get().personas).length + 1}`))
    setActiveId(id)
    return id
  },

  remove: async (id) => {
    if (isNarrator(id)) return
    if (realPersonas(get().personas).length <= 1) return
    await storage.remove('personas', id)
    await get().load()
    if (useSettings.getState().activePersonaId === id) {
      setActiveId(get().personas[0]?.id ?? null)
    }
  },

  ensureActive: async () => {
    await get().load()
    const activePersonaId = useSettings.getState().activePersonaId
    // The Narrator is a real answer here, but never the fallback: a fresh install still gets "User".
    const existing =
      get().personas.find((p) => p.id === activePersonaId) ?? realPersonas(get().personas)[0]
    if (existing) {
      if (existing.id !== activePersonaId) setActiveId(existing.id!)
      return existing
    }
    const id = await get().save(newPersona('User'))
    setActiveId(id)
    return get().personas.find((p) => p.id === id)!
  },
}))
