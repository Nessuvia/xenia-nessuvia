// Run: node --experimental-strip-types src/modules/prompts/checkStackKinds.ts
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import type { BlockSource, PromptBlock, PromptStack } from '../../core/storage/types.ts'
import { boundSources, kindSources, stackKind, validateStack } from './stackKinds.ts'

let n = 0
function b(source: BlockSource, disabled = false): PromptBlock {
  return { id: `b${n++}`, label: source, source, role: 'system', content: '', ...(disabled && { disabled }) }
}
function stack(kind: 'chat' | 'story' | undefined, active: PromptBlock[]): PromptStack {
  return { ownerId: 'local', name: 't', kind, active }
}

// --- kind defaulting ----------------------------------------------------
assert.strictEqual(stackKind({ kind: undefined }), 'chat') // absent = chat
assert.strictEqual(stackKind({ kind: 'story' }), 'story')

// --- allowed sources are freeform + the kind's bound set ----------------
assert.deepStrictEqual(kindSources('story'), [
  'text',
  'cast',
  'worldInfo',
  'worldInfoAfter',
  'storyContext',
  'storyTrailing',
])
assert.ok(!kindSources('story').includes('chatHistory')) // story has no chat history
assert.ok(!kindSources('story').includes('authorNote')) // nor an author's note
assert.ok(kindSources('chat').includes('chatHistory'))
assert.ok(!boundSources.story.includes('chatHistory'))

// --- chat validation is unchanged ---------------------------------------
assert.strictEqual(validateStack(stack('chat', [b('chatHistory')])), '')
assert.match(validateStack(stack('chat', [])), /Chat History/) // needs one
assert.match(validateStack(stack('chat', [b('chatHistory'), b('chatHistory')])), /Only one/)
// undefined kind validates as chat
assert.match(validateStack(stack(undefined, [])), /Chat History/)
// a disabled history doesn't count
assert.match(validateStack(stack('chat', [b('chatHistory', true)])), /Chat History/)

// --- story validation: exactly one story context, no chat history -------
assert.strictEqual(validateStack(stack('story', [b('storyContext')])), '')
assert.strictEqual(validateStack(stack('story', [b('cast'), b('storyContext')])), '')
// The Author's note is a chat-only source now: the Story's standing instruction is the Direction.
assert.match(validateStack(stack('story', [b('storyContext'), b('authorNote')])), /no Author's note/)
assert.match(validateStack(stack('story', [])), /Story context/) // needs one
assert.match(validateStack(stack('story', [b('storyContext'), b('storyContext')])), /Only one Story/)
assert.match(validateStack(stack('story', [b('storyContext'), b('chatHistory')])), /no Chat History/)
// Story context alone is a valid stack: everything else a Story stack can hold is optional.
assert.strictEqual(validateStack(stack('story', [b('storyContext')])), '')
// "What follows" is optional too (a Story with no caret sends nothing for it) and capped at one
assert.strictEqual(validateStack(stack('story', [b('storyContext'), b('storyTrailing')])), '')
assert.match(
  validateStack(stack('story', [b('storyContext'), b('storyTrailing'), b('storyTrailing')])),
  /Only one What follows/,
)

// World info reaches a Story through the two block-shaped slots; the depth one has no history to
// splice into.
assert.strictEqual(validateStack(stack('story', [b('worldInfo'), b('storyContext')])), '')
assert.strictEqual(validateStack(stack('story', [b('worldInfoAfter'), b('storyContext')])), '')
assert.match(
  validateStack(stack('story', [b('worldInfoDepth'), b('storyContext')])),
  /no World info \(at depth\)/,
)
assert.match(
  validateStack(stack('story', [b('worldInfo'), b('worldInfo'), b('storyContext')])),
  /Only one World info/,
)

// author's note capped at one, both kinds


// --- nested blocks count too --------------------------------------------
const wrap = (children: PromptBlock[], disabled = false): PromptBlock => ({
  id: `w${n++}`, label: 'wrap', source: 'text', role: 'system', content: '', children,
  ...(disabled && { disabled }),
})
// a story context nested in a wrapper satisfies the rule
assert.strictEqual(validateStack(stack('story', [wrap([b('storyContext')])])), '')
// one at top level and one nested is still two
assert.match(validateStack(stack('story', [b('storyContext'), wrap([b('storyContext')])])), /Only one Story/)
// a disabled wrapper takes its children out of the prompt
assert.match(validateStack(stack('story', [wrap([b('storyContext')], true)])), /Story context/)
assert.strictEqual(validateStack(stack('chat', [wrap([b('chatHistory')])])), '')

// --- the stack files that ship with the build are valid for their own kind ---
// read rather than imported: node's JSON import needs an attribute Vite doesn't want.
for (const file of ['defaultStoryStack.json', 'glmChatStack.json', 'glmStoryStack.json']) {
  const url = new URL(file, import.meta.url)
  const data = JSON.parse(readFileSync(url, 'utf8')) as PromptStack & { format: string }
  assert.strictEqual(data.format, 'nessu-prompt-stack', `${file}: wrong format tag`)
  assert.strictEqual(validateStack(data), '', `${file}: ${validateStack(data)}`)
}

console.log('ok')
