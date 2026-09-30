import assert from 'node:assert/strict'
import type { ChatMessage } from './connectorInterface.ts'
import { processMessages } from './promptProcessing.ts'

const sys = (content: string): ChatMessage => ({ role: 'system', content })
const user = (content: string, name?: string): ChatMessage => ({ role: 'user', content, name })
const bot = (content: string, name?: string): ChatMessage => ({ role: 'assistant', content, name })

const history = [sys('a'), sys('b'), bot('hi', 'Ann'), sys('note'), user('yo', 'Bo'), user('there', 'Bo')]

assert.equal(processMessages(history, 'none'), history)

assert.deepEqual(processMessages(history, 'merge').map((m) => [m.role, m.content]), [
  ['system', 'a\n\nb'],
  ['assistant', 'hi'],
  ['system', 'note'],
  ['user', 'yo\n\nthere'],
])

// A later system turn becomes user and merges with its user neighbours.
assert.deepEqual(processMessages(history, 'semiStrict').map((m) => [m.role, m.content]), [
  ['system', 'a\n\nb'],
  ['assistant', 'hi'],
  ['user', 'note\n\nyo\n\nthere'],
])

// Strict: an assistant before any user gets the placeholder, after the system message.
assert.deepEqual(processMessages(history, 'strict', '[Start]').map((m) => [m.role, m.content]), [
  ['system', 'a\n\nb'],
  ['user', '[Start]'],
  ['assistant', 'hi'],
  ['user', 'note\n\nyo\n\nthere'],
])
// No placeholder when a user already leads.
assert.equal(processMessages([user('x'), bot('y')], 'strict', '[Start]').length, 2)
// A lone assistant still gets a user first.
assert.deepEqual(processMessages([bot('y')], 'strict', 'P').map((m) => m.role), ['user', 'assistant'])

const two = [sys('rules'), bot('hi', 'Ann')]
assert.deepEqual(processMessages(two, 'single', '', 'name'), [{ role: 'user', content: 'system: rules\n\nAnn: hi' }])
assert.deepEqual(processMessages(two, 'single', '', 'role'), [{ role: 'user', content: 'system: rules\n\nassistant: hi' }])
assert.deepEqual(processMessages(two, 'single', '', 'none'), [{ role: 'user', content: 'rules\n\nhi' }])
