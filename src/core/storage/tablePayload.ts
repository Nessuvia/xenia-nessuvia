// Pure: no Dexie, no store. checkTablePayload.ts builds and hashes a payload under
// node --experimental-strip-types: extensioned imports and nothing platform-specific beyond
// crypto.subtle, which Node and the browser both have.
import type { StoredRecord, TableName } from './storageInterface.ts'

/** One table, as it is stored in R2. No ownerId and no timestamp: the owner comes from the
 *  verified JWT and `updatedAt` is stamped server-side. A client cannot assert either. */
export interface TablePayload {
  format: 'nessuTavern.table'
  version: 1
  table: TableName
  rows: StoredRecord[]
}

/**
 * Rows are sorted by id: the hash describes the data rather than Dexie's iteration order. Rows
 * without an id sort last, in the order given. A stored row always has one. This only covers
 * a caller passing unsaved records.
 */
export function tablePayload(table: TableName, rows: StoredRecord[]): TablePayload {
  const sorted = [...rows].sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity))
  return { format: 'nessuTavern.table', version: 1, table, rows: sorted }
}

/** Lowercase hex SHA-256 of the serialized payload: the hash of the bytes that get uploaded. A
 *  manifest hash and a local hash are comparable without downloading anything. */
export async function hashPayload(json: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
