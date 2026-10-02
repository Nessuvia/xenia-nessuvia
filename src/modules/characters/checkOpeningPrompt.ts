import assert from 'node:assert/strict'
import { openingMessages, parseOpening } from './openingPrompt.ts'

const think = { prefix: '<think>', suffix: '</think>', autoParse: true, sendBack: false }

assert.equal(parseOpening('<think>plan</think>\n Jo paces.', 'Jo', think), '{{char}} paces.')
assert.equal(parseOpening('Jo paces. Joan waits. Jo.', 'Jo'), '{{char}} paces. Joan waits. {{char}}.')
assert.equal(parseOpening('Dr. K. sits.', 'Dr. K.'), '{{char}} sits.')
assert.equal(parseOpening(' Hi ', ''), 'Hi')

const first = openingMessages('Write one.', [], 'Pacing.')
assert.equal(first.length, 1)
assert.equal(first[0].content, 'Write one.\n\nPacing.')

const follow = openingMessages(
  'Write one.',
  [
    { role: 'user', content: 'Pacing.' },
    { role: 'assistant', content: 'Added as Alternate greeting 1.', preview: 'He paces.' },
  ],
  'Shorter.',
)
assert.deepEqual(
  follow.map((m) => m.content),
  ['Write one.\n\nPacing.', 'He paces.', 'Shorter.'],
)
