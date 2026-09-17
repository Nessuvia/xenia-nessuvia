/**
 * What a sync provider has to hand back, shared by s3Client and dropboxClient so neither imports
 * the other. Their own file rather than syncClient.ts: that one imports both clients, and a client
 * importing it back would be a cycle.
 */
import type { TableName } from '../storage/storageInterface.ts'

/** Which provider the app is syncing with. Both can be configured; this says which one runs. */
export type SyncProvider = 's3' | 'dropbox'

/** Hashes are keyed by provider as well as table: S3 carries our own SHA-256 as object metadata
 *  and Dropbox has nowhere to put it, so it's compared on Dropbox's content_hash instead. One set
 *  of keys would call every table changed the moment the user switched. */
export function hashKey(provider: SyncProvider, table: TableName): string {
  return `${provider}:${table}`
}

export interface TableManifestEntry {
  updatedAt: number
  hash: string | null
  size: number
}

/** A table that has never been pushed is absent, so a missing key means nothing in the cloud. */
export type Manifest = Partial<Record<TableName, TableManifestEntry>>

/** A table, plus the two localStorage blobs that ride alongside without being tables. Neither
 *  appears in the manifest: they're moved by the settings step, not by a comparison. */
export type ObjectName = TableName | 'settings' | 'ask'

export interface PulledTable {
  json: string
  hash: string
}
