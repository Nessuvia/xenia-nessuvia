import { create } from 'zustand'
import { storage } from '../storage/db'
import { buildTablePayload } from '../storage/backup'
import { hashPayload } from '../storage/tablePayload'
import { askKey, keepDeviceFields, settingsKey } from './settingsObject'
import { tableNames, type TableName } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { TablePayload } from '../storage/tablePayload'
import { useSettings } from '../stores/settingsStore'
import { withDirtySuppressed } from './dirtyTables'
import { hashKey } from './syncTypes'
import * as client from './syncClient'
import { inlineImages, referencedImages } from '../storage/imageRefs'

/** Checked here so an oversized table fails before the request instead of as a 413. Chunking is out
 *  of scope: a partial write is worse than a refusal. */
const maxPayloadBytes = 90_000_000

export type Verdict = 'identical' | 'localOnly' | 'cloudOnly' | 'both'
export type Direction = 'push' | 'pull'

export interface TableComparison {
  verdict: Verdict
  /** The obvious direction, pre-filled. Null for `both`, which the user has to decide: an
   *  unresolved collision is refused by apply rather than settled by a default. */
  suggested: Direction | null
  /** Stamped by the store, not this device. Absent when the table has never been pushed. */
  cloudUpdatedAt: number | null
}

export type Comparison = Partial<Record<TableName, TableComparison>>

export interface Progress {
  /** What's happening right now. Replaced by the next step, so there's no log to read. */
  label: string
  /** Steps finished, out of `total`. The bar is done/total, so it only moves on a success. */
  done: number
  total: number
  /** Set when a step threw. The label is left holding the failure instead of being replaced. */
  failed: boolean
}

interface SyncState {
  status: 'idle' | 'comparing' | 'applying'
  error: string
  comparison: Comparison | null
  /** The run in progress, as one line and a count. Null until a run starts. A pull ends in a
   *  reload, which clears it. */
  progress: Progress | null
  compare(): Promise<void>
  /** The tables to move, and optionally the settings object, in one run. `settings` on its own is
   *  a valid call: `decisions` is then empty and the run is one step long. */
  apply(decisions: Partial<Record<TableName, Direction>>, settings?: Direction | null): Promise<void>
  clearError(): void
}


function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Sync failed.'
}

/** Replaces the current line. Hoisted, so it can reach the store it's defined above. */
function step(label: string, done: number, total: number) {
  useSync.setState({ progress: { label, done, total, failed: false } })
}

/**
 * Leaves the failing step on screen, with the reason appended to it rather than replacing it.
 * `done` stays where it was, so the bar shows how far it got.
 *
 * The step's own label is the half that says which table and which direction, and a run that
 * stops on the seventh upload is unreadable without it.
 */
function fail(reason: string) {
  useSync.setState((s) => ({
    progress: {
      label: `${s.progress?.label ?? 'Stopped'} ${reason}`,
      done: s.progress?.done ?? 0,
      total: s.progress?.total ?? 1,
      failed: true,
    },
  }))
}

function size(bytes: number): string {
  return bytes < 1_000_000 ? `${Math.round(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`
}

export const useSync = create<SyncState>()((set, get) => ({
  status: 'idle',
  error: '',
  comparison: null,
  progress: null,

  compare: async () => {
    set({ status: 'comparing', error: '', comparison: null })
    try {
      const manifest = await client.fetchManifest()
      const { dirtyTables, tableHashes, syncProvider } = useSettings.getState()
      const comparison: Comparison = {}

      for (const table of tableNames) {
        const cloud = manifest[table] ?? null
        const synced = tableHashes[hashKey(syncProvider, table)] ?? null
        // A dirty table gets hashed: the flag says it was written to, not that the content ended up
        // different. An unchanged table then costs one hash and no upload.
        const local = dirtyTables.includes(table) ? (await buildTablePayload(table)).hash : synced

        const localChanged = local !== synced
        const cloudChanged = cloud !== null && cloud.hash !== synced
        const cloudUpdatedAt = cloud?.updatedAt ?? null

        if (cloud !== null && cloud.hash === local) {
          // Both sides already agree, whatever either flag says.
          comparison[table] = { verdict: 'identical', suggested: null, cloudUpdatedAt }
          if (local) useSettings.getState().setTableSynced(table, local)
        } else if (localChanged && cloudChanged) {
          comparison[table] = { verdict: 'both', suggested: null, cloudUpdatedAt }
        } else if (cloudChanged) {
          comparison[table] = { verdict: 'cloudOnly', suggested: 'pull', cloudUpdatedAt }
        } else if (localChanged || cloud === null) {
          // cloud === null with no local change still means the cloud has nothing to show.
          comparison[table] = { verdict: 'localOnly', suggested: 'push', cloudUpdatedAt }
        } else {
          comparison[table] = { verdict: 'identical', suggested: null, cloudUpdatedAt }
        }
      }
      set({ comparison })
    } catch (err) {
      set({ error: message(err) })
    } finally {
      set({ status: 'idle' })
    }
  },

  apply: async (decisions, settingsDirection = null) => {
    const comparison = get().comparison
    // A collision can't be resolved by inaction: every both-changed table needs a direction.
    const undecided = comparison
      ? (Object.entries(comparison) as [TableName, TableComparison][])
          .filter(([table, c]) => c.verdict === 'both' && !decisions[table])
          .map(([table]) => table)
      : []
    if (undecided.length) {
      set({ error: `Choose a direction for ${undecided.join(', ')}.` })
      return
    }

    const queue = Object.entries(decisions) as [TableName, Direction][]
    // The settings object is one more step on the same bar. It's not a table and never appears in
    // the comparison: the two-device case is "send it from the device that has the keys".
    const total = queue.length + (settingsDirection ? 1 : 0)
    set({ status: 'applying', error: '', progress: { label: 'Starting...', done: 0, total, failed: false } })
    const settings = useSettings.getState()
    const pulled: TableName[] = []
    let settingsPulled = false
    // Listed once, on the first push that has images, and grown as this run uploads.
    let cloudImages: Set<string> | null = null
    try {
      for (const [index, [name, direction]] of queue.entries()) {
        const table = name as TableName
        if (direction === 'push') {
          step(`Uploading ${table}...`, index, total)
          const { json, hash, images } = await buildTablePayload(table)
          const bytes = new Blob([json]).size
          if (bytes > maxPayloadBytes) {
            throw new Error(
              `${table} is ${(bytes / 1_000_000).toFixed(1)} MB. The limit is ${maxPayloadBytes / 1_000_000} MB.`,
            )
          }
          // Images first: a table in the bucket must never refer to an image that isn't there yet.
          const known = images.size ? (cloudImages ??= await client.listImages()) : new Set<string>()
          for (const [imageName, bytes] of images) {
            if (known.has(imageName)) continue
            step(`Uploading ${table} images...`, index, total)
            await client.pushImage(imageName, bytes)
            known.add(imageName)
          }
          // Recorded as what the provider stored rather than what was sent: Dropbox compares on
          // its own content_hash, and the S3 client hands the same hash straight back.
          settings.setTableSynced(table, await client.pushTable(table, json, hash))
          step(`Uploaded ${table}, ${size(bytes)}.`, index + 1, total)
        } else {
          step(`Downloading ${table}...`, index, total)
          const object = await client.pullTable(table)
          if (!object) {
            step(`${table} isn't in the bucket. Skipped.`, index + 1, total)
            continue
          }
          const payload = JSON.parse(object.json) as TablePayload
          if (payload.format !== 'nessuTavern.table' || payload.table !== table) {
            throw new Error(`${table} came back in an unrecognized format.`)
          }
          const images = new Map<string, Uint8Array>()
          for (const imageName of referencedImages(object.json)) {
            const bytes = await client.pullImage(imageName)
            if (bytes) images.set(imageName, bytes)
          }
          const rows = await inlineImages(payload.rows as StoredRecord[], images)
          // Suppressed: a pull isn't a user edit. The table is recorded clean below, with the
          // hash it was pulled at, rather than left holding whatever flag it had.
          await withDirtySuppressed(async () => {
            await storage.clear(table)
            if (rows.length) await storage.putAll(table, rows)
          })
          settings.setTableSynced(table, object.hash)
          pulled.push(table)
          step(
            `Downloaded ${table}, ${rows.length} record${rows.length === 1 ? '' : 's'}.`,
            index + 1,
            total,
          )
        }
      }
      // The bundled Nessuvia card and the default palettes live behind flags in settings, which are
      // not synced. Without this a second device would seed its own copies on top of the pulled
      // rows. Before the settings step: every one of these writes the persisted settings blob, and
      // a settings pull has already replaced it in localStorage by then.
      if (pulled.includes('characters')) settings.markCharactersSeeded()
      if (pulled.includes('palettes')) settings.markPalettesSeeded()
      if (pulled.includes('paramDefs')) settings.markParamDefsSeeded()
      // Stacks matter twice over: stacksStore.load seeds two rows and calls setActiveId for them.
      // Without this a pulled promptStacks table comes back with two extras and the active stack
      // pointing at one of them.
      if (pulled.includes('promptStacks')) settings.markStacksSeeded()

      if (settingsDirection === 'push') {
        step('Uploading settings...', queue.length, total)
        const json = localStorage.getItem(settingsKey) ?? '{}'
        await client.pushTable('settings', json, await hashPayload(json))
        const ask = localStorage.getItem(askKey)
        // Nothing written in Ask yet on this device. Uploading '{}' over the other device's
        // scratchpad would be a silent delete.
        if (ask !== null) await client.pushTable('ask', ask, await hashPayload(ask))
        step(`Uploaded settings, ${size(new Blob([json]).size)}.`, queue.length + 1, total)
      } else if (settingsDirection === 'pull') {
        step('Downloading settings...', queue.length, total)
        const object = await client.pullTable('settings')
        if (!object) throw new Error('The bucket has no settings to download.')
        // Absent in a bucket last written before Ask was synced. Leaving this device's scratchpad
        // alone is the right answer either way. Both reads happen before either write: a failed
        // request must not leave localStorage half replaced.
        const ask = await client.pullTable('ask')
        localStorage.setItem(settingsKey, keepDeviceFields(object.json, localStorage.getItem(settingsKey)))
        if (ask) localStorage.setItem(askKey, ask.json)
        settingsPulled = true
        step('Downloaded settings.', queue.length + 1, total)
      }

      // Skipped after a settings pull: the store still holds the old blob in memory, and any write
      // to it would persist that straight back over the one just written to localStorage.
      if (!settingsPulled) settings.setLastSyncedAt(Date.now())
      step(pulled.length || settingsPulled ? 'Done. Reloading.' : 'Done.', total, total)
    } catch (err) {
      fail(`stopped: ${message(err)}`)
      set({ error: message(err), status: 'idle' })
      return
    }

    if (pulled.length || settingsPulled) {
      // Every store holds its rows in memory. A reload is how they all rehydrate at once.
      location.reload()
      return
    }
    set({ status: 'idle', comparison: null })
  },

  clearError: () => set({ error: '' }),
}))

/**
 * Image names in the bucket that no table in the bucket refers to: what replacing an avatar
 * leaves behind. Read-only. Deleting, previewing or restoring them is for a tool built on this.
 *
 * Reads the bucket's tables rather than local ones: this device may be behind or ahead, and an
 * image only this device's copy refers to still belongs to someone.
 */
export async function findUnreferencedImages(): Promise<string[]> {
  const present = await client.listImages()
  for (const table of tableNames) {
    const object = await client.pullTable(table)
    if (object) for (const name of referencedImages(object.json)) present.delete(name)
  }
  return [...present]
}
