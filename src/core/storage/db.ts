import Dexie from 'dexie'
import type { Storage, StoredRecord, TableName } from './storageInterface'
import { currentOwnerId } from './storageInterface'
import { markDirty } from '../sync/dirtyTables'

const db = new Dexie('nessuTavern')

// The only schema block. Versions 1 to 13 were deleted: none carried an upgrade() callback, and the
// chain did nothing a single declaration doesn't. An older local DB upgrades straight to this
// schema. The number only ever goes up. IndexedDB refuses to open a database whose
// stored version is higher than the one requested. Renumbering to 1 would throw VersionError on
// every browser that already has the data.
db.version(16).stores({
  characters: '++id, ownerId',
  personas: '++id, ownerId',
  worldInfo: '++id, ownerId, bookId',
  lorebooks: '++id, ownerId',
  chats: '++id, ownerId, characterId',
  messages: '++id, ownerId, chatId',
  promptStacks: '++id, ownerId',
  stories: '++id, ownerId',
  chapters: '++id, ownerId, storyId',
  palettes: '++id, ownerId',
  backgroundImages: '++id, ownerId',
  bodyTrackers: '++id, ownerId, chatId',
  bodyMaps: '++id, ownerId',
  paramDefs: '++id, ownerId, key',
  games: '++id, ownerId, characterId',
  pipelines: '++id, ownerId',
})

function table(name: TableName) {
  return db.table<StoredRecord, number>(name)
}

// Two owner ids coexist in one IndexedDB after a sign-in. get, find and remove filter by owner
// the way getAll always has. get and remove throw on a foreign row rather than returning undefined
// or deleting nothing: a caller holding an id from another account is a bug, and a silent no-op
// hides it.
function foreignRow(name: TableName, id: number): Error {
  return new Error(`${name} record ${id} belongs to another account.`)
}

export const storage: Storage = {
  get: async (name, id) => {
    const record = await table(name).get(id)
    if (record && record.ownerId !== currentOwnerId()) throw foreignRow(name, id)
    return record
  },
  getAll: (name) => table(name).where('ownerId').equals(currentOwnerId()).toArray(),
  // Filters rather than throws: a multi-row query has no single offending id to name, and the
  // right answer for a query is the caller's own rows.
  find: (name, field, value) =>
    table(name)
      .where(field)
      .equals(value as never)
      .and((r) => r.ownerId === currentOwnerId())
      .toArray(),
  // The four mutation functions are the whole of the app's durable writes. Marking the table
  // dirty here covers every store with no changes to any of them. markDirty runs before the write:
  // a write that throws partway through still leaves its table pending.
  put: (name, record) => {
    markDirty(name)
    return table(name).put({ ...record, ownerId: currentOwnerId() })
  },
  remove: async (name, id) => {
    const record = await table(name).get(id)
    if (record && record.ownerId !== currentOwnerId()) throw foreignRow(name, id)
    markDirty(name)
    await table(name).delete(id)
  },
  clear: (name) => {
    markDirty(name)
    return table(name).clear()
  },
  // bulkPut, not put-per-record: ids come from the file and must land unchanged.
  putAll: async (name, records) => {
    markDirty(name)
    await table(name).bulkPut(records.map((r) => ({ ...r, ownerId: currentOwnerId() })))
  },
}
