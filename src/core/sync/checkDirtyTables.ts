// Run: node --experimental-strip-types src/core/sync/checkDirtyTables.ts
import assert from 'node:assert'
import { tableNames } from '../storage/storageInterface.ts'

// Node has no localStorage, and the settings store's persist middleware warns on every write
// without one. A Map-backed stub keeps the output to the assertions. It hangs off `window` because
// that is where zustand's persist default looks. Static imports are hoisted above this, so the two
// modules that reach the store are imported dynamically, after it is set.
const store = new Map<string, string>()
const localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}
;(globalThis as { window?: unknown }).window = { localStorage }

const { isSuppressed, markDirty, withDirtySuppressed } = await import('./dirtyTables.ts')
const { useSettings } = await import('../stores/settingsStore.ts')

const dirty = () => useSettings.getState().dirtyTables
const clean = () => useSettings.getState().markTablesClean(tableNames)

// Every table starts dirty. Nothing has been pushed yet, and everything is pending.
assert.deepStrictEqual([...dirty()].sort(), [...tableNames].sort())

// A mutation marks exactly its own table.
clean()
assert.deepStrictEqual(dirty(), [])
markDirty('chats')
assert.deepStrictEqual(dirty(), ['chats'])

// Marking an already-dirty table is a no-op: no duplicate entry.
markDirty('chats')
assert.deepStrictEqual(dirty(), ['chats'])

markDirty('messages')
assert.deepStrictEqual(dirty(), ['chats', 'messages'])

// markTablesClean clears only what it names.
useSettings.getState().markTablesClean(['chats'])
assert.deepStrictEqual(dirty(), ['messages'])
// Naming a clean table is harmless.
useSettings.getState().markTablesClean(['palettes'])
assert.deepStrictEqual(dirty(), ['messages'])

// Suppression: a whole-table replacement marks nothing.
clean()
await withDirtySuppressed(async () => {
  markDirty('characters')
  markDirty('palettes')
})
assert.deepStrictEqual(dirty(), [])
assert.strictEqual(isSuppressed(), false, 'suppression must not outlive the wrapper')

// A throw inside the wrapper still restores tracking: the whole reason it is a wrapper.
await assert.rejects(
  withDirtySuppressed(async () => {
    throw new Error('mid-restore failure')
  }),
  /mid-restore failure/,
)
assert.strictEqual(isSuppressed(), false)
markDirty('characters')
assert.deepStrictEqual(dirty(), ['characters'])

console.log('checkDirtyTables ok')
