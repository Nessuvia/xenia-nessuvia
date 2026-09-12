// Extensioned imports: checkDirtyTables.ts runs this file under node --experimental-strip-types.
import { useSettings } from '../stores/settingsStore.ts'
import type { TableName } from '../storage/storageInterface.ts'

/** Suppression is module-level rather than a parameter threaded through storage: the callers that
 *  need it (`restoreBackup`, and the pull path) replace whole tables through the same `clear` +
 *  `putAll` that ordinary edits use. There is no signature to distinguish them by. */
let suppressed = false

/** Called by `db.ts` on every durable write, before the write runs: a write that throws partway
 *  through still leaves its table flagged. Nothing is silently left unpushed. */
export function markDirty(table: TableName) {
  if (suppressed) return
  useSettings.getState().markTableDirty(table)
}

/**
 * Runs `fn` with dirty tracking off. A wrapper rather than a setSuppressed(true/false) pair: the
 * `finally` means a throw inside `fn` cannot leave tracking dead for the rest of the session.
 *
 * Whole-table replacements use it. They are not user edits, and flagging every table as a side
 * effect of a restore or a pull would queue a push of data that just came from elsewhere. A pull
 * records its own table clean afterwards.
 */
export async function withDirtySuppressed<T>(fn: () => Promise<T>): Promise<T> {
  suppressed = true
  try {
    return await fn()
  } finally {
    suppressed = false
  }
}

/** Test seam only: the app reads the set off the settings store. */
export function isSuppressed(): boolean {
  return suppressed
}
