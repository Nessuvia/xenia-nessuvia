import assert from 'node:assert/strict'
import { ideaInstruction, ideasMessages, ideasTranscript, parseIdeas } from './ideasPrompt.ts'

// Tagged lines in order, junk around them skipped, quotes dropped.
assert.deepEqual(
  parseIdeas('Here are some ideas:\n[1] Mara finds the letter.\n\n[2] "The storm cuts the power."\nHope that helps!\n[3] He asks about the ring.'),
  ['Mara finds the letter.', 'The storm cuts the power.', 'He asks about the ring.'],
)

// A sentence under a bare tag counts, and more than three is capped.
assert.deepEqual(parseIdeas('[1]\nShe lies.\n[2] He leaves.\n[3] Rain.\n[4] Extra.'), ['She lies.', 'He leaves.', 'Rain.'])

// Nothing tagged, nothing back.
assert.deepEqual(parseIdeas('1. She lies.\n2. He leaves.'), [])
assert.deepEqual(parseIdeas('[1]   \n[2] ""'), [])

const names = { char: 'Mara', user: 'Dom' }
const chat = [
  { role: 'assistant', content: 'Before the break.' },
  { role: 'user', content: '', divider: true },
  { role: 'user', content: 'Where were you?', personaName: 'Dom' },
  { role: 'assistant', content: '<think>hm</think>Out.', reasoningEnd: '<think>hm</think>'.length, speakerName: 'Mara' },
]

// Both sides, in order, labelled, reasoning cut, stopping at the break. The last line is the reply,
// so the model sees it is the user's turn.
assert.equal(ideasTranscript(chat, names), 'Dom: Where were you?\n\nMara: Out.')
// A message with no stamped name takes the fallback.
assert.equal(ideasTranscript([{ role: 'assistant', content: 'Hi.' }], names), 'Mara: Hi.')

// {{char}} and {{user}} are filled, from the messages first.
const custom = { ideas: '{{replies}}\n{{message}}\n{{char}} spoke. Choices for {{user}}:' }
const sent = ideasMessages(chat, { char: 'Fallback', user: 'Fallback' }, custom)
assert.equal(sent.length, 1)
assert.equal(sent[0].role, 'user')
assert.equal(
  sent[0].content,
  'Dom: Where were you?\n\nMara: Out.\n\nLast message from Dom:\nWhere were you?\n\nMara spoke. Choices for Dom:',
)

// The built-in wording leaves no token unfilled.
assert.doesNotMatch(ideasMessages(chat, names, undefined)[0].content, /\{\{/)
// No message of yours, no "Last message" line.
assert.doesNotMatch(ideasMessages([{ role: 'assistant', content: 'Hi.' }], names, undefined)[0].content, /Last message/)

assert.equal(ideaInstruction('Mara finds the letter.', undefined), 'Next, develop this: Mara finds the letter.')
assert.equal(ideaInstruction('Rain.', { ideaNext: 'Steer toward: {{idea}}' }), 'Steer toward: Rain.')
