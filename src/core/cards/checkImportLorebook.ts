// The standalone world-info reader, against the reference export in src/assets/testAssets.
// Run: node --experimental-strip-types src/core/cards/checkImportLorebook.ts
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { importLorebook, mapEntry } from './importLorebook.ts'

const reference = JSON.parse(
  readFileSync(new URL('../../assets/testAssets/honkai-star-rail.json', import.meta.url), 'utf8'),
)

// --- the reference file: index-keyed, key/keysecondary, disable ----------
const { book, entries } = importLorebook(reference, 'from the filename')

assert.equal(entries.length, 63, 'every entry is read out of the index-keyed object')
assert.equal(book.name, 'Honkai Star Rail', "the file's own name, not the filename fallback")
assert.equal(book.scanDepth, 2)
assert.equal(book.tokenBudget, 2048)
assert.equal(book.global, false, 'an imported book applies nowhere until it is attached')

const xipe = entries.find((e) => e.name === 'Xipe, the Harmony')!
assert.ok(xipe, 'entries are labelled from `comment`')
assert.deepStrictEqual(xipe.keys, ['Xipe', 'Great One', 'Harmony'], '`key`, not just `keys`')
assert.equal(xipe.position, 'atDepth', 'position 4')
assert.equal(xipe.depth, 4)
assert.equal(xipe.caseSensitive, true)
assert.equal(xipe.enabled, true, '`disable: false` is on')
assert.equal(xipe.order, 100, 'insertion_order wins over the index')
assert.equal(xipe.selectiveLogic, 0)
assert.ok(xipe.raw, 'the untouched entry is kept for re-export')

// --- both spellings of the key fields are read --------------------------
{
  const fromSt = mapEntry({ key: ['a'], keysecondary: ['b'], content: 'x', selective: true }, 0)
  const fromSpec = mapEntry({ keys: ['a'], secondary_keys: ['b'], content: 'x', selective: true }, 0)
  assert.deepStrictEqual(fromSt.keys, ['a'])
  assert.deepStrictEqual(fromSt.secondaryKeys, ['b'])
  assert.deepStrictEqual(fromSpec.keys, ['a'])
  assert.deepStrictEqual(fromSpec.secondaryKeys, ['b'])
  // `selective: false` means the author turned the gate off and left the keys behind.
  assert.deepStrictEqual(
    mapEntry({ key: ['a'], keysecondary: ['b'], content: 'x', selective: false }, 0).secondaryKeys,
    [],
  )
}

// --- `disable` and `enabled` both switch an entry off -------------------
assert.equal(mapEntry({ content: 'x', disable: true }, 0).enabled, false)
assert.equal(mapEntry({ content: 'x', enabled: false }, 0).enabled, false)
assert.equal(mapEntry({ content: 'x' }, 0).enabled, true, 'absent means on')

// --- order falls through its three spellings, then the index ------------
assert.equal(mapEntry({ content: 'x', insertion_order: 1, order: 2, priority: 3 }, 9).order, 1)
assert.equal(mapEntry({ content: 'x', order: 2, priority: 3 }, 9).order, 2)
assert.equal(mapEntry({ content: 'x', priority: 3 }, 9).order, 3)
assert.equal(mapEntry({ content: 'x' }, 9).order, 9)

// --- scan depth is extensions.scan_depth, never extensions.depth --------
{
  const e = mapEntry({ content: 'x', extensions: { scan_depth: 2, depth: 7 } }, 0)
  assert.equal(e.scanDepth, 2)
  assert.equal(e.depth, 7, 'extensions.depth is the insertion point, and lands there instead')
}

// --- a character_book-wrapped card goes through the same mapper ---------
{
  const card = {
    data: {
      name: 'Ada',
      character_book: {
        name: 'Ada lore',
        scan_depth: 5,
        entries: [{ keys: ['engine'], content: 'The analytical engine.', comment: 'Engine' }],
      },
    },
  }
  const wrapped = importLorebook(card)
  assert.equal(wrapped.book.name, 'Ada lore')
  assert.equal(wrapped.book.scanDepth, 5)
  assert.equal(wrapped.entries.length, 1)
  assert.equal(wrapped.entries[0].name, 'Engine')
  assert.equal(wrapped.entries[0].position, 'beforeChar', 'no position given is the block, not a depth')
}

// --- a book with no name takes the filename; entries with no text go ----
{
  const bare = importLorebook({ entries: [{ keys: ['a'], content: 'x' }, { keys: ['b'], content: '  ' }] }, 'my-book')
  assert.equal(bare.book.name, 'my-book')
  assert.equal(bare.entries.length, 1, 'an entry with no content has nothing to inject')
}

// --- a file with no entries is not a lorebook ---------------------------
assert.throws(() => importLorebook({ name: 'empty' }), /No lorebook entries/)

console.log('checkImportLorebook: ok')
