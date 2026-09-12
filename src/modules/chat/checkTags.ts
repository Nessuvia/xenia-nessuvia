// node --experimental-strip-types src/modules/chat/checkTags.ts
import assert from 'node:assert'
import { allTags, groupByPrimaryTag, matchesTags, renameTag, tagCounts, UNTAGGED } from './tags.ts'

const c = (...tags: string[]) => ({ tags })

const roster = [
  c('Video Games', 'Brooding'), // primary: Video Games
  c('Video Games'),
  c('Brooding', 'Male'),
  c('Male'),
  c('Male'),
  c(), // untagged
]

// allTags is distinct, alphabetical, case-sensitive
assert.deepStrictEqual(allTags(roster), ['Brooding', 'Male', 'Video Games'])
assert.deepStrictEqual(allTags([c('female'), c('Female')]), ['female', 'Female'].sort((a, b) => a.localeCompare(b)))

// counts every use, including non-primaries
assert.strictEqual(tagCounts(roster).get('Brooding'), 2)
assert.strictEqual(tagCounts(roster).get('Male'), 3)
assert.strictEqual(tagCounts(roster).get('Nope'), undefined)

// any vs all
const both = c('Video Games', 'Brooding')
assert.ok(matchesTags(both, ['Video Games', 'Male'], 'any'))
assert.ok(!matchesTags(both, ['Video Games', 'Male'], 'all'))
assert.ok(matchesTags(both, ['Video Games', 'Brooding'], 'all'))
// an empty selection is inert
assert.ok(matchesTags(c(), [], 'all'))
assert.ok(matchesTags(c(), [], 'any'))

// first tag wins: every character appears exactly once, and the counts sum to the roster
const groups = groupByPrimaryTag(roster)
assert.strictEqual(
  groups.reduce((n, g) => n + g.characters.length, 0),
  roster.length,
)
assert.deepStrictEqual(
  groups.map((g) => `${g.tag}:${g.characters.length}`),
  ['Male:2', 'Video Games:2', 'Brooding:1', `${UNTAGGED}:1`],
  'biggest first, ties alphabetical, Untagged last',
)
// Brooding is on two characters and is only one character's primary: its group holds one
assert.strictEqual(tagCounts(roster).get('Brooding'), 2)
assert.strictEqual(groups.find((g) => g.tag === 'Brooding')!.characters.length, 1)

// Untagged stays last even when it is the biggest group
const lopsided = groupByPrimaryTag([c(), c(), c(), c('Male')])
assert.strictEqual(lopsided[lopsided.length - 1].tag, UNTAGGED)

// `only` restricts which groups come back, and drops Untagged with it
assert.deepStrictEqual(
  groupByPrimaryTag(roster, ['Video Games']).map((g) => g.tag),
  ['Video Games'],
)

// rename keeps position: the primary group does not shift
assert.deepStrictEqual(renameTag(['Video Games', 'Brooding'], 'Video Games', 'Games'), [
  'Games',
  'Brooding',
])

console.log('checkTags ok')
