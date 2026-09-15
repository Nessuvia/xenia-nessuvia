import assert from 'node:assert'
import { explainAgent, testReplies } from './explain.ts'
import { defaultPostStackConfig, type AgentRun } from './postStack.ts'
import type { Rule } from './rules.ts'

const rule = (find: string, action: Rule['action'], label = ''): Rule => ({
  id: find, enabled: true, label, match: 'pattern', find, caseSensitive: false, action, note: '',
})
const config: AgentRun = {
  maxTries: 2,
  rules: [rule('testament', 'rewrite', 'Testament'), rule('time will tell', 'delete')],
  lexicon: [{ id: 'u', phrase: 'utilize', replacement: 'use', enabled: true }],
}

const r = explainAgent('I utilize it. A testament.\n\nTime will tell. B testament. C testament.', config)
assert.equal(r.swapped, 'I use it. A testament.\n\nTime will tell. B testament. C testament.')
assert.deepEqual(r.sentences.map((s) => s.operation), ['keep', 'rewriteSentence', 'delete', 'rewriteParagraph', 'rewriteParagraph'])
assert.deepEqual(r.sentences[1].rules, ['Testament'])
assert.deepEqual(r.sentences[2].rules, ['time will tell'])

// Over a chat's replies: hits per swap and rule, offsets into each reply, switched-off items included.
const stack = defaultPostStackConfig()
stack.swaps.lexicon = [{ id: 'u', phrase: 'utilize', replacement: 'use', enabled: false }]
stack.rules = { enabled: false, list: [rule('testament', 'rewrite'), { ...rule('pooled', 'delete'), enabled: false }] }
stack.lint = { ...stack.lint, enabled: false }
const replies = ['A testament. I utilize a testament.', 'Light pooled.', 'Clean.']
const t = testReplies(replies, stack)
assert.equal(t.counts['rule:testament'], 2)
assert.equal(t.counts['rule:pooled'], 1)
assert.equal(t.counts['swap:u'], 1)
assert.deepEqual(t.hits[0].filter((h) => h.key === 'rule:testament').map((h) => replies[0].slice(h.start, h.end)), ['testament', 'testament'])
assert.deepEqual(t.hits[2].filter((h) => !h.key.startsWith('lint:')), [])
// Ignored text is still skipped.
assert.equal(testReplies(['[testament]'], stack, [{ id: 'b', open: '[', close: ']' }]).counts['rule:testament'], undefined)
