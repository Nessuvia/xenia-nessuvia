/**
 * How the library is laid out in the Dropbox folder. Sync moves files, and a file is the unit that
 * gets compared, uploaded and downloaded: one new message re-uploads one chat, not every chat.
 *
 *   characters/<id>/card.json            one character row
 *   characters/<id>/chats/<chatId>.json  one chat row and its messages, filed under `characterId`
 *   characters/<id>/images/<name>        images those two refer to
 *   <table>.json                         every other table, whole
 *   images/<name>                        images the whole tables refer to
 *   settings.json                        the settings blob, moved by its own step
 *
 * Images are named by content (imageRefs.ts), so a replaced avatar is a new name and the old file
 * stays behind as an orphan. A card shared by two characters is stored once per folder.
 *
 * Pure, extensioned imports: checkSyncFiles.ts runs it under node --experimental-strip-types.
 */
import { tableNames, type StoredRecord, type TableName } from '../storage/storageInterface.ts'
import { extractImages } from '../storage/imageRefs.ts'
import { dropboxContentHash } from './dropboxHash.ts'

export interface SyncPayload {
  format: 'nessuTavern.sync'
  version: 1
  tables: Partial<Record<TableName, StoredRecord[]>>
}

export type SyncFileKind =
  | { kind: 'card'; characterId: number }
  | { kind: 'chat'; characterId: number; chatId: number }
  | { kind: 'table'; table: TableName }

/** A group is the set of files built from the same tables. Dirty tracking is per table, so a clean
 *  group is skipped whole on compare. */
export type SyncGroup = 'characters' | 'chats' | TableName

const splitTables: TableName[] = ['characters', 'chats', 'messages']
const wholeTables = tableNames.filter((t) => !splitTables.includes(t))
export const syncGroups: SyncGroup[] = ['characters', 'chats', ...wholeTables]

export function groupTables(group: SyncGroup): TableName[] {
  return group === 'chats' ? ['chats', 'messages'] : [group]
}

export const cardPath = (characterId: number) => `characters/${characterId}/card.json`
export const chatPath = (characterId: number, chatId: number) => `characters/${characterId}/chats/${chatId}.json`
export const tablePath = (table: TableName) => `${table}.json`

/** Null for anything that isn't a sync file: images, settings.json, whatever else the user keeps. */
export function parsePath(path: string): SyncFileKind | null {
  let m = /^characters\/(\d+)\/card\.json$/.exec(path)
  if (m) return { kind: 'card', characterId: Number(m[1]) }
  m = /^characters\/(\d+)\/chats\/(\d+)\.json$/.exec(path)
  if (m) return { kind: 'chat', characterId: Number(m[1]), chatId: Number(m[2]) }
  m = /^(\w+)\.json$/.exec(path)
  const table = m?.[1] as TableName | undefined
  if (table && wholeTables.includes(table)) return { kind: 'table', table }
  return null
}

export function groupOf(kind: SyncFileKind): SyncGroup {
  return kind.kind === 'card' ? 'characters' : kind.kind === 'chat' ? 'chats' : kind.table
}

/** Where the images a file refers to are kept: its character's folder, or the shared one. */
export function imageDir(path: string): string {
  const m = /^characters\/\d+\//.exec(path)
  return m ? `${m[0]}images` : 'images'
}

export interface LocalFile {
  path: string
  label: string
  json: string
  /** Dropbox's content_hash of `json`, so it compares straight against the folder listing. */
  hash: string
  images: Map<string, Uint8Array>
}

const byId = (a: StoredRecord, b: StoredRecord) => (a.id ?? Infinity) - (b.id ?? Infinity)

async function localFile(
  path: string,
  label: string,
  tables: Partial<Record<TableName, StoredRecord[]>>,
): Promise<LocalFile> {
  const images = new Map<string, Uint8Array>()
  const out: SyncPayload['tables'] = {}
  for (const [table, rows] of Object.entries(tables) as [TableName, StoredRecord[]][]) {
    out[table] = (await extractImages(rows, images)).rows
  }
  const payload: SyncPayload = { format: 'nessuTavern.sync', version: 1, tables: out }
  const json = JSON.stringify(payload)
  return { path, label, json, hash: await dropboxContentHash(json), images }
}

/**
 * Every file one group makes, from that group's rows. Message ids are left out of a chat file:
 * they're autoincrement keys shared across all chats, so two devices hand out the same ones, and a
 * pulled chat takes fresh ids instead (syncStore's pull). Order still comes from the id sort.
 */
export async function buildGroup(
  group: SyncGroup,
  rows: Partial<Record<TableName, StoredRecord[]>>,
): Promise<LocalFile[]> {
  if (group === 'characters') {
    return Promise.all(
      (rows.characters ?? []).map((c) =>
        localFile(cardPath(c.id!), String(c.displayName || c.name || `Character ${c.id}`), { characters: [c] }),
      ),
    )
  }
  if (group === 'chats') {
    const byChat = new Map<number, StoredRecord[]>()
    for (const m of rows.messages ?? []) {
      const list = byChat.get(m.chatId as number) ?? []
      list.push(m)
      byChat.set(m.chatId as number, list)
    }
    return Promise.all(
      (rows.chats ?? []).map((chat) =>
        localFile(chatPath(chat.characterId as number, chat.id!), String(chat.title || `Chat ${chat.id}`), {
          chats: [chat],
          messages: (byChat.get(chat.id!) ?? []).sort(byId).map(({ id: _id, ...m }) => m as StoredRecord),
        }),
      ),
    )
  }
  return [await localFile(tablePath(group), group, { [group]: [...(rows[group] ?? [])].sort(byId) })]
}

/** A downloaded file, refused whole when it isn't ours. */
export function parsePayload(json: string, path: string): SyncPayload {
  const payload = JSON.parse(json) as SyncPayload
  if (payload?.format !== 'nessuTavern.sync' || !payload.tables || typeof payload.tables !== 'object') {
    throw new Error(`${path} came back in an unrecognized format.`)
  }
  return payload
}
