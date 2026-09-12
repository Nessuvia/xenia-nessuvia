// Run: node --experimental-strip-types src/core/secondPass/checkPassPrompt.ts
import assert from 'node:assert/strict'
import { buildPassPrompt, shouldRunPass } from './buildPassPrompt.ts'
import type { Note } from './note.ts'

const note = (over: Partial<Note> = {}): Note => ({
  source: 'repetition',
  message: 'Used before.',
  ...over,
})

// --- the skip predicate ---------------------------------------------------
{
  // Nothing flagged and nothing standing: the draft is already the answer, so no second request.
  assert.equal(shouldRunPass([], '', true), false)
  assert.equal(shouldRunPass([note()], '', true), true)
  // A standing instruction runs the pass even on a reply nothing flagged.
  assert.equal(shouldRunPass([], 'tighten dialogue', true), true)
  // Whitespace is not an instruction.
  assert.equal(shouldRunPass([], '   \n ', true), false)
  // skipWhenClean off forces the request through either way.
  assert.equal(shouldRunPass([], '', false), true)

  // A standing rule forces the pass on a clean reply, the same way a standing instruction does.
  assert.equal(shouldRunPass([], '', true, [note({ message: 'No metaphors.' })]), true)
}

// --- standing rules in the prompt -----------------------------------------
{
  const standing = [note({ message: 'No metaphors.' }), note({ message: 'No em-dash asides.' })]
  const body = buildPassPrompt('x', [], '', standing)[1].content

  assert.ok(body.includes('Rules for the passage:'), body)
  assert.ok(body.includes('1. No metaphors.'))
  assert.ok(body.includes('2. No em-dash asides.'))
  // With rules present there is nothing to apologise for, so the empty-list line stays away.
  assert.ok(!body.includes('No specific problems'), body)

  // Rules come before found problems: the rules are how prose should read, the problems are
  // failures against them.
  const both = buildPassPrompt('x', [note({ message: 'Used before.' })], '', standing)[1].content
  assert.ok(both.indexOf('Rules for the passage:') < both.indexOf('Problems found:'), both)

  // And the passage is still last.
  assert.ok(both.trimEnd().endsWith('x'))
}

// --- the prompt -----------------------------------------------------------
{
  const text = 'She looked at him with a mixture of fear and desire.'
  const msgs = buildPassPrompt(text, [note({ slice: 'a mixture of fear and desire' })], '')
  assert.equal(msgs.length, 2)
  assert.equal(msgs[0].role, 'system')
  assert.equal(msgs[1].role, 'user')

  // The passage must survive verbatim: the model is asked to return everything it did not change.
  assert.ok(msgs[1].content.includes(text), 'passage missing from the prompt')
  // And it goes last, so it is the freshest thing in the context.
  assert.ok(msgs[1].content.trimEnd().endsWith(text), 'passage should be last')

  // The quoted slice is what makes the edit targeted rather than a rewrite.
  assert.ok(msgs[1].content.includes('"a mixture of fear and desire"'), msgs[1].content)
  assert.ok(msgs[1].content.includes('1. Used before.'))

  // The system message has to forbid the wholesale rewrite, which is the failure mode.
  assert.ok(msgs[0].content.includes('byte-identical'))
}

// --- notes are numbered in order, and a suggested fix rides along ----------
{
  const msgs = buildPassPrompt('x', [note(), note({ message: 'Second.', fix: 'better' })], '')
  const body = msgs[1].content
  assert.ok(body.indexOf('1. Used before.') < body.indexOf('2. Second.'))
  assert.ok(body.includes('"better"'))
}

// --- a standing instruction with nothing flagged --------------------------
{
  const msgs = buildPassPrompt('x', [], 'tighten dialogue')
  assert.ok(msgs[1].content.includes('No specific problems'))
  assert.ok(msgs[1].content.includes('tighten dialogue'))
}

// --- a note with no slice renders without an empty Text line --------------
{
  const body = buildPassPrompt('x', [note({ slice: '   ' })], '')[1].content
  assert.ok(!body.includes('Text:'), body)
}

console.log('checkPassPrompt OK')
