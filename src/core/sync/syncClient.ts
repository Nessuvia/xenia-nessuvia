/**
 * Which provider a sync run talks to. Both can be configured at once, and `settings.syncProvider`
 * says which one is live, so the store above never names a provider.
 *
 * Two implementations, not an abstraction: this file is a switch, and adding a third provider
 * means a third client and a third case.
 */
import * as dropbox from './dropboxClient'
import * as s3 from './s3Client'
import { useSettings } from '../stores/settingsStore'
import type { Manifest, ObjectName, PulledTable } from './syncTypes'

function client() {
  return useSettings.getState().syncProvider === 'dropbox' ? dropbox : s3
}

export function fetchManifest(): Promise<Manifest> {
  return client().fetchManifest()
}

export function pullTable(table: ObjectName): Promise<PulledTable | null> {
  return client().pullTable(table)
}

/** Returns the hash to record as this table's synced hash. S3 hands back the one it was given;
 *  Dropbox hands back the content_hash it computed, which is what its manifest will show. */
export function pushTable(table: ObjectName, json: string, hash: string): Promise<string> {
  return client().pushTable(table, json, hash)
}
