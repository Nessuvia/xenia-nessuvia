/**
 * The settings blob as its own object in the bucket, keys and all.
 *
 * Its own file, extension-ful imports and all, so checkSettingsObject.ts can run it under
 * `node --experimental-strip-types`. syncStore.ts pulls in Dexie and can't.
 */

/** The one localStorage key the settings store persists to. */
export const settingsKey = 'nessuTavern.settings'

/** The Ask scratchpad. Its own key and its own bucket object: it's a whole store's worth of the
 *  user's text, and nothing in it belongs inside the settings blob. Moved by the same step, so
 *  "Download settings" carries everything a backup's localStorage half carries. */
export const askKey = 'nessuTavern.ask'

/**
 * Fields that describe this device's relationship to the bucket, not the user's preferences. A
 * pulled blob must not bring another device's dirty set, hashes or bucket config with it: that
 * would tell this device its tables are already synced when they aren't.
 */
const deviceFields = ['dirtyTables', 'tableHashes', 'lastSyncedAt', 'bucket', 'dropbox', 'syncProvider']

/** `theirs` with this device's own sync bookkeeping kept. */
export function keepDeviceFields(theirs: string, mine: string | null): string {
  type Blob = { state?: Record<string, unknown> }
  const parsed = JSON.parse(theirs) as Blob
  const local = (mine === null ? {} : (JSON.parse(mine) as Blob).state) ?? {}
  // Whatever came back isn't a settings blob, and writing it'd break every store on reload.
  if (!parsed.state || typeof parsed.state !== 'object') {
    throw new Error("The settings object in the bucket isn't readable.")
  }
  for (const field of deviceFields) {
    if (field in local) parsed.state[field] = local[field]
    else delete parsed.state[field]
  }
  return JSON.stringify(parsed)
}
