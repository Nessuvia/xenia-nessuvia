// Run: node --experimental-strip-types src/core/storage/checkTablePayload.ts
import assert from 'node:assert'
import { hashPayload, tablePayload, type TablePayload } from './tablePayload.ts'
import { stripApiKeys } from './stripApiKeys.ts'
import type { StoredRecord } from './storageInterface.ts'

const row = (id: number, name: string): StoredRecord => ({ id, ownerId: 'local', name })

// Round-trip: what comes out of JSON.parse is what went in.
const rows = [row(2, 'Damien'), row(1, 'Mark'), row(3, 'Nessuvia')]
const payload = tablePayload('characters', rows)
const json = JSON.stringify(payload)
const parsed = JSON.parse(json) as TablePayload
assert.deepStrictEqual(parsed, payload)
assert.strictEqual(parsed.format, 'nessuTavern.table')
assert.strictEqual(parsed.version, 1)
assert.strictEqual(parsed.table, 'characters')

// Rows are sorted by id, and the input array is not mutated.
assert.deepStrictEqual(
  payload.rows.map((r) => r.id),
  [1, 2, 3],
)
assert.deepStrictEqual(
  rows.map((r) => r.id),
  [2, 1, 3],
)

// No ownerId and no timestamp on the envelope: the Worker decides both.
assert.deepStrictEqual(Object.keys(payload).sort(), ['format', 'rows', 'table', 'version'])

// The hash is stable across two builds of unchanged data, whatever order the rows arrive in.
const hash = await hashPayload(json)
assert.strictEqual(hash, await hashPayload(JSON.stringify(tablePayload('characters', rows))))
assert.strictEqual(
  hash,
  await hashPayload(JSON.stringify(tablePayload('characters', [...rows].reverse()))),
)
assert.match(hash, /^[0-9a-f]{64}$/, 'lowercase hex SHA-256')

// A changed row changes the hash. So does the table name: it sits inside the hashed envelope.
const edited = [row(1, 'Mark'), row(2, 'Damien'), row(3, 'Nessuvia!')]
assert.notStrictEqual(hash, await hashPayload(JSON.stringify(tablePayload('characters', edited))))
assert.notStrictEqual(hash, await hashPayload(JSON.stringify(tablePayload('personas', rows))))

// The empty table still produces a valid payload, that is what a table with every row deleted
// pushes, and the delete is carried by the absence.
const empty = tablePayload('chapters', [])
assert.deepStrictEqual(empty.rows, [])
assert.match(await hashPayload(JSON.stringify(empty)), /^[0-9a-f]{64}$/)

// No apiKey survives a full push. Table payloads carry no settings at all, API keys live in the
// settings blob, which only the file export sends, and only through stripApiKeys.
const secret = 'sk-live-must-not-leak'
const backupShaped = {
  format: 'nessuTavern.backup',
  version: 1,
  exportedAt: 0,
  tables: { characters: rows, personas: [] },
  localStorage: {
    'nessuTavern.settings': JSON.stringify({
      state: { connections: [{ id: 'a', apiKey: secret }] },
      version: 0,
    }),
  },
}
// Every table payload a push sends, for a backup-shaped library: no apiKey anywhere.
for (const [name, tableRows] of Object.entries(backupShaped.tables)) {
  const body = JSON.stringify(tablePayload(name as 'characters', tableRows))
  assert(!body.includes(secret), `${name} payload must not carry an api key`)
  assert(!body.includes('apiKey'), `${name} payload must not carry a settings blob`)
  assert(!body.includes('localStorage'), `${name} payload must not carry localStorage`)
}
// And the file export's own settings blob is stripped, which is the path that does carry one.
const stripped = stripApiKeys(backupShaped.localStorage['nessuTavern.settings'])
assert(stripped !== null && !stripped.includes(secret))

console.log('checkTablePayload ok')
