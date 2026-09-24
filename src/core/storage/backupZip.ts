/**
 * A backup file is a ZIP laid out the way sync lays out a bucket:
 *
 *   manifest.json       format, version, exportedAt, shareable
 *   <table>.json        a TablePayload, the same object sync pushes
 *   settings.json       the settings blob, as sync pushes it
 *   ask.json            the Ask transcript
 *   images/<name>       one file per image, named by imageRefs.ts
 *
 * Pure, extension-ful imports: checkBackupZip.ts round-trips it under node. backup.ts pulls in
 * Dexie and can't.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { extractImages, imageNamePattern, inlineImages } from './imageRefs.ts'
import { tableNames, type StoredRecord } from './storageInterface.ts'
import { askKey, settingsKey } from '../sync/settingsObject.ts'
import { tablePayload, type TablePayload } from './tablePayload.ts'

/** The two localStorage blobs a backup carries, and the file each one travels as. */
const blobFiles: Record<string, string> = {
  [settingsKey]: 'settings.json',
  [askKey]: 'ask.json',
}

export interface Backup {
  format: 'nessuTavern.backup'
  version: 2
  exportedAt: number
  /** Whether the file is a sanitized export. Restore reads it to decide whether the file replaces
   *  the library or adds to it. */
  shareable: boolean
  tables: Record<string, StoredRecord[]>
  localStorage: Record<string, string>
}

export async function packBackup(backup: Backup): Promise<Uint8Array> {
  const { tables, localStorage, ...manifest } = backup
  const files: Zippable = { 'manifest.json': strToU8(JSON.stringify(manifest)) }
  const images = new Map<string, Uint8Array>()
  for (const [name, rows] of Object.entries(tables)) {
    const extracted = await extractImages(rows, images)
    files[`${name}.json`] = strToU8(JSON.stringify(tablePayload(name as never, extracted.rows)))
  }
  for (const [key, file] of Object.entries(blobFiles)) {
    if (key in localStorage) files[file] = strToU8(localStorage[key])
  }
  // Stored, not deflated: image formats are compressed already and a second pass only costs time.
  for (const [name, bytes] of images) files[`images/${name}`] = [bytes, { level: 0 }]
  return zipSync(files)
}

/** Untrusted file input: reject anything that isn't a backup before touching the database. Only
 *  names this build knows are read; anything else in the archive is ignored. */
export async function unpackBackup(bytes: Uint8Array): Promise<Backup> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('Not a backup file.')
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : null)

  const manifest = JSON.parse(text('manifest.json') ?? '{}') as Partial<Backup>
  if (manifest.format !== 'nessuTavern.backup') throw new Error('Not a backup file.')
  // A newer version could carry a table this build clears but can't repopulate. A restore from
  // one would lose data rather than fail.
  if (typeof manifest.version !== 'number' || manifest.version > 2) {
    throw new Error('This backup is from a newer version of the app.')
  }

  const images = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(files)) {
    const name = path.slice('images/'.length)
    if (path.startsWith('images/') && imageNamePattern.test(name)) images.set(name, data)
  }

  const tables: Record<string, StoredRecord[]> = {}
  for (const name of tableNames) {
    const json = text(`${name}.json`)
    if (json === null) continue
    const payload = JSON.parse(json) as TablePayload
    if (payload.format !== 'nessuTavern.table' || payload.table !== name || !Array.isArray(payload.rows)) {
      throw new Error(`${name} in this backup is in an unrecognized format.`)
    }
    tables[name] = await inlineImages(payload.rows, images)
  }

  const localStorage: Record<string, string> = {}
  for (const [key, file] of Object.entries(blobFiles)) {
    const blob = text(file)
    if (blob !== null) localStorage[key] = blob
  }

  return {
    format: 'nessuTavern.backup',
    version: 2,
    exportedAt: Number(manifest.exportedAt) || 0,
    shareable: manifest.shareable === true,
    tables,
    localStorage,
  }
}
