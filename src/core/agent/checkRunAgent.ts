import assert from 'node:assert'
import { runAgent, type Complete } from './runAgent.ts'
import type { AgentRun } from './postStack.ts'
import type { Rule } from './rules.ts'

const rule = (find: string, action: Rule['action'], over: Partial<Rule> = {}): Rule => ({
  id: find, enabled: true, match: 'literal', find, caseSensitive: false, action, note: '', ...over,
})
const config = (rules: Rule[], maxTries = 2): AgentRun => ({
  maxTries, rules,
  lexicon: [{ id: 'u', phrase: 'utilize', replacement: 'use', enabled: true }],
})

/** A fake model that answers from a queue and counts calls. */
function model(answers: string[]) {
  const calls: string[] = []
  const complete: Complete = async (messages) => {
    calls.push(messages[1].content)
    return answers.shift() ?? ''
  }
  return { complete, calls }
}

// Swap: lexicon and swap rules edit in code with no call.
let m = model([])
let r = await runAgent('I utilize the gem. It shines!', config([rule('!', 'swap', { replacement: '.' })]), m.complete)
assert.equal(r.text, 'I use the gem. It shines.')
assert.equal(m.calls.length, 0)

// Delete: the sentence goes with no call.
m = model([])
r = await runAgent('She waits. Only time will tell. He nods.', config([rule('only time will tell', 'delete')]), m.complete)
assert.equal(r.text, 'She waits. He nods.')
assert.equal(m.calls.length, 0)

// Delete beats rewrite on the same sentence.
m = model([])
r = await runAgent('A testament to only time will tell.', config([rule('testament', 'rewrite'), rule('only time will tell', 'delete')]), m.complete)
assert.equal(r.text, '')
assert.equal(m.calls.length, 0)

// Rewrite sentence: one failing sentence, neighbours untouched.
m = model(['It proved his skill.'])
r = await runAgent('He won. It was a testament to his skill. They cheered.', config([rule('testament', 'rewrite')]), m.complete)
assert.equal(r.text, 'He won. It proved his skill. They cheered.')
assert.equal(m.calls.length, 1)
assert.match(m.calls[0], /Sentence:\nIt was a testament to his skill\./)

// Retry cap: rejected candidates count as tries, then the original stays.
m = model(['Still a testament.', 'Another testament.', 'Never asked for.'])
r = await runAgent('It was a testament.', config([rule('testament', 'rewrite')], 2), m.complete)
assert.equal(r.text, 'It was a testament.')
assert.equal(m.calls.length, 2)
assert.match(r.failed ?? '', /1 sentence kept after 2 tries/)

// A later try passes.
m = model(['', 'It showed.'])
r = await runAgent('It was a testament.', config([rule('testament', 'rewrite')], 3), m.complete)
assert.equal(r.text, 'It showed.')
assert.equal(r.failed, undefined)

// Paragraph escalation: two failing sentences in one paragraph make one paragraph call.
m = model(['He ran. She followed.'])
r = await runAgent(
  'Good start.\n\nHe ran, a testament. She followed, a testament.\n\nThe end.',
  config([rule('testament', 'rewrite')]),
  m.complete,
)
assert.equal(r.text, 'Good start.\n\nHe ran. She followed.\n\nThe end.')
assert.equal(m.calls.length, 1)
assert.match(m.calls[0], /^Paragraph:/)
assert.doesNotMatch(m.calls[0], /Sentence:/)

// Two failing sentences in different paragraphs stay sentence rewrites.
m = model(['One.', 'Two.'])
r = await runAgent('A testament.\n\nB testament.', config([rule('testament', 'rewrite')]), m.complete)
assert.equal(r.text, 'One.\n\nTwo.')
assert.equal(m.calls.length, 2)

// A clean reply is returned untouched with no summary.
m = model([])
r = await runAgent('Nothing wrong here.', config([rule('testament', 'rewrite')]), m.complete)
assert.deepEqual(r, { text: 'Nothing wrong here.', summary: undefined, failed: undefined })

// Progress: pending sentences start blurred-out and clear paragraph by paragraph.
m = model(['One.', 'Two.'])
const seen: string[][] = []
await runAgent('A testament.\n\nB testament.', config([rule('testament', 'rewrite')]), m.complete, (_, pending) => seen.push(pending))
assert.deepEqual(seen, [['A testament.', 'B testament.'], ['B testament.'], []])

// Stylized: a delete shows, strikes, then goes. It doesn't wait on the rewrite above it.
m = model([])
const stages: string[] = []
let release!: (answer: string) => void
const slow: Complete = () => new Promise((done) => (release = done))
const run = runAgent(
  'It was a testament.\n\nShe waits. Only time will tell.',
  config([rule('testament', 'rewrite'), rule('only time will tell', 'delete')]),
  slow,
  (_, pending, stage) => {
    assert.deepEqual(pending, [])
    stages.push(stage!.marks.map((run) => `${run.mark}:${run.text}`).join('|'))
  },
  async () => {},
)
await new Promise((done) => setTimeout(done, 0))
assert.deepEqual(stages, [
  'pending:It was a testament.|none:\n\nShe waits. |pending:Only time will tell.',
  'pending:It was a testament.|none:\n\nShe waits. |strike:Only time will tell.',
  'pending:It was a testament.|none:\n\nShe waits.',
])
release('It showed.')
r = await run
assert.equal(r.text, 'It showed.\n\nShe waits.')
assert.equal(stages.at(-1), 'fresh:It showed.|none:\n\nShe waits.')
