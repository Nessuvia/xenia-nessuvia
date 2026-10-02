import { create } from 'zustand'
import { storage } from '../storage/db'
import { keepDeviceFields, settingsKey } from './settingsObject'
import type { StoredRecord, TableName } from '../storage/storageInterface'
import { useSettings } from '../stores/settingsStore'
import { withDirtySuppressed } from './dirtyTables'
import { deleteFile, listFiles, pullFile, pushFile, type CloudFile } from './dropboxClient'
import { dropboxContentHash } from './dropboxHash'
import { inlineImages, referencedImages } from '../storage/imageRefs'
import {
  buildGroup,
  chatPath,
  groupOf,
  groupTables,
  imageDir,
  parsePath,
  parsePayload,
  syncGroups,
  type LocalFile,
  type SyncFileKind,
  type SyncGroup,
  type SyncPayload,
} from './syncFiles'

/** Checked here so an oversized file fails before the request instead of partway through. Dropbox
 *  takes 150 MB in one upload. Chunking is out of scope: a partial write is worse than a refusal. */
const maxPayloadBytes = 90_000_000

export type Verdict = 'localOnly' | 'cloudOnly' | 'both'
export type Direction = 'push' | 'pull'

/** One sync file that differs between this browser and Dropbox. Identical files aren't listed. */
export interface FileComparison {
  path: string
  label: string
  verdict: Verdict
  /** The obvious direction, pre-filled. Null for `both`, which the user has to decide: an
   *  unresolved collision is refused by apply rather than settled by a default. */
  suggested: Direction | null
  /** Whether the file exists on each side. A missing one is a deletion waiting to be copied. */
  here: boolean
  there: boolean
}

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
  comparison: FileComparison[] | null
  /** The run in progress, as one line and a count. Null until a run starts. A pull ends in a
   *  reload, which clears it. */
  progress: Progress | null
  compare(): Promise<void>
  /** The files to move, keyed by path, and optionally the settings file, in one run. `settings` on
   *  its own is a valid call: `decisions` is then empty and the run is one step long. */
  apply(decisions: Record<string, Direction>, settings?: Direction | null): Promise<void>
  /** Compare, then move every file that differs in one direction. */
  applyAll(direction: Direction, settings?: Direction | null): Promise<void>
  clearError(): void
}

/** What the last compare saw, held for apply: the files it built and the folder listing. Not in the
 *  store, since nothing renders it and a library's worth of JSON doesn't belong in React state. */
let built = new Map<string, LocalFile>()
let cloud = new Map<string, CloudFile>()

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

async function buildFromStorage(group: SyncGroup): Promise<LocalFile[]> {
  const rows: Partial<Record<TableName, StoredRecord[]>> = {}
  for (const table of groupTables(group)) rows[table] = await storage.getAll(table)
  return buildGroup(group, rows)
}

/** What the row says. Read from this browser, so a file that only exists in Dropbox shows its path. */
async function labelFor(path: string, kind: SyncFileKind): Promise<string> {
  if (kind.kind === 'table') return kind.table
  const character = await storage.get('characters', kind.characterId)
  const name = String(character?.displayName || character?.name || `Character ${kind.characterId}`)
  if (kind.kind === 'card') return character ? name : path
  const chat = await storage.get('chats', kind.chatId)
  return chat ? `${name} · ${chat.title || `Chat ${kind.chatId}`}` : path
}

/** A pulled file written over the rows it stands for. Runs with dirty tracking off. */
async function writeLocal(kind: SyncFileKind, payload: SyncPayload, images: Map<string, Uint8Array>) {
  const rows = async (table: keyof SyncPayload['tables']) =>
    inlineImages((payload.tables[table] ?? []) as StoredRecord[], images)
  if (kind.kind === 'table') {
    const pulled = await rows(kind.table)
    await storage.clear(kind.table)
    if (pulled.length) await storage.putAll(kind.table, pulled)
  } else if (kind.kind === 'card') {
    await storage.putAll('characters', await rows('characters'))
  } else {
    await removeMessages(kind.chatId)
    await storage.putAll('chats', await rows('chats'))
    // No ids in the file: Dexie hands out fresh ones, so they can't land on another chat's.
    await storage.putAll('messages', await rows('messages'))
  }
}

async function removeMessages(chatId: number) {
  for (const m of await storage.find('messages', 'chatId', chatId)) await storage.remove('messages', m.id!)
}

/** A file deleted in Dropbox, deleted here. A chat is only removed when it still lives at that path:
 *  one moved to another character since is a different file now. */
async function removeLocal(kind: SyncFileKind, path: string) {
  if (kind.kind === 'table') return storage.clear(kind.table)
  if (kind.kind === 'card') {
    if (await storage.get('characters', kind.characterId)) await storage.remove('characters', kind.characterId)
    return
  }
  const chat = await storage.get('chats', kind.chatId)
  if (!chat || chatPath(chat.characterId as number, kind.chatId) !== path) return
  await removeMessages(kind.chatId)
  await storage.remove('chats', kind.chatId)
}

export const useSync = create<SyncState>()((set, get) => ({
  status: 'idle',
  error: '',
  comparison: null,
  progress: null,

  compare: async () => {
    set({ status: 'comparing', error: '', comparison: null })
    try {
      cloud = await listFiles()
      built = new Map()
      const { dirtyTables, syncedHashes, markTablesClean, setSyncedHashes } = useSettings.getState()
      const local = new Map<string, string>()
      const rebuilt: SyncGroup[] = []

      for (const group of syncGroups) {
        const synced = Object.keys(syncedHashes).filter((p) => {
          const kind = parsePath(p)
          return kind && groupOf(kind) === group
        })
        // A clean group is exactly what was last synced, so its hashes stand in for it and nothing
        // gets built. A group with nothing on record is built anyway: it has never been compared.
        if (synced.length && !groupTables(group).some((t) => dirtyTables.includes(t))) {
          for (const p of synced) local.set(p, syncedHashes[p])
          continue
        }
        for (const file of await buildFromStorage(group)) {
          built.set(file.path, file)
          local.set(file.path, file.hash)
        }
        rebuilt.push(group)
      }

      const localChats = new Set<number>()
      for (const p of local.keys()) {
        const kind = parsePath(p)
        if (kind?.kind === 'chat') localChats.add(kind.chatId)
      }

      const paths = new Set([...local.keys(), ...Object.keys(syncedHashes), ...cloud.keys()])
      const comparison: FileComparison[] = []
      const agreed: Record<string, string | null> = {}
      for (const path of paths) {
        const kind = parsePath(path)
        if (!kind) continue
        const mine = local.get(path) ?? null
        const theirs = cloud.get(path)?.hash ?? null
        const synced = syncedHashes[path] ?? null
        if (mine === theirs) {
          // Both sides agree, whatever the record says. Absent on both is a finished deletion.
          if (mine !== synced) agreed[path] = mine
          continue
        }
        const localChanged = mine !== synced
        const cloudChanged = theirs !== synced
        let verdict: Verdict = localChanged && cloudChanged ? 'both' : cloudChanged ? 'cloudOnly' : 'localOnly'
        // A chat id from another device that's already taken here, under another character. Pulling
        // it would write over this browser's chat of the same id.
        if (verdict === 'cloudOnly' && mine === null && kind.kind === 'chat' && localChats.has(kind.chatId)) {
          verdict = 'both'
        }
        comparison.push({
          path,
          label: await labelFor(path, kind),
          verdict,
          suggested: verdict === 'both' ? null : verdict === 'cloudOnly' ? 'pull' : 'push',
          here: mine !== null,
          there: theirs !== null,
        })
      }
      setSyncedHashes(agreed)

      // A rebuilt group with nothing left to move is clean again, and the next compare skips it.
      const pending = new Set(comparison.map((c) => groupOf(parsePath(c.path)!)))
      markTablesClean(rebuilt.filter((g) => !pending.has(g)).flatMap(groupTables))

      comparison.sort((a, b) => a.path.localeCompare(b.path))
      set({ comparison })
    } catch (err) {
      set({ error: message(err) })
    } finally {
      set({ status: 'idle' })
    }
  },

  applyAll: async (direction, settingsDirection = null) => {
    await get().compare()
    if (get().error) return
    const decisions = Object.fromEntries((get().comparison ?? []).map((c) => [c.path, direction]))
    await get().apply(decisions, settingsDirection)
  },

  apply: async (decisions, settingsDirection = null) => {
    const comparison = get().comparison ?? []
    const queue = Object.entries(decisions)
    // A collision can't be resolved by inaction: every both-changed file needs a direction.
    const undecided = comparison.filter((c) => c.verdict === 'both' && !decisions[c.path])
    if (queue.length && undecided.length) {
      set({ error: `Choose a direction for ${undecided.map((c) => c.label).join(', ')}.` })
      return
    }

    // The settings file is one more step on the same bar. It's not compared: the two-device case
    // is "send it from the device that has the keys".
    const total = queue.length + (settingsDirection ? 1 : 0)
    set({ status: 'applying', error: '', progress: { label: 'Starting...', done: 0, total, failed: false } })
    const settings = useSettings.getState()
    const pulled = new Set<SyncGroup>()
    let settingsPulled = false
    try {
      for (const [index, [path, direction]] of queue.entries()) {
        const kind = parsePath(path)
        if (!kind) continue
        const label = comparison.find((c) => c.path === path)?.label ?? path
        if (direction === 'push') {
          // A clean group wasn't built by compare. Built now, once, if a push needs it.
          const here = comparison.find((c) => c.path === path)?.here ?? true
          if (here && !built.has(path)) {
            for (const file of await buildFromStorage(groupOf(kind))) built.set(file.path, file)
          }
          const file = built.get(path)
          if (!file) {
            step(`Deleting ${label} from Dropbox...`, index, total)
            await deleteFile(path)
            settings.setSyncedHashes({ [path]: null })
            step(`Deleted ${label} from Dropbox.`, index + 1, total)
            continue
          }
          step(`Uploading ${label}...`, index, total)
          const bytes = new Blob([file.json]).size
          if (bytes > maxPayloadBytes) {
            throw new Error(`${label} is ${size(bytes)}. The limit is ${size(maxPayloadBytes)}.`)
          }
          // Images first: a file in Dropbox must never refer to an image that isn't there yet.
          const dir = imageDir(path)
          for (const [name, image] of file.images) {
            if (cloud.has(`${dir}/${name}`)) continue
            step(`Uploading ${label} images...`, index, total)
            cloud.set(`${dir}/${name}`, { hash: await pushFile(`${dir}/${name}`, image), updatedAt: Date.now() })
          }
          settings.setSyncedHashes({ [path]: await pushFile(path, file.json) })
          step(`Uploaded ${label}, ${size(bytes)}.`, index + 1, total)
        } else {
          step(`Downloading ${label}...`, index, total)
          const bytes = await pullFile(path)
          if (!bytes) {
            await withDirtySuppressed(() => removeLocal(kind, path))
            settings.setSyncedHashes({ [path]: null })
            pulled.add(groupOf(kind))
            step(`Removed ${label}.`, index + 1, total)
            continue
          }
          const json = new TextDecoder().decode(bytes)
          const payload = parsePayload(json, path)
          const dir = imageDir(path)
          const images = new Map<string, Uint8Array>()
          for (const name of referencedImages(json)) {
            const image = await pullFile(`${dir}/${name}`)
            if (image) images.set(name, image)
          }
          // Suppressed: a pull isn't a user edit. The file is recorded at the hash it was pulled at.
          await withDirtySuppressed(() => writeLocal(kind, payload, images))
          settings.setSyncedHashes({ [path]: await dropboxContentHash(json) })
          pulled.add(groupOf(kind))
          step(`Downloaded ${label}.`, index + 1, total)
        }
      }
      // The bundled Nessuvia card and the default palettes live behind flags in settings, which are
      // not synced. Without this a second device would seed its own copies on top of the pulled
      // rows. Before the settings step: every one of these writes the persisted settings blob, and
      // a settings pull has already replaced it in localStorage by then.
      if (pulled.has('characters')) settings.markCharactersSeeded()
      if (pulled.has('palettes')) settings.markPalettesSeeded()
      if (pulled.has('paramDefs')) settings.markParamDefsSeeded()
      // Stacks matter twice over: stacksStore.load seeds two rows and calls setActiveId for them.
      // Without this a pulled promptStacks table comes back with two extras and the active stack
      // pointing at one of them.
      if (pulled.has('promptStacks')) settings.markStacksSeeded()

      if (settingsDirection === 'push') {
        step('Uploading settings...', queue.length, total)
        const json = localStorage.getItem(settingsKey) ?? '{}'
        await pushFile('settings.json', json)
        step(`Uploaded settings, ${size(new Blob([json]).size)}.`, queue.length + 1, total)
      } else if (settingsDirection === 'pull') {
        step('Downloading settings...', queue.length, total)
        const bytes = await pullFile('settings.json')
        if (!bytes) throw new Error('Dropbox has no settings to download.')
        const json = new TextDecoder().decode(bytes)
        localStorage.setItem(settingsKey, keepDeviceFields(json, localStorage.getItem(settingsKey)))
        settingsPulled = true
        step('Downloaded settings.', queue.length + 1, total)
      }

      // Skipped after a settings pull: the store still holds the old blob in memory, and any write
      // to it would persist that straight back over the one just written to localStorage.
      if (!settingsPulled) settings.setLastSyncedAt(Date.now())
      step(pulled.size || settingsPulled ? 'Done. Reloading.' : 'Done.', total, total)
    } catch (err) {
      fail(`stopped: ${message(err)}`)
      set({ error: message(err), status: 'idle' })
      return
    }

    built = new Map()
    if (pulled.size || settingsPulled) {
      // Every store holds its rows in memory. A reload is how they all rehydrate at once.
      location.reload()
      return
    }
    set({ status: 'idle', comparison: null })
  },

  clearError: () => set({ error: '' }),
}))
