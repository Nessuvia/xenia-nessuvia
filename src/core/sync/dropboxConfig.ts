/**
 * What's kept after a Dropbox sign-in, on its own so both the settings store and the client can
 * import it without a cycle. Same shape of file as bucketConfig.ts, and no imports for the same
 * reason: settingsStore is reachable from checkDirtyTables.ts under node --strip-types.
 */

export const dropboxAppKey = 'he2i603yk96vlln'

/** Same trust level as a connection's apiKey: localStorage on a device the user controls, and
 *  stripped from backups by stripApiKeys. */
export interface DropboxConfig {
  /** Long-lived. Access tokens last four hours and are minted from this one as needed, so they're
   *  never persisted. '' means not signed in. */
  refreshToken: string
  /** The signed-in account's email, for the "Connected as" line. Display only. */
  account: string
  /** Optional folder inside the app folder. '' puts the table files at its root. */
  folder: string
}

export const emptyDropboxConfig: DropboxConfig = {
  refreshToken: '',
  account: '',
  folder: '',
}

/** The refresh token is the whole configuration: the folder is optional and the account is a
 *  label. */
export function dropboxConfigured(c: DropboxConfig): boolean {
  return Boolean(c.refreshToken)
}
