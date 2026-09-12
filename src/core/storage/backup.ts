import { storage } from './db'
import { stripApiKeys } from './stripApiKeys'
import { isPartialRestore, mergeConnections, renameConnections } from './shareable'
import { tableNames, type StoredRecord, type TableName } from './storageInterface'
import { withDirtySuppressed } from '../sync/dirtyTables'
import { hashPayload, tablePayload } from './tablePayload'
import { withSeedFlags } from './seedFlags'

/** The persisted settings store. */
const settingsKey = 'nessuTavern.settings'
/** The Ask scratchpad's transcript. It lives in localStorage rather than a Dexie table, so nothing
 *  else in the export path would carry it, and it is the user's writing like any chat is. */
const askKey = 'nessuTavern.ask'

export interface Backup {
  format: 'nessuTavern.backup'
  version: 1
  exportedAt: number
  /** Whether the file is a sanitized export. Restore reads it to decide whether the file replaces
   *  the library or adds to it. Written either way since 0.0.43; absent on a file older than the
   *  field, which is why restore still has a fallback. */
  shareable?: boolean
  tables: Record<string, StoredRecord[]>
  localStorage: Record<string, string>
}

/**
 * What a shareable export keeps: the things a user made, not what they did with them. lorebooks and
 * worldInfo ride along as a pair, the entries are meaningless without the book they are keyed to.
 */
const shareableTables: TableName[] = [
  'characters',
  'lorebooks',
  'worldInfo',
  'promptStacks',
  'palettes',
  // A pipeline is an opinion about prose and carries nothing personal. The connection ids in its
  // rewrite stages will not resolve in another install, which reads as "not armed" rather than as
  // a leak: the id names a row in the recipient's own settings, and the endpoint and key stay here.
  'pipelines',
]

export interface BackupOptions {
  /** Keep API keys in the settings blob. Only ever true when the user turned it on in Settings. */
  keys?: boolean
  /** Drop chats, stories and everything else personal, and rename connections. Forces keys off. */
  shareable?: boolean
}

export async function buildBackup({ keys, shareable }: BackupOptions = {}): Promise<Backup> {
  const names = shareable ? shareableTables : tableNames
  const entries = await Promise.all(
    names.map(async (name) => [name, await storage.getAll(name)] as const),
  )
  const raw = localStorage.getItem(settingsKey)
  // A shareable file never carries keys, whatever the setting says.
  const settings = keys && !shareable ? raw : stripApiKeys(raw)
  const scrubbed = shareable ? renameConnections(settings) : settings
  const blobs: Record<string, string> = {}
  if (scrubbed !== null) blobs[settingsKey] = scrubbed
  // The Ask transcript is personal, so it goes in a full backup and never in a shareable one.
  const ask = shareable ? null : localStorage.getItem(askKey)
  if (ask !== null) blobs[askKey] = ask
  return {
    format: 'nessuTavern.backup',
    version: 1,
    exportedAt: Date.now(),
    // Written on a full export too, not just a sanitized one. Left off, restore has to guess, and
    // the guess is what broke: a table added in a later version made every older full backup look
    // sanitized. Saying so outright means a file written today never has to be guessed about.
    shareable: !!shareable,
    tables: Object.fromEntries(entries),
    localStorage: blobs,
  }
}


/**
 * One table, ready to push: the payload, the exact JSON that goes over the wire, and its hash.
 * Serialized once, the push path needs the string for its size check and as the request body, and
 * the hash to skip a table that has not changed since its last push.
 *
 * Settings are deliberately absent. They never enter a table payload, which is what keeps API keys
 * on the device.
 */
export async function buildTablePayload(name: TableName) {
  const payload = tablePayload(name, await storage.getAll(name))
  const json = JSON.stringify(payload)
  return { payload, json, hash: await hashPayload(json) }
}

export function downloadBackup(backup: Backup, tag = '') {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  // Minutes as well as the date: exporting twice in one day is the normal case when moving between
  // devices, and two files called the same thing is how the wrong one gets imported.
  const at = new Date(backup.exportedAt).toISOString().slice(0, 16).replace('T', '-').replace(':', '')
  link.download = `XeniaNessuvia${tag}-${at}.json`
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked on the next tick, not inline: the browser reads the blob after the click returns, and a
  // library big enough to matter is exactly the one that loses the race and downloads as 0 bytes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Untrusted file input: reject anything that isn't a backup before touching the database. */
export function parseBackup(text: string): Backup {
  const data = JSON.parse(text) as Partial<Backup>
  if (data.format !== 'nessuTavern.backup' || !data.tables) throw new Error('Not a backup file.')
  // A newer version could carry a table this build clears but cannot repopulate, so a restore from
  // one would lose data rather than fail.
  if (typeof data.version === 'number' && data.version > 1) {
    throw new Error('This backup is from a newer version of the app.')
  }
  return data as Backup
}

/**
 * Replaces everything a full backup carries. The caller reloads afterwards so every store
 * rehydrates from disk.
 */
export async function restoreBackup(backup: Backup) {
  const partial = isPartialRestore(backup)
  // Suppressed: a restore is not a user edit, and the settings blob written below carries the
  // dirty set the backup was taken with.
  await withDirtySuppressed(async () => {
    for (const name of tableNames) {
      // A shareable export writes only the tables it carries, so importing one adds characters and
      // prompts without clearing the chats it left out.
      //
      // A full restore means "make this browser match the file", so a table the file does not
      // carry is emptied rather than skipped. That is the case for a table added after the file
      // was written: leaving the rows would mix a library from one install into a restore of
      // another, and for `pipelines` specifically it would sit alongside whatever the 0.0.42
      // importer then builds from the restored settings.
      if (!(name in backup.tables)) {
        if (!partial) await storage.clear(name)
        continue
      }
      await storage.clear(name)
      const rows = backup.tables[name as TableName]
      if (Array.isArray(rows) && rows.length) await storage.putAll(name, rows)
    }
  })
  // Only keys the export writes, so a tampered file can't set arbitrary localStorage.
  const settings = backup.localStorage?.[settingsKey]
  const text = typeof settings === 'string' ? settings : null
  // A shareable file's settings blob has no keys in it. Overwriting with it would blank the
  // importer's own, so take only its connections, appended to theirs.
  localStorage.setItem(
    settingsKey,
    withSeedFlags(partial ? mergeConnections(localStorage.getItem(settingsKey), text) : text),
  )
  // Only when the file carries one: a backup written before the Ask transcript was exported would
  // otherwise wipe the scratchpad it never had a copy of.
  const ask = backup.localStorage?.[askKey]
  if (typeof ask === 'string') localStorage.setItem(askKey, ask)
}
