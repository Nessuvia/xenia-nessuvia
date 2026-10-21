import assert from 'node:assert'
import { forgetSwipes, rememberSnapshot, snapshotFor } from './snapshots.ts'

// --- each swipe keeps its own, holes stay holes ---------------------------
{
  rememberSnapshot(1, 1, '{"b":2}')
  rememberSnapshot(1, 2, '{"c":3}')
  rememberSnapshot(1, 3, undefined)
  assert.strictEqual(snapshotFor({ id: 1, swipeIndex: 0 }), undefined)
  assert.strictEqual(snapshotFor({ id: 1, swipeIndex: 1 }), '{"b":2}')
  assert.strictEqual(snapshotFor({ id: 1, swipeIndex: 2 }), '{"c":3}')
  assert.strictEqual(snapshotFor({ id: 1, swipeIndex: 3 }), undefined)
  assert.strictEqual(snapshotFor({ swipeIndex: 1 }), undefined)
  assert.strictEqual(snapshotFor({ id: 2 }), undefined)
}

// --- a continuation replaces the selected swipe's ---------------------------
{
  rememberSnapshot(3, 0, '{"a":1}')
  rememberSnapshot(3, 0, '{"d":4}')
  assert.strictEqual(snapshotFor({ id: 3 }), '{"d":4}')
}

// --- deleting swipes keeps the rest lined up ------------------------------
{
  // Swipe 0 is a hole: it must shift like any other slot.
  rememberSnapshot(4, 1, 'one')
  rememberSnapshot(4, 2, 'two')
  forgetSwipes(4, [0])
  assert.strictEqual(snapshotFor({ id: 4, swipeIndex: 0 }), 'one')
  assert.strictEqual(snapshotFor({ id: 4, swipeIndex: 1 }), 'two')
  forgetSwipes(4, [0])
  assert.strictEqual(snapshotFor({ id: 4, swipeIndex: 0 }), 'two')
  forgetSwipes(99, [0]) // unknown message: no throw
}
