import assert from 'node:assert'
import { bannedList, bannedPromptTurn } from './bannedStrings.ts'
import { buildCensus, defaultCensus } from './census.ts'
import type { LexiconEntry } from './lexicon.ts'

const entries: LexiconEntry[] = [
  { id: 'a', phrase: 'swallowed hard', regex: false, enabled: true, weight: 1 },
  { id: 'b', phrase: 'something unreadable', regex: false, enabled: true, weight: 3 },
  { id: 'c', phrase: 'eyes (darkened|darkening)', regex: true, enabled: true, weight: 2 },
  { id: 'd', phrase: 'a ghost of a smile', regex: false, enabled: false, weight: 2 },
]
const census = buildCensus(
  ['He waited by the window again.', 'She waited by the window again.'],
  defaultCensus,
)

const list = bannedList(census, entries)
assert.ok(list.includes('swallowed hard'))
assert.ok(list.includes('something unreadable'))
assert.ok(!list.some((p) => p.includes('|')), 'regex entries never go out')
assert.ok(!list.includes('a ghost of a smile'), 'a disabled entry never goes out')
assert.ok(list.some((p) => p.includes('waited by the window')), 'the census is included')

// The census comes first: a cut takes the general phrases and keeps the chat-specific ones.
assert.ok(list[0].includes('waited by the window'))
const cut = bannedList(census, entries, 1)
assert.equal(cut.length, 1)
assert.ok(cut[0].includes('waited by the window'))

// Weight orders the lexicon half.
const lexOnly = bannedList({ entries: [], has: () => false }, entries)
assert.equal(lexOnly[0], 'something unreadable')

// Duplicates collapse, case-insensitively.
const dupes = bannedList({ entries: [{ phrase: 'swallowed hard', count: 3 }], has: () => true }, entries)
assert.equal(dupes.filter((p) => p.toLowerCase() === 'swallowed hard').length, 1)

// A zero cap, an empty census and an empty lexicon all produce nothing.
assert.deepEqual(bannedList(census, entries, 0), [])
assert.deepEqual(bannedList({ entries: [], has: () => false }, []), [])

// The prompt turn names every phrase and nothing else.
const turn = bannedPromptTurn(['one phrase', 'another phrase'])
assert.match(turn, /one phrase/)
assert.match(turn, /another phrase/)
assert.equal(turn.split('\n').length, 3)

console.log('checkBannedStrings ok')
