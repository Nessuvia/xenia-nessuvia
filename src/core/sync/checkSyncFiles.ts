import assert from 'node:assert'
import { buildGroup, cardPath, chatPath, imageDir, parsePath, parsePayload, tablePath } from './syncFiles.ts'

// Paths round-trip, and anything else in the folder is ignored.
assert.deepEqual(parsePath(cardPath(3)), { kind: 'card', characterId: 3 })
assert.deepEqual(parsePath(chatPath(3, 12)), { kind: 'chat', characterId: 3, chatId: 12 })
assert.deepEqual(parsePath(tablePath('personas')), { kind: 'table', table: 'personas' })
// The split tables are never whole files. A leftover from the old layout isn't read as one.
for (const old of ['characters.json', 'chats.json', 'messages.json', 'settings.json', 'images/ab.png']) {
  assert.equal(parsePath(old), null, old)
}
assert.equal(imageDir(chatPath(3, 12)), 'characters/3/images')
assert.equal(imageDir(cardPath(3)), 'characters/3/images')
assert.equal(imageDir(tablePath('personas')), 'images')

const chats = [
  { id: 1, ownerId: 'local', characterId: 3, title: 'One' },
  { id: 2, ownerId: 'local', characterId: 4, title: 'Two' },
]
const message = (id: number, chatId: number, content: string) => ({ id, ownerId: 'local', chatId, content })
const files = await buildGroup('chats', {
  chats,
  messages: [message(5, 1, 'b'), message(2, 1, 'a'), message(3, 2, 'c')],
})

// One file per chat, filed under its character, holding only its own messages in id order.
assert.deepEqual(files.map((f) => f.path), [chatPath(3, 1), chatPath(4, 2)])
const one = parsePayload(files[0].json, files[0].path)
assert.deepEqual(one.tables.messages?.map((m) => m.content), ['a', 'b'])
// No message ids: another device's ids would collide with this one's.
assert.ok(one.tables.messages?.every((m) => !('id' in m)))

// A pulled chat takes fresh ids. Its file has to hash the same afterwards, or it reads as changed.
const renumbered = await buildGroup('chats', { chats, messages: [message(90, 1, 'a'), message(91, 1, 'b')] })
assert.equal(renumbered[0].hash, files[0].hash)

// Editing one chat changes that chat's file only.
const edited = await buildGroup('chats', {
  chats,
  messages: [message(5, 1, 'b'), message(2, 1, 'a'), message(3, 2, 'changed')],
})
assert.equal(edited[0].hash, files[0].hash)
assert.notEqual(edited[1].hash, files[1].hash)

// Images leave the row and land in the file's own image list.
const png = 'data:image/png;base64,iVBORw0KGgo='
const [card] = await buildGroup('characters', { characters: [{ id: 3, ownerId: 'local', name: 'Ada', avatar: png }] })
assert.equal(card.path, cardPath(3))
assert.equal(card.label, 'Ada')
assert.equal(card.images.size, 1)
assert.ok(!card.json.includes('base64'))

assert.throws(() => parsePayload(JSON.stringify({ format: 'nessuTavern.table' }), 'x.json'))

console.log('checkSyncFiles ok')
