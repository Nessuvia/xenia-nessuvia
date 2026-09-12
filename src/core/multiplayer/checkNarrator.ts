// Run: node --experimental-strip-types src/core/multiplayer/checkNarrator.ts
import assert from 'node:assert'
import type { Character } from '../storage/types'
import {
  castBlock,
  isNarrator,
  narratorCharacter,
  narratorId,
  narratorName,
  type CastMember,
} from './narrator.ts'

// --- narratorId is negative and not 0 ------------------------------------
{
  assert.ok(narratorId < 0, 'narratorId must be negative')
  assert.notStrictEqual(narratorId, 0, 'narratorId must not be 0')
}

// --- isNarrator ----------------------------------------------------------
{
  assert.strictEqual(isNarrator(narratorId), true)
  assert.strictEqual(isNarrator(1), false)
  assert.strictEqual(isNarrator(undefined), false)
  assert.strictEqual(isNarrator(0), false)
}

// --- narratorCharacter returns a well-formed Character -------------------
{
  const c: Character = narratorCharacter()
  assert.strictEqual(c.id, narratorId)
  assert.strictEqual(c.ownerId, '')
  assert.strictEqual(c.name, narratorName)
  assert.strictEqual(c.avatar, '')
  assert.strictEqual(c.personality, '')
  assert.strictEqual(c.scenario, '')
  assert.strictEqual(c.firstMessage, '')
  assert.strictEqual(c.exampleDialogue, '')
  assert.deepStrictEqual(c.altDescriptions, [])
  assert.strictEqual(c.activeDescriptionIndex, -1)
  assert.deepStrictEqual(c.alternateGreetings, [])
  assert.deepStrictEqual(c.gallery, [])
  assert.strictEqual(c.createdAt, 0)
  assert.strictEqual(c.updatedAt, 0)
  assert.deepStrictEqual(c.colors, { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' })
  assert.strictEqual(c.stackId, undefined)
  assert.strictEqual(c.paramOverrides, undefined)
}

// --- the Narrator carries no instructions of its own ---------------------
{
  // The whole point: every narrator instruction lives in the prompt stack. A description here
  // would be a second source the stack editor could neither show nor override.
  const c = narratorCharacter()
  assert.strictEqual(c.description, '')
}

// --- castBlock([]) returns '' -------------------------------------------
{
  assert.strictEqual(castBlock([]), '')
}

// --- one line per member, input order preserved -------------------------
{
  const members: CastMember[] = [
    { name: 'Dom', description: 'host' },
    { name: 'Ada', description: 'guest' },
  ]
  assert.deepStrictEqual(castBlock(members).split('\n'), ['Dom: host', 'Ada: guest'])
}

// --- no trailing separator junk ----------------------------------------
{
  assert.ok(!castBlock([{ name: 'Dom', description: 'host' }]).endsWith('\n'))
}

// --- empty-description member contributes nothing ------------------------
{
  const members: CastMember[] = [
    { name: 'Ghost', description: '' },
    { name: 'Real', description: 'here' },
  ]
  const block = castBlock(members)
  assert.ok(!block.includes('Ghost'), 'empty-description member must not appear')
  assert.strictEqual(block, 'Real: here')
}

// --- whitespace-only description is also omitted -------------------------
{
  const block = castBlock([{ name: 'Spaces', description: '   ' }])
  assert.strictEqual(block, '')
  assert.ok(!block.includes('Spaces'))
}

console.log('ok')
