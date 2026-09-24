import { storage } from './db'
import { stripApiKeys } from './stripApiKeys'
import { isPartialRestore, mergeConnections, renameConnections } from './shareable'
import { tableNames, type TableName } from './storageInterface'
import { withDirtySuppressed } from '../sync/dirtyTables'
import { askKey, settingsKey } from '../sync/settingsObject'
import { hashPayload, tablePayload } from './tablePayload'
import { withSeedFlags } from './seedFlags'
import { packBackup, unpackBackup, type Backup } from './backupZip'
import { extractImages } from './imageRefs'

// settingsKey is the persisted settings store; askKey is the Ask scratchpad's transcript. Both live
// in localStorage rather than a Dexie table, and both ride in a backup and in a sync.

export type { Backup }

/**
 * What a shareable export keeps: the things a user made, rather than what they did with them.
 * lorebooks and worldInfo ride along as a pair. The entries are meaningless without the book
 * they're keyed to.
 */
const shareableTables: TableName[] = [
  'characters',
  'lorebooks',
  'worldInfo',
  'promptStacks',
  'palettes',
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
  // The Ask transcript is personal. It goes in a full backup and never in a shareable one.
  const ask = shareable ? null : localStorage.getItem(askKey)
  if (ask !== null) blobs[askKey] = ask
  return {
    format: 'nessuTavern.backup',
    version: 2,
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
 * the hash to skip a table that hasn't changed since its last push.
 *
 * Settings are deliberately absent. They never enter a table payload, which is what keeps API keys
 * on the device.
 */
export async function buildTablePayload(name: TableName) {
  // Images leave as their own files: the payload carries refs, and `images` the bytes behind them.
  const { rows, images } = await extractImages(await storage.getAll(name))
  const payload = tablePayload(name, rows)
  const json = JSON.stringify(payload)
  return { payload, json, images, hash: await hashPayload(json) }
}

export async function downloadBackup(backup: Backup, tag = '') {
  const zip = await packBackup(backup)
  const url = URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  // Minutes as well as the date: exporting twice in one day is the normal case when moving between
  // devices, and two files called the same thing is how the wrong one gets imported.
  const at = new Date(backup.exportedAt).toISOString().slice(0, 16).replace('T', '-').replace(':', '')
  link.download = `XeniaNessuvia${tag}-${at}.zip`
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked on the next tick, not inline: the browser reads the blob after the click returns, and a
  // library big enough to matter is exactly the one that loses the race and downloads as 0 bytes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export { unpackBackup as parseBackup }

/**
 * Replaces everything a full backup carries. The caller reloads afterwards so every store
 * rehydrates from disk.
 */
export async function restoreBackup(backup: Backup) {
  const partial = isPartialRestore(backup)
  // Suppressed: a restore isn't a user edit, and the settings blob written below carries the
  // dirty set the backup was taken with.
  await withDirtySuppressed(async () => {
    for (const name of tableNames) {
      // A shareable export writes only the tables it carries. Importing one adds characters and
      // prompts without clearing the chats it left out.
      //
      // A full restore means "make this browser match the file": a table the file doesn't
      // carry is emptied rather than skipped. That's the case for a table added after the file
      // was written: leaving the rows would mix a library from one install into a restore of
      // another.
      if (!(name in backup.tables)) {
        if (!partial) await storage.clear(name)
        continue
      }
      await storage.clear(name)
      const rows = backup.tables[name as TableName]
      if (Array.isArray(rows) && rows.length) await storage.putAll(name, rows)
    }
  })
  // Only keys the export writes: a tampered file can't set arbitrary localStorage.
  const settings = backup.localStorage?.[settingsKey]
  const text = typeof settings === 'string' ? settings : null
  // A shareable file's settings blob has no keys in it. Overwriting with it'd blank the
  // importer's own. Take only its connections, appended to theirs.
  localStorage.setItem(
    settingsKey,
    withSeedFlags(partial ? mergeConnections(localStorage.getItem(settingsKey), text) : text),
  )
  // Only when the file carries one: a backup written before the Ask transcript was exported would
  // otherwise wipe the scratchpad it never had a copy of.
  const ask = backup.localStorage?.[askKey]
  if (typeof ask === 'string') localStorage.setItem(askKey, ask)
}
