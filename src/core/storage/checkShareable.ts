import assert from 'node:assert'
import { isPartialRestore, mergeConnections, renameConnections } from './shareable.ts'

const mine = JSON.stringify({
  state: {
    connections: [
      { id: 'a', name: 'work openrouter', endpointUrl: 'https://x', apiKey: 'secret' },
    ],
  },
  version: 0,
})

// Rename: the label goes, the endpoint stays, the shape is untouched otherwise.
const renamed = renameConnections(mine)
assert(renamed !== null)
const out = JSON.parse(renamed).state.connections[0]
assert.notEqual(out.name, 'work openrouter')
assert.match(out.name, /^[a-z]+-[a-z]+-[a-z]+$/)
assert.equal(out.endpointUrl, 'https://x')
assert.equal(renameConnections(null), null)

// Merge: a new id is appended, a known id is not, and the importer's own key survives.
const theirs = JSON.stringify({
  state: { connections: [{ id: 'a', name: 'dup', apiKey: '' }, { id: 'b', name: 'new' }] },
})
const merged = mergeConnections(mine, theirs)
assert(merged !== null)
const list = JSON.parse(merged).state.connections
assert.equal(list.length, 2)
assert.equal(list[0].apiKey, 'secret')
assert.equal(list[0].name, 'work openrouter')
assert.equal(list[1].id, 'b')
assert.equal(mergeConnections(null, theirs), theirs)
assert.equal(mergeConnections(mine, null), mine)

// --- full or partial, for a file of any age ------------------------------
{
  // Said outright, either way: a file written by this build is never guessed about.
  assert.equal(isPartialRestore({ shareable: false, tables: {} }), false)
  assert.equal(isPartialRestore({ shareable: true, tables: { characters: [] } }), true)
  // The flag wins even when the tables would say otherwise, which is what makes it a flag.
  assert.equal(isPartialRestore({ shareable: true, tables: { chats: [] } }), true)

  // No flag: a full export writes every key, empty or not.
  assert.equal(isPartialRestore({ tables: { chats: [], characters: [], messages: [] } }), false)
  // ...and a sanitized one never writes `chats`, whatever else it carries.
  assert.equal(isPartialRestore({ tables: { characters: [], palettes: [] } }), true)

  // The regression this replaced: a full backup missing a table added after it was written. The
  // old test counted tables and called this sanitized, so it restored in add mode and kept rows
  // the user meant to replace. Every 0.0.42 file looks like this now that `pipelines` exists.
  assert.equal(isPartialRestore({ tables: { chats: [], messages: [], characters: [] } }), false)
}

console.log('checkShareable ok')
