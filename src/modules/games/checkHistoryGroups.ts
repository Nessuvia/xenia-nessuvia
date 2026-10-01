// Run: node --experimental-strip-types src/modules/games/checkHistoryGroups.ts
import assert from 'node:assert'
import { groupHistory } from './historyGroups.ts'

const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime()
const games = [
  { id: 1, characterName: 'Cid', gameLabel: 'Go Fish', at: at(2026, 8, 6) },
  { id: 2, characterName: 'Nessuvia', gameLabel: 'Blackjack', at: at(2026, 9, 1) },
  { id: 3, characterName: 'Cid', gameLabel: 'Blackjack', at: at(2026, 9, 3) },
]
const ids = (groups: ReturnType<typeof groupHistory<(typeof games)[number]>>) =>
  groups.map((g) => [g.label, g.games.map((x) => x.id)])

// By date: months newest first, games newest first inside.
const byDate = groupHistory(games, 'date')
assert.strictEqual(byDate.length, 2)
assert.deepStrictEqual(byDate[0].games.map((g) => g.id), [3, 2])
assert.deepStrictEqual(byDate[1].games.map((g) => g.id), [1])

// By character and by game: names A to Z, games newest first inside.
assert.deepStrictEqual(ids(groupHistory(games, 'character')), [
  ['Cid', [3, 1]],
  ['Nessuvia', [2]],
])
assert.deepStrictEqual(ids(groupHistory(games, 'game')), [
  ['Blackjack', [3, 2]],
  ['Go Fish', [1]],
])

assert.deepStrictEqual(groupHistory([], 'date'), [])
