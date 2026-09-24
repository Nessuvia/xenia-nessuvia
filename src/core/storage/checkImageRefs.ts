// Run: node --experimental-strip-types src/core/storage/checkImageRefs.ts
import assert from 'node:assert/strict'
import { extractImages, inlineImages, referencedImages } from './imageRefs.ts'
import { packBackup, unpackBackup, type Backup } from './backupZip.ts'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
const rows = [
  { id: 1, avatar: png, nested: { list: [png, 'plain text'] } },
  { id: 2, avatar: '', note: 'data:image/png;base64,not base64!' },
  { id: 3, avatar: 'data:image/x-unknown;base64,AAAA' },
]

const { rows: out, images } = await extractImages(rows)
// One image, however many fields share it.
assert.equal(images.size, 1)
const [name] = images.keys()
assert.match(name, /^[0-9a-f]{64}\.png$/)
assert.equal(out[0].avatar, `nessuImage:${name}`)
// Only whole base64 data URLs of a known type are swapped.
assert.equal(out[1].note, rows[1].note)
assert.equal(out[2].avatar, rows[2].avatar)
assert.deepEqual([...referencedImages(JSON.stringify(out))], [name])

// Round trip restores the exact strings; a missing file reads as unset.
assert.deepEqual(await inlineImages(out, images), rows)
assert.equal((await inlineImages(out, new Map()))[0].avatar, '')

// The ZIP round-trips a backup, and ignores names it doesn't know.
const backup: Backup = {
  format: 'nessuTavern.backup',
  version: 2,
  exportedAt: 5,
  shareable: false,
  tables: { characters: rows, chats: [] },
  localStorage: { 'nessuTavern.settings': '{"a":1}', stray: 'x' },
}
const back = await unpackBackup(await packBackup(backup))
assert.deepEqual(back.tables, backup.tables)
assert.deepEqual(back.localStorage, { 'nessuTavern.settings': '{"a":1}' })
assert.equal(back.exportedAt, 5)

await assert.rejects(unpackBackup(new TextEncoder().encode('{"format":"nessuTavern.backup"}')), /Not a backup/)

console.log('checkImageRefs ok')
