// Run: node --experimental-strip-types src/core/prompt/checkWorldInfo.ts
import assert from 'node:assert'
import type { Lorebook, Message, WorldInfoEntry } from '../storage/types'
import { loadTokenizer } from './budget.ts'
import { defaultDepth, matchedEntries, resolveWorldInfo } from './worldInfo.ts'

await loadTokenizer()

let messageId = 0
const message = (content: string): Message => ({
  id: ++messageId,
  ownerId: 'local',
  chatId: 1,
  role: 'user',
  content,
  createdAt: ++messageId,
})

let entryId = 0
function entry(patch: Partial<WorldInfoEntry> = {}): WorldInfoEntry {
  return {
    id: ++entryId,
    ownerId: 'local',
    bookId: 1,
    name: 'e',
    keys: [],
    secondaryKeys: [],
    selectiveLogic: 0,
    content: 'lore',
    always: false,
    enabled: true,
    order: 0,
    position: 'beforeChar',
    ...patch,
  }
}

function book(patch: Partial<Lorebook> = {}): Lorebook {
  return { id: 1, ownerId: 'local', name: '', description: '', global: false, ...patch }
}

/** One book, id 1, which is what `entry()` defaults to. */
const books = (patch: Partial<Lorebook> = {}) => new Map([[patch.id ?? 1, book(patch)]])

const names = (list: WorldInfoEntry[]) => list.map((e) => e.name)
/** The before-char slot, which is where `entry()`'s default position puts everything. */
const textOf = (entries: WorldInfoEntry[], messages: Message[], map?: Map<number, Lorebook>) =>
  resolveWorldInfo(entries, messages, map).before

// --- always-on fires with no keys, a keyless entry doesn't ------------
{
  const always = entry({ name: 'always', always: true })
  const keyless = entry({ name: 'keyless' })
  assert.deepStrictEqual(names(matchedEntries([always, keyless], [message('hi')])), ['always'])
}

// --- a key in recent history fires, case-insensitively ---------------
{
  const e = entry({ name: 'ba', keys: ['Behavioral Activation'] })
  assert.deepStrictEqual(names(matchedEntries([e], [message('tell me about behavioral activation')])), ['ba'])
  assert.deepStrictEqual(matchedEntries([e], [message('tell me about the weather')]), [])
}

// --- a case-sensitive entry only fires on the exact casing -----------
{
  const e = entry({ name: 'xipe', keys: ['Xipe'], caseSensitive: true })
  assert.strictEqual(matchedEntries([e], [message('Xipe walks among us')]).length, 1)
  assert.deepStrictEqual(
    matchedEntries([e], [message('xipe walks among us')]),
    [],
    'the lowercase mention does not count',
  )
  // The same entry without the flag catches both.
  const loose = entry({ name: 'xipe', keys: ['Xipe'] })
  assert.strictEqual(matchedEntries([loose], [message('xipe walks among us')]).length, 1)
}

// --- disabled and empty entries never fire --------------------------
{
  const off = entry({ name: 'off', always: true, enabled: false })
  const blank = entry({ name: 'blank', always: true, content: '   ' })
  assert.deepStrictEqual(matchedEntries([off, blank], []), [])
}

// --- secondary keys, under each of the four selectiveLogic values ----
{
  const hit = [message('the sword and the shield')]
  const primaryOnly = [message('the sword alone')]
  const gated = (selectiveLogic: number, secondaryKeys: string[]) =>
    entry({ keys: ['sword'], secondaryKeys, selectiveLogic })

  // 0 AND_ANY: one secondary present is enough.
  assert.strictEqual(matchedEntries([gated(0, ['shield', 'axe'])], hit).length, 1)
  assert.strictEqual(matchedEntries([gated(0, ['shield'])], primaryOnly).length, 0)

  // 1 NOT_ALL: blocked only when every secondary is there.
  assert.strictEqual(matchedEntries([gated(1, ['shield', 'axe'])], hit).length, 1, 'not all present')
  assert.strictEqual(matchedEntries([gated(1, ['shield'])], hit).length, 0, 'the only one is present')

  // 2 NOT_ANY: blocked as soon as one is there.
  assert.strictEqual(matchedEntries([gated(2, ['shield'])], hit).length, 0)
  assert.strictEqual(matchedEntries([gated(2, ['axe'])], hit).length, 1)

  // 3 AND_ALL: every secondary has to be there.
  assert.strictEqual(matchedEntries([gated(3, ['shield', 'axe'])], hit).length, 0)
  assert.strictEqual(matchedEntries([gated(3, ['shield'])], hit).length, 1)

  // No secondary keys means no gate, whatever the logic value says.
  assert.strictEqual(matchedEntries([gated(3, [])], primaryOnly).length, 1)
  // An always-on entry is never gated either: it never had a primary hit to gate.
  assert.strictEqual(
    matchedEntries([entry({ always: true, secondaryKeys: ['nope'], selectiveLogic: 3 })], []).length,
    1,
  )
}

// --- the scan window is the default when nothing overrides it -------
{
  const e = entry({ keys: ['sword'] })
  const old = [message('a sword!'), ...Array.from({ length: defaultDepth }, () => message('filler'))]
  assert.deepStrictEqual(matchedEntries([e], old), [], 'outside the default window')
  const recent = [message('filler'), message('a sword!')]
  assert.strictEqual(matchedEntries([e], recent).length, 1, 'inside the default window')
}

// --- the book's scan depth widens the window ------------------------
{
  const e = entry({ keys: ['sword'] })
  const history = [message('a sword!'), ...Array.from({ length: 10 }, () => message('filler'))]
  assert.deepStrictEqual(matchedEntries([e], history), [])
  assert.strictEqual(
    matchedEntries([e], history, books({ scanDepth: 50 })).length,
    1,
    "the reference card's scan_depth: 50 reaches back past the default",
  )
}

// --- an entry's own scan depth beats the book's ----------------------
{
  const e = entry({ keys: ['sword'], scanDepth: 2 })
  const history = [message('a sword!'), message('filler'), message('filler')]
  assert.deepStrictEqual(
    matchedEntries([e], history, books({ scanDepth: 50 })),
    [],
    'the entry narrows the book',
  )
}

// --- matches come back in the card's insertion order ----------------
{
  const late = entry({ name: 'late', always: true, order: 100 })
  const early = entry({ name: 'early', always: true, order: 1 })
  assert.deepStrictEqual(names(matchedEntries([late, early], [])), ['early', 'late'])
}

// --- beforeChar entries come out ahead of afterChar ones ------------
{
  const after = entry({ name: 'after', always: true, order: 1, position: 'afterChar' })
  const before = entry({ name: 'before', always: true, order: 100, position: 'beforeChar' })
  assert.deepStrictEqual(
    names(matchedEntries([after, before], [])),
    ['before', 'after'],
    'position outranks order',
  )
}

// --- the token budget drops the tail -------------------------------
{
  const first = entry({ name: 'first', always: true, order: 1, content: 'alpha '.repeat(50) })
  const second = entry({ name: 'second', always: true, order: 2, content: 'beta '.repeat(50) })
  const text = textOf([first, second], [], books({ tokenBudget: 60 }))
  assert.ok(text.includes('alpha'), 'the first entry survives')
  assert.ok(!text.includes('beta'), 'the entry that would cross the budget is dropped')
  // A budget smaller than one entry still yields that entry, see the comment in resolveWorldInfo.
  const tight = textOf([first, second], [], books({ tokenBudget: 5 }))
  assert.ok(tight.includes('alpha') && !tight.includes('beta'), 'the first match is never dropped')
  // No budget means no dropping.
  const all = textOf([first, second], [], books())
  assert.ok(all.includes('alpha') && all.includes('beta'))
}

// --- the budget is per book --------------------------------------
{
  const one = entry({ bookId: 1, name: 'one', always: true, order: 1, content: 'alpha '.repeat(50) })
  const oneMore = entry({ bookId: 1, name: 'oneMore', always: true, order: 2, content: 'beta '.repeat(50) })
  const two = entry({ bookId: 2, name: 'two', always: true, order: 3, content: 'gamma '.repeat(50) })
  const map = new Map([
    [1, book({ id: 1, tokenBudget: 60 })],
    [2, book({ id: 2, tokenBudget: 60 })],
  ])
  const text = textOf([one, oneMore, two], [], map)
  assert.ok(text.includes('alpha'), "book 1's first entry")
  assert.ok(!text.includes('beta'), "book 1 spent its budget")
  assert.ok(text.includes('gamma'), "book 2 has its own budget and is not silenced by book 1")
  // A book with no budget row is unlimited rather than blocked.
  const unbudgeted = textOf([one, oneMore], [], new Map())
  assert.ok(unbudgeted.includes('alpha') && unbudgeted.includes('beta'))
}

// --- atDepth entries come back separated from .text -----------------
{
  const inline = entry({ name: 'inline', always: true, order: 1, content: 'in the block' })
  const deep = entry({ name: 'deep', always: true, order: 2, position: 'atDepth', depth: 2, content: 'at two' })
  const shallow = entry({ name: 'shallow', always: true, order: 3, position: 'atDepth', depth: 1, content: 'at one' })
  const alsoTwo = entry({ name: 'alsoTwo', always: true, order: 4, position: 'atDepth', depth: 2, content: 'also two' })
  const out = resolveWorldInfo([inline, deep, shallow, alsoTwo], [])
  assert.strictEqual(out.before, 'in the block', 'only the inline entry is in the block text')
  assert.deepStrictEqual(out.atDepth, [
    { depth: 2, text: 'at two\nalso two' }, // one message per depth, deepest first
    { depth: 1, text: 'at one' },
  ])
  // An entry at a depth with none named lands on SillyTavern's default of 4.
  const bare = entry({ always: true, position: 'atDepth', content: 'no depth' })
  assert.deepStrictEqual(resolveWorldInfo([bare], []).atDepth, [{ depth: 4, text: 'no depth' }])
}

// --- nothing matched is the empty string, which the prompt skips ----
{
  const out = resolveWorldInfo([entry({ keys: ['nope'] })], [message('hi')])
  assert.strictEqual(out.before, '')
  assert.strictEqual(out.after, '')
  assert.deepStrictEqual(out.atDepth, [])
  assert.deepStrictEqual(out.dropped, [])
}

// --- the three positions land in three separate slots ---------------
{
  const before = entry({ name: 'b', always: true, order: 1, content: 'before text' })
  const after = entry({ name: 'a', always: true, order: 2, position: 'afterChar', content: 'after text' })
  const deep = entry({ name: 'd', always: true, order: 3, position: 'atDepth', depth: 3, content: 'deep text' })
  const out = resolveWorldInfo([before, after, deep], [])
  assert.strictEqual(out.before, 'before text')
  assert.strictEqual(out.after, 'after text', 'afterChar keeps its own block text')
  assert.deepStrictEqual(out.atDepth, [{ depth: 3, text: 'deep text' }])
}

// --- the prompt-wide cap drops the lowest-priority entries ----------
{
  // Roughly 50 tokens each: a cap of 120 fits two.
  const make = (name: string, order: number) =>
    entry({ name, always: true, order, content: `${name} `.repeat(50) })
  const list = [make('first', 1), make('second', 2), make('third', 3)]
  const out = resolveWorldInfo(list, [], undefined, 120)
  assert.ok(out.before.includes('first') && out.before.includes('second'))
  assert.ok(!out.before.includes('third'), 'the lowest-priority entry is the one dropped')
  assert.deepStrictEqual(
    out.dropped.map((d) => d.name),
    ['third'],
    'what was cut is reported, for the preview to name',
  )
  // The cap stops rather than skips: a small late entry does not jump the queue.
  const withRunt = [...list, entry({ name: 'runt', always: true, order: 4, content: 'tiny' })]
  const stopped = resolveWorldInfo(withRunt, [], undefined, 120)
  assert.ok(!stopped.before.includes('tiny'), 'order means priority, even for an entry that would fit')
  // No cap, and a zero cap, both mean everything goes in.
  assert.strictEqual(resolveWorldInfo(list, []).dropped.length, 0)
  assert.strictEqual(resolveWorldInfo(list, [], undefined, 0).dropped.length, 0)
  // Unlike a book budget, the cap has no first-match exemption: a cap under one entry yields none.
  const none = resolveWorldInfo(list, [], undefined, 5)
  assert.strictEqual(none.before, '')
  assert.strictEqual(none.dropped.length, 3)
}

// --- the cap spans all three slots, and applies after book budgets --
{
  const long = (name: string, order: number, patch: Partial<WorldInfoEntry> = {}) =>
    entry({ name, always: true, order, content: `${name} `.repeat(50), ...patch })
  const out = resolveWorldInfo(
    [long('one', 1), long('two', 2, { position: 'afterChar' }), long('three', 3, { position: 'atDepth' })],
    [],
    undefined,
    120,
  )
  assert.ok(out.before.includes('one'))
  assert.ok(out.after.includes('two'))
  assert.deepStrictEqual(out.atDepth, [], 'the depth slot draws on the same pool as the other two')
  assert.deepStrictEqual(out.dropped.map((d) => d.name), ['three'])
  // An entry the book budget already dropped is not reported as over the prompt cap.
  const booked = resolveWorldInfo(
    [long('one', 1), long('two', 2)],
    [],
    books({ tokenBudget: 60 }),
    10_000,
  )
  assert.ok(!booked.before.includes('two'))
  assert.deepStrictEqual(booked.dropped, [], "the book's own limit is not the user's budget")
}

console.log('checkWorldInfo ok')
