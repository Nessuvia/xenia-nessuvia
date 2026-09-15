import assert from 'node:assert'
import { explainAgent } from './explain.ts'
import type { AgentRun } from './postStack.ts'
import type { Rule } from './rules.ts'

const rule = (find: string, action: Rule['action'], label = ''): Rule => ({
  id: find, enabled: true, label, match: 'literal', find, caseSensitive: false, action, note: '',
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
