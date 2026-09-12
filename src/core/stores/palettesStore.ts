import { useMemo } from 'react'
import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import {
  defaultPalette,
  nextOrder,
  resolvePalette,
  sortByOrder,
  type Palette,
} from '../palette/palette'
import {
  generatePalette,
  type PaletteAttempt,
  type PaletteError,
} from '../palette/generatePalette'
import { bundledPalettes } from '../palette/bundledPalettes'
import { remapImages } from '../palette/importPalettes'
import { useBackgroundImages } from './backgroundImagesStore'
import { useSettings, type Connection } from './settingsStore'

/** What a palette held before LLM last overwrote it. One level, in memory only, it dies
 *  on reload, and a persisted undo history is a different feature. */
export interface PaletteSnapshot {
  paletteId: number
  palette: Palette
}

/** Fields the rewind controls can restore: everything but the row's identity. */
export type PaletteField = Exclude<keyof Palette, 'id' | 'ownerId'>

interface PalettesState {
  palettes: Palette[]
  loaded: boolean
  generating: boolean
  generateError: string
  /** What the endpoint sent on the failed run, for the panel's collapsible. Null when the last run
   *  worked, or when it failed before anything came back. */
  generateAttempt: PaletteAttempt | null
  snapshot: PaletteSnapshot | null
  /** Ask the active connection for a scheme and write it into `palette`. */
  generate(ask: string, palette: Palette, connection: Connection): Promise<void>
  /** Abort the in-flight generate. No-op when nothing is running. */
  cancelGenerate(): void
  /** Put one field back to its snapshot value. The rest stay changed and stay rewindable. */
  rewind(field: PaletteField): Promise<void>
  /** Put the whole palette back and drop the snapshot. */
  rewindAll(): Promise<void>
  load(): Promise<void>
  /** Copy of `fromId`, or a new preset holding the default colors. Returns the new id. */
  create(fromId?: number): Promise<number>
  update(id: number, patch: Partial<Palette>): Promise<void>
  remove(id: number): Promise<void>
  /** Import: append rows with fresh ids, clashing names suffixed. Nothing existing is touched. */
  add(rows: Palette[]): Promise<void>
  /** Move a row one place up (-1) or down (+1). No-op at either end. */
  move(id: number, delta: -1 | 1): Promise<void>
}

let generateAbort: AbortController | null = null

export const usePalettes = create<PalettesState>()((set, get) => ({
  palettes: [],
  loaded: false,
  generating: false,
  generateError: '',
  generateAttempt: null,
  snapshot: null,

  generate: async (ask, palette, connection) => {
    if (get().generating || palette.id === undefined) return
    set({ generating: true, generateError: '', generateAttempt: null })
    // One controller in module scope. `generating` already forbids a second run.
    generateAbort = new AbortController()
    try {
      const { palette: next, mode } = await generatePalette(
        useSettings.getState().palettePrompt,
        ask,
        palette,
        connection,
        generateAbort.signal,
      )
      // What the endpoint accepted, remembered: the walk down the ladder happens once.
      if (mode !== connection.structuredOutput) {
        useSettings.getState().updateConnection({ ...connection, structuredOutput: mode })
      }
      const { id: _id, ownerId: _ownerId, ...fields } = next
      // Snapshot only once the reply parsed: a failed run leaves nothing to rewind.
      set({ snapshot: { paletteId: palette.id, palette } })
      await get().update(palette.id, fields)
    } catch (err) {
      const failed = err as PaletteError
      // A cancel is the user's own doing. It leaves no error behind.
      if (generateAbort?.signal.aborted) set({ generateError: '', generateAttempt: null })
      else set({ generateError: failed.message, generateAttempt: failed.attempt ?? null })
    } finally {
      generateAbort = null
      set({ generating: false })
    }
  },

  cancelGenerate: () => generateAbort?.abort(),

  rewind: async (field) => {
    const snapshot = get().snapshot
    if (!snapshot) return
    await get().update(snapshot.paletteId, { [field]: snapshot.palette[field] })
  },

  rewindAll: async () => {
    const snapshot = get().snapshot
    if (!snapshot) return
    const { id: _id, ownerId: _ownerId, ...fields } = snapshot.palette
    set({ snapshot: null })
    await get().update(snapshot.paletteId, fields)
  },

  load: async () => {
    // The palettes that ship with the build, seeded on first run as ordinary rows: editable, and
    // once deleted they stay gone. The flag is what makes a delete stick, without it every load
    // would write them back.
    if (!useSettings.getState().seededPalettes) {
      useSettings.getState().markPalettesSeeded()
      let first: number | null = null
      let finalFrontierId: number | null = null
      let order = 0
      for (const { palette, images } of bundledPalettes()) {
        // Per palette rather than per file: `importImages` reuses a row whose bytes it already
        // holds. Two palettes out of one file still share the one image row.
        const map = await useBackgroundImages.getState().importImages(images)
        const { id: _id, ...fields } = remapImages(palette, map)
        const id = await storage.put('palettes', {
          ...fields,
          orderId: order++,
          ownerId: currentOwnerId(),
        } as unknown as StoredRecord)
        if (palette.name === 'Final Frontier') finalFrontierId = id
        first ??= id
      }
      // Use Final Frontier as the default when it was bundled; otherwise fall back to first.
      const defaultId = finalFrontierId ?? first
      if (defaultId === null) {
        const { id: _id, ...fields } = defaultPalette
        const id = await storage.put('palettes', {
          ...fields,
          orderId: 0,
          ownerId: currentOwnerId(),
        } as unknown as StoredRecord)
        useSettings.getState().setActivePalette(id)
      } else {
        useSettings.getState().setActivePalette(defaultId)
      }
    }
    const rows = (await storage.getAll('palettes')) as unknown as Palette[]
    set({ palettes: sortByOrder(rows), loaded: true })
  },

  create: async (fromId) => {
    const from = fromId === undefined ? undefined : get().palettes.find((p) => p.id === fromId)
    const source = resolvePalette(from ?? defaultPalette)
    const { id: _id, ...fields } = source
    const name = from ? `${source.name} copy` : 'New preset'
    const record = {
      ...fields,
      ownerId: currentOwnerId(),
      name: uniqueName(name, get().palettes),
      // A copy lands at the end rather than beside its source: the list is short and the new row
      // being where new rows always are beats keeping it next to what it came from.
      orderId: nextOrder(get().palettes),
    }
    const id = await storage.put('palettes', record as unknown as StoredRecord)
    await get().load()
    return id
  },

  update: async (id, patch) => {
    const current = get().palettes.find((p) => p.id === id)
    if (!current) return
    const next = { ...current, ...patch, id, ownerId: currentOwnerId() }
    // Optimistic: the editor writes on every keystroke and the whole app rerenders from this list.
    // Waiting on Dexie before showing the change would lag every swatch drag.
    set({ palettes: get().palettes.map((p) => (p.id === id ? next : p)) })
    await storage.put('palettes', next as unknown as StoredRecord)
  },

  remove: async (id) => {
    // The last one stays: with no rows there is nothing to edit and the app falls back to the
    // built-in constant. The button is disabled too; this is the guard behind it.
    if (get().palettes.length <= 1) return
    await storage.remove('palettes', id)
    if (get().snapshot?.paletteId === id) set({ snapshot: null })
    if (useSettings.getState().activePaletteId === id) useSettings.getState().setActivePalette(null)
    await get().load()
  },

  add: async (rows) => {
    for (const row of rows) {
      const { id: _id, ...fields } = row
      const record = {
        ...fields,
        ownerId: currentOwnerId(),
        name: uniqueName(row.name, get().palettes),
        // An imported row's own position means nothing here; it appends like any other new row.
        orderId: nextOrder(get().palettes),
      }
      await storage.put('palettes', record as unknown as StoredRecord)
      // Reloaded per row. The next name check sees the one just written.
      await get().load()
    }
  },

  move: async (id, delta) => {
    const rows = get().palettes
    const from = rows.findIndex((p) => p.id === id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= rows.length) return
    const next = rows.slice()
    next[from] = rows[to]
    next[to] = rows[from]
    // Positions are renumbered from scratch, which also gives an orderId to any row that predates
    // the field. Only the rows whose number actually changed get written.
    const renumbered = next.map((p, i) => ({ ...p, orderId: i }))
    set({ palettes: renumbered })
    for (let i = 0; i < renumbered.length; i++) {
      if (next[i].orderId !== i) {
        await storage.put('palettes', renumbered[i] as unknown as StoredRecord)
      }
    }
  },
}))


/** `Name`, `Name (2)`, `Name (3)`, etc. */
function uniqueName(wanted: string, existing: Palette[]): string {
  const taken = new Set(existing.map((p) => p.name))
  if (!taken.has(wanted)) return wanted
  let n = 2
  while (taken.has(`${wanted} (${n})`)) n++
  return `${wanted} (${n})`
}

/**
 * Editing target for the appearance controls. `locked` is true when no palette row is active:
 * every one deleted, or a stale id. The app renders the built-in constant then, with nothing to
 * write to. Every control that calls this disables itself and shows the same line.
 */
export function usePaletteEditor(): {
  palette: Palette
  locked: boolean
  patch(fields: Partial<Palette>): void
} {
  const palette = usePalette()
  const activeId = useSettings((s) => s.activePaletteId)
  const update = usePalettes((s) => s.update)
  const locked = palette.id === undefined || activeId === null
  return {
    palette,
    locked,
    patch: (fields) => {
      if (!locked) update(palette.id!, fields)
    },
  }
}

export const lockedHint = 'No preset is selected. Add one to make changes.'

/** The active palette, resolved. `activePaletteId` null, or pointing at a deleted row, falls back
 *  to the built-in default. */
export function usePalette(): Palette {
  const palettes = usePalettes((s) => s.palettes)
  const activeId = useSettings((s) => s.activePaletteId)
  return useMemo(
    () => resolvePalette(palettes.find((p) => p.id === activeId)),
    [palettes, activeId],
  )
}

/** The same palette, outside React, for the code that reads it once rather than rendering it. */
export function activePalette(): Palette {
  const activeId = useSettings.getState().activePaletteId
  return resolvePalette(usePalettes.getState().palettes.find((p) => p.id === activeId))
}
