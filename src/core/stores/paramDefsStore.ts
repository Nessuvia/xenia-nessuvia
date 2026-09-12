import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { ParamDef } from '../params/paramDef'
import { builtinParamDefs } from '../params/builtins'
import { useSettings } from './settingsStore'

interface ParamDefsState {
  defs: ParamDef[]
  loaded: boolean
  load(): Promise<void>
  /** Returns the new row's id, or null when the key is already taken. */
  create(def: ParamDef): Promise<number | null>
  update(id: number, patch: Partial<ParamDef>): Promise<void>
  remove(id: number): Promise<void>
}

export const useParamDefs = create<ParamDefsState>()((set, get) => ({
  defs: [],
  loaded: false,

  load: async () => {
    // The samplers that ship with the build, seeded on first run as ordinary rows: editable, and
    // once deleted they stay gone. The flag is what makes a delete stick, without it every load
    // would write them back. Same contract as the bundled palettes.
    if (!useSettings.getState().seededParamDefs) {
      useSettings.getState().markParamDefsSeeded()
      for (const def of builtinParamDefs()) {
        await storage.put('paramDefs', def as unknown as StoredRecord)
      }
    }
    const rows = (await storage.getAll('paramDefs')) as unknown as ParamDef[]
    set({ defs: rows, loaded: true })
  },

  create: async (def) => {
    // Keys are the reference connections store. Two defs can't share one.
    if (get().defs.some((d) => d.key === def.key)) return null
    const { id: _id, ...fields } = def
    const id = await storage.put('paramDefs', {
      ...fields,
      ownerId: currentOwnerId(),
    } as unknown as StoredRecord)
    await get().load()
    return id
  },

  update: async (id, patch) => {
    const current = get().defs.find((d) => d.id === id)
    if (!current) return
    const next = { ...current, ...patch, id, ownerId: currentOwnerId() }
    set({ defs: get().defs.map((d) => (d.id === id ? next : d)) })
    await storage.put('paramDefs', next as unknown as StoredRecord)
  },

  remove: async (id) => {
    await storage.remove('paramDefs', id)
    await get().load()
  },
}))

/** The library outside React, for the send path and the previews, which read it once per call
 *  rather than rendering it. */
export function paramDefList(): ParamDef[] {
  return useParamDefs.getState().defs
}
