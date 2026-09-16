import assert from 'node:assert'
import { keepsCommitments } from './dialogueGuard.ts'
import { runAgent, type Complete } from './runAgent.ts'

const reply = `He raised an eyebrow.

"You still can," he said. "If you want. Anytime. I'll stand there and take it."`

// Speech reworded, narration untouched: kept.
assert.ok(keepsCommitments(reply, `He raised an eyebrow.

"Hah, well, I'd still let you," he said. "Anytime you want. I'll stand there and take it."`))

// One new line with a tag: kept. Two new lines: not.
assert.ok(keepsCommitments(reply, `He raised an eyebrow.

"You still can," he said. "Anytime. I'll stand there and take it." "It'd be a bloodbath," he added.`))
assert.ok(!keepsCommitments(reply, `He raised an eyebrow.

"You still can," he said. "Anytime." "Hah." "It'd be a bloodbath," he added.`))

// A line dropped, or narration changed: not.
assert.ok(!keepsCommitments('"One." He sat. "Two."', '"One and two." He sat.'))
assert.ok(!keepsCommitments(reply, reply.replace('raised an eyebrow', 'frowned')))

// Names and numbers said aloud stay said.
const lifting = '"I started lifting after Sarah died," he said. "He weighed a hundred and sixty."'
assert.ok(keepsCommitments(lifting, '"Started lifting after Sarah died," he said. "Kid was a hundred and sixty, soaking wet."'))
assert.ok(!keepsCommitments(lifting, '"Started lifting after she died," he said. "Kid was a hundred and sixty, soaking wet."'))
assert.ok(!keepsCommitments(lifting, '"Started lifting after Sarah died," he said. "Kid was tiny, soaking wet."'))

// A refusal doesn't turn into agreement, and a question doesn't turn into a statement.
assert.ok(!keepsCommitments('"I won\'t go," she said.', '"Sure, I\'ll go," she said.'))
assert.ok(keepsCommitments('"I won\'t go," she said.', '"No way I\'m going," she said.'))
assert.ok(!keepsCommitments('"You want to tell me about her?" he asked.', '"Tell me about her," he asked.'))

// runAgent: the pass runs last, only on replies with speech, and a failing candidate keeps the text.
const run = async (text: string, answer: string) => {
  const calls: string[] = []
  const complete: Complete = async (messages) => {
    calls.push(messages[0].content)
    return answer
  }
  const r = await runAgent(text, { maxTries: 1, rules: [], lexicon: [], dialoguePass: true }, complete)
  return { r, calls }
}
let { r, calls } = await run(reply, reply.replace('If you want. Anytime.', 'Anytime you want.'))
assert.match(calls[0], /edit the dialogue/)
assert.match(r.text, /Anytime you want\./)
assert.match(r.summary ?? '', /reworked the dialogue/)
;({ r } = await run(reply, reply.replace('raised an eyebrow', 'frowned')))
assert.equal(r.text, reply)
;({ calls } = await run('He sat down on the mat.', 'He sat.'))
assert.equal(calls.length, 0)
