// Run: node --experimental-strip-types src/core/prompt/checkMiscPrompts.ts
import assert from 'node:assert/strict'
import { coerceMiscPrompts, defsForKind, fillSlots, miscPrompt, miscPromptDefs } from './miscPrompts.ts'
import { continuePrompt, oldMessageInstruction, rewritePrompt } from './rewrite.ts'
import { nextSpeakerHint } from './buildPrompt.ts'
import type { Message } from '../storage/types'

// --- the registry ---------------------------------------------------------

// Ids are what a stack's overrides are keyed by; a duplicate would make one row unreachable.
const ids = miscPromptDefs.map((d) => d.id)
assert.equal(new Set(ids).size, ids.length, 'ids are unique')
for (const def of miscPromptDefs) {
  assert.ok(def.text.trim(), `${def.id} has built-in wording`)
  assert.ok(def.label.trim() && def.hint.trim(), `${def.id} is labelled`)
  // Every slot the wording uses must be declared, or the editor lists a prompt whose tokens are
  // undocumented; every declared slot must appear, or the editor promises one that does nothing.
  const used = [...def.text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])
  assert.deepEqual(
    [...new Set(used)].sort(),
    def.slots.map((s) => s.token).sort(),
    `${def.id}: declared slots match the ones in the text`,
  )
}

// Story stacks never see the chat-only rows; `both` shows in either builder.
assert.ok(defsForKind('chat').some((d) => d.id === 'continue'))
assert.ok(!defsForKind('story').some((d) => d.id === 'continue'))
assert.ok(defsForKind('story').some((d) => d.id === 'rewrite'))
assert.ok(defsForKind('chat').some((d) => d.id === 'rewrite'))

// --- resolution -----------------------------------------------------------

const builtIn = miscPrompt('continue')
assert.ok(builtIn.length > 0)
assert.equal(miscPrompt('continue', undefined), builtIn, 'no overrides = built-in')
assert.equal(miscPrompt('continue', {}), builtIn, 'no entry = built-in')
assert.equal(miscPrompt('continue', { continue: '   ' }), builtIn, 'blank is not an override')
assert.equal(miscPrompt('continue', { continue: 'Keep going.' }), 'Keep going.')
// One stack's override must not reach another prompt.
assert.equal(miscPrompt('rewrite', { continue: 'Keep going.' }), miscPrompt('rewrite'))
// A row for a prompt this build lacks stays inert on the send path.
assert.equal(miscPrompt('goneInALaterBuild', { goneInALaterBuild: 'x' }), 'x')
assert.equal(miscPrompt('neverExisted'), '')

// --- fillSlots ------------------------------------------------------------

assert.equal(fillSlots('as {{char}}.', { char: 'Mary' }), 'as Mary.')
assert.equal(fillSlots('as {{ char }}.', { char: 'Mary' }), 'as Mary.', 'spaces inside the braces')
// An unknown token is left as written: more likely a typo to see than a slot to blank.
assert.equal(fillSlots('as {{nope}}.', { char: 'Mary' }), 'as {{nope}}.')
// One pass: a value that contains a token is not rescanned. Every one of these quotes model
// output, and model output that says `{{user}}` must not be substituted into the prompt.
assert.equal(fillSlots('{{reply}}', { reply: '{{char}} said hi', char: 'Mary' }), '{{char}} said hi')

// --- the four call sites read their overrides -----------------------------

assert.equal(continuePrompt({ continue: 'Keep going.' }), 'Keep going.')
assert.equal(nextSpeakerHint('Mary'), 'Write the next message as Mary.')
assert.equal(nextSpeakerHint('Mary', { nextSpeaker: '{{char}} is up.' }), 'Mary is up.')

const rewritten = rewritePrompt('old text', '  shorter  ', {
  rewrite: 'Was: {{reply}}. Now: {{instruction}}.',
})
assert.equal(rewritten, 'Was: old text. Now: shorter.', 'the instruction is trimmed before filling')

const later: Message[] = [
  { id: 2, ownerId: 'local', chatId: 1, role: 'user', content: 'and then?', createdAt: 2 },
]
assert.equal(
  oldMessageInstruction(later, 'Damien', { oldMessage: 'After it: {{transcript}}' }),
  'After it: User: and then?',
)
// Nothing after the message means no instruction at all, whatever the override says. An override
// cannot make one appear where there is nothing to instruct about.
assert.equal(oldMessageInstruction([], 'Damien', { oldMessage: 'After it: {{transcript}}' }), '')

// --- coercing what an imported stack file carried -------------------------

assert.equal(coerceMiscPrompts(undefined), undefined)
assert.equal(coerceMiscPrompts(null), undefined)
assert.equal(coerceMiscPrompts('nope'), undefined)
assert.equal(coerceMiscPrompts([1, 2]), undefined, 'an array is not an override map')
assert.equal(coerceMiscPrompts({}), undefined, 'nothing usable = no field at all')
assert.equal(coerceMiscPrompts({ continue: '  ' }), undefined, 'blank is not an override')
// Anything that isn't a string is dropped: it would otherwise reach the send path or the textarea.
assert.deepEqual(
  coerceMiscPrompts({ continue: 'Keep going.', rewrite: 7, oldMessage: { a: 1 }, nextSpeaker: null }),
  { continue: 'Keep going.' },
)
// An id this build doesn't know still round-trips.
assert.deepEqual(coerceMiscPrompts({ fromALaterBuild: 'text' }), { fromALaterBuild: 'text' })

console.log('misc prompts ok')
