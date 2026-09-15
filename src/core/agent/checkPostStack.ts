import assert from 'node:assert/strict'
import { defaultPostStackConfig, resolvePostStack, resolvePostStackRow, runStages } from './postStack.ts'

const stackA = { id: 1, config: { ...defaultPostStackConfig(), maxTries: 7 } }
const stackB = { id: 2, config: { ...defaultPostStackConfig(), maxTries: 9 } }
const stacks = [stackA, stackB]

// The chat's own stack wins over the default.
assert.equal(resolvePostStack(2, 1, stacks).maxTries, 9)
// No chat stack: the default.
assert.equal(resolvePostStack(undefined, 1, stacks).maxTries, 7)
// Both ids dangle, or there are no stacks at all: the built-in.
assert.equal(resolvePostStack(99, 98, stacks).maxTries, 3)
assert.equal(resolvePostStack(undefined, null, []).maxTries, 3)
// A dangling chat stack still falls through to the default rather than to the built-in.
assert.equal(resolvePostStack(99, 2, stacks).maxTries, 9)
// The row a write targets follows the same order, and is absent when only the built-in is left.
assert.equal(resolvePostStackRow(99, 2, stacks)?.id, 2)
assert.equal(resolvePostStackRow(1, 2, stacks)?.id, 1)
assert.equal(resolvePostStackRow(99, 98, stacks), undefined)

// Stage switches empty the list they guard, and leave the rest alone.
const config = defaultPostStackConfig()
assert.ok(runStages(config).rules.length > 20)
assert.equal(runStages({ ...config, rules: { ...config.rules, enabled: false } }).rules.length, 0)
assert.deepEqual(runStages({ ...config, swaps: { enabled: false, lexicon: [{ id: 'a', phrase: 'x', replacement: 'y', enabled: true }] } }).lexicon, [])
assert.equal(runStages(config).maxTries, config.maxTries)

// Ignored text. Off contributes nothing, whatever is configured.
const tags = [{ id: 'g', open: '<ooc>', close: '</ooc>' }]
assert.deepEqual(runStages(config, tags).ignore, [])

const ignoring = { ...config, ignore: { ...config.ignore, enabled: true } }
// On, the stack's own pairs come first and the global Tags follow.
assert.deepEqual(
  runStages(ignoring, tags).ignore?.map((p) => p.open),
  ['[', '<think>', '<ooc>'],
)
// Unticked, the global Tags stay out and the stack's pairs still apply.
assert.deepEqual(
  runStages({ ...ignoring, ignore: { ...ignoring.ignore, useTagRules: false } }, tags).ignore?.map((p) => p.open),
  ['[', '<think>'],
)
// No Tags set up is not an error, it just adds nothing.
assert.deepEqual(runStages(ignoring).ignore?.length, 2)

// Every default stack is its own copy: editing one rule must not touch the next stack's.
const one = defaultPostStackConfig()
const two = defaultPostStackConfig()
one.rules.list[0].enabled = false
assert.equal(two.rules.list[0].enabled, true)
