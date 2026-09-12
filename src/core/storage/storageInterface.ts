/** The owner every row carries. There are no accounts, so this is the only value in use. Named so
 *  it can never be mistaken for "the current owner". */
export const localOwnerId = 'local'

// Held in a module variable rather than read from a store on every call: db.ts stamps this on every
// write, and storage must not depend on a React store.
let ownerId: string = localOwnerId

export function currentOwnerId(): string {
  return ownerId
}

/** No caller today, every row is owned by `localOwnerId`. Kept as the seam a multi-owner backend
 *  would write through, per the ownerId note in CLAUDE.md. Anything calling this must run before
 *  the first load(), since db.ts stamps the value at write time. */
export function setOwnerId(id: string) {
  ownerId = id
}

export type TableName =
  | 'characters'
  | 'personas'
  | 'worldInfo'
  | 'lorebooks'
  | 'chats'
  | 'messages'
  | 'promptStacks'
  | 'stories'
  | 'chapters'
  | 'palettes'
  | 'backgroundImages'
  | 'bodyTrackers'
  | 'bodyMaps'
  | 'paramDefs'
  | 'games'
  | 'pipelines'

/** Every stored record carries an ownerId; id is assigned by Dexie on insert. */
export interface StoredRecord {
  id?: number
  ownerId: string
  [key: string]: unknown
}

export interface Storage {
  get(table: TableName, id: number): Promise<StoredRecord | undefined>
  getAll(table: TableName): Promise<StoredRecord[]>
  /** Generic on purpose: no per-query wrapper functions, ever. */
  find(table: TableName, field: string, value: unknown): Promise<StoredRecord[]>
  put(table: TableName, record: StoredRecord): Promise<number>
  remove(table: TableName, id: number): Promise<void>
  /** Import only: wipe a table, then write records with their ids intact. */
  clear(table: TableName): Promise<void>
  putAll(table: TableName, records: StoredRecord[]): Promise<void>
}

export const tableNames: TableName[] = [
  'characters',
  'personas',
  'worldInfo',
  // The books those entries belong to. Both halves ride along in a backup or there is no book to
  // restore, only orphaned entries.
  'lorebooks',
  'chats',
  'messages',
  'promptStacks',
  'stories',
  'chapters',
  // Backup reads this list, so background images ride along with everything else. Full-size
  // wallpapers as base64 make that file large; nothing trims them.
  'backgroundImages',
  'palettes',
  // Body map trackers ride along in a full backup. They're per-chat, unrelated to stories, so
  // story export never touches them (see body-map-widget-plan Section 6).
  'bodyTrackers',
  // The saved body-map library (man, woman, non-human, …). Not per-chat; loaded into the author.
  'bodyMaps',
  // The sampler library. Rides along in a backup: a connection references defs by key, so a
  // restore without them would leave every custom param unresolvable.
  'paramDefs',
  // Played games, log and all. Small rows: a seed, a few hundred events, no card positions.
  'games',
]
