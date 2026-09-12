/**
 * The settings-blob surgery a shareable export needs, either side of the trip: connection names go
 * out, and on the way back in the file's connections are added to the importer's rather than
 * replacing them.
 *
 * Its own file, extension-ful imports and all, so checkShareable.ts can run it under
 * `node --experimental-strip-types`, backup.ts pulls in Dexie and can't.
 */

type SettingsBlob = { state?: { connections?: { id?: string; name?: string }[] } }

const loremPool =
  `lorem ipsum dolor sit amet consectetur adipiscing elit sed eiusmod tempor labore magna aliqua
   veniam nostrud ullamco laboris aliquip commodo aute irure voluptate cillum fugiat pariatur`.split(
    /\s+/,
  )

/**
 * Connection names leak: people call them "work openrouter" or put an account in the label. A
 * shareable export keeps the endpoint and model so the file still imports, and replaces the name.
 */
export function renameConnections(settings: string | null): string | null {
  if (settings === null) return null
  const parsed = JSON.parse(settings) as SettingsBlob
  for (const connection of parsed.state?.connections ?? []) {
    connection.name = Array.from(
      { length: 3 },
      () => loremPool[Math.floor(Math.random() * loremPool.length)],
    ).join('-')
  }
  return JSON.stringify(parsed)
}

/** `mine` plus any connection from `theirs` it doesn't already have, matched by id. */
export function mergeConnections(mine: string | null, theirs: string | null): string | null {
  if (mine === null || theirs === null) return mine ?? theirs
  const parsed = JSON.parse(mine) as SettingsBlob
  const incoming = (JSON.parse(theirs) as SettingsBlob).state?.connections
  if (!Array.isArray(incoming) || !parsed.state) return mine
  const have = new Set((parsed.state.connections ?? []).map((c) => c.id))
  parsed.state.connections = [
    ...(parsed.state.connections ?? []),
    ...incoming.filter((c) => !have.has(c.id)),
  ]
  return JSON.stringify(parsed)
}

/**
 * Whether a backup file adds to the library or replaces it.
 *
 * The flag when the file has one. For a file older than the flag, ask the one question that cannot
 * go stale: a sanitized export never carries `chats`, and a full one always writes the key even
 * when it is empty.
 *
 * Counting tables was the old test, and it was wrong in a way that got worse with every release.
 * A table added since the file was written made a full backup look sanitized, so it restored in
 * add-to-what-is-here mode and kept rows the user expected to be replaced. Adding `pipelines` in
 * 0.0.43 broke every 0.0.42 file that way.
 *
 * Here rather than in backup.ts so checkShareable.ts can run it: backup.ts pulls in Dexie.
 */
export function isPartialRestore(backup: {
  shareable?: boolean
  tables: Record<string, unknown>
}): boolean {
  return backup.shareable ?? !('chats' in backup.tables)
}
