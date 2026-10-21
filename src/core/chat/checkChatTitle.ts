// Run: node --experimental-strip-types src/core/stores/checkChatTitle.ts
import assert from 'node:assert'
import { chatTitle } from './chatTitle.ts'

const at = new Date(2026, 7, 10, 14, 5).getTime()

assert.strictEqual(chatTitle('Damien', at, []), 'Damien-08_10_2026')
assert.strictEqual(chatTitle('Damien', at, ['Damien-08_10_2026']), 'Damien-08_10_2026-2')
assert.strictEqual(
  chatTitle('Damien', at, ['Damien-08_10_2026', 'Damien-08_10_2026-2']),
  'Damien-08_10_2026-3',
)
// A gap in the sequence is filled, not skipped past.
assert.strictEqual(
  chatTitle('Damien', at, ['Damien-08_10_2026', 'Damien-08_10_2026-3']),
  'Damien-08_10_2026-2',
)
// Yesterday's chats don't push today's number up.
assert.strictEqual(chatTitle('Damien', at, ['Damien-08_09_2026']), 'Damien-08_10_2026')

console.log('chatTitle ok')
