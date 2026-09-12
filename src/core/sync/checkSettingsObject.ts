import assert from 'node:assert'
import { keepDeviceFields } from './settingsObject.ts'

const theirs = JSON.stringify({
  state: {
    connections: [{ id: 'a', apiKey: 'secret' }],
    dirtyTables: ['chats'],
    tableHashes: { chats: 'theirs' },
    lastSyncedAt: 111,
    bucket: { bucket: 'theirs' },
  },
  version: 0,
})

// Preferences and keys arrive; this device keeps its own view of the bucket.
const mine = JSON.stringify({
  state: { dirtyTables: [], tableHashes: { chats: 'mine' }, lastSyncedAt: 222, bucket: { bucket: 'mine' } },
})
const merged = JSON.parse(keepDeviceFields(theirs, mine)).state
assert.equal(merged.connections[0].apiKey, 'secret')
assert.deepEqual(merged.dirtyTables, [])
assert.equal(merged.tableHashes.chats, 'mine')
assert.equal(merged.lastSyncedAt, 222)
assert.equal(merged.bucket.bucket, 'mine')

// A device that has never synced has no bookkeeping to keep. Theirs is dropped rather than
// inherited: inheriting it would claim tables are synced that were never pushed from here.
const fresh = JSON.parse(keepDeviceFields(theirs, JSON.stringify({ state: {} }))).state
assert.equal('tableHashes' in fresh, false)
assert.equal('bucket' in fresh, false)
assert.equal(fresh.connections[0].apiKey, 'secret')

// Anything that isn't a settings blob is refused whole.
assert.throws(() => keepDeviceFields(JSON.stringify({ hello: 1 }), mine))
assert.throws(() => keepDeviceFields('not json', mine))

console.log('checkSettingsObject ok')
