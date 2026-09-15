import assert from 'node:assert'
import { agentSegments } from './agentSegments.ts'

const text = 'One. Two bad. Three. Four bad.'
const pending = ['Two bad.', 'Four bad.']

assert.deepEqual(agentSegments(text, pending, 'blur', true), [
  { text: 'One. ', mark: 'none' },
  { text: 'Two bad.', mark: 'pending' },
  { text: ' Three. ', mark: 'none' },
  { text: 'Four bad.', mark: 'pending' },
])
assert.deepEqual(agentSegments(text, [], 'blur', false), [{ text, mark: 'none' }])

assert.equal(agentSegments(text, pending, 'hold', true), null)

assert.equal(agentSegments(text, [], 'reveal', false), null)
assert.deepEqual(agentSegments(text, pending, 'reveal', true), [{ text: 'One. ', mark: 'none' }])
assert.deepEqual(agentSegments(text, [], 'reveal', true), [{ text, mark: 'none' }])
