// Run: node --experimental-strip-types src/core/stores/checkSwipes.ts
import assert from 'node:assert'
import type { Message } from '../storage/types'
import { continued, deletedSwipes, instructionChain, passOriginalFor, passed, reasoningFor, regenerated, revertPass, selectSwipe, snapshotFor, swipeCount, swipeIndex, withPass } from './swipes.ts'

const reply = (id: number, content: string): Message => ({
  id,
  ownerId: 'local',
  chatId: 1,
  role: 'assistant',
  content,
  createdAt: id,
})

/** The invariant that lets every Phase 1 reader keep working. */
function mirrors(m: Message) {
  assert.strictEqual(m.content, m.swipes![m.swipeIndex!], 'content mirrors the selected swipe')
}

// --- a fresh message looks like one alternate -------------------------------
{
  const m = reply(1, 'original')
  assert.strictEqual(swipeCount(m), 1)
  assert.strictEqual(swipeIndex(m), 0)
}

// --- first regenerate seeds swipes[0] with the original -------------------
{
  const first = regenerated(reply(1, 'original'), 'second')!
  assert.deepStrictEqual(first.swipes, ['original', 'second'])
  assert.strictEqual(first.swipeIndex, 1)
  assert.strictEqual(first.content, 'second')
  mirrors(first)

  // Appends from there, always pointing at the newest.
  const third = regenerated(first, 'third')!
  assert.deepStrictEqual(third.swipes, ['original', 'second', 'third'])
  assert.strictEqual(third.swipeIndex, 2)
  mirrors(third)
}

// --- an empty record: the first real text is swipe 1, not swipe 2 ---------
{
  const first = regenerated(reply(1, ''), 'first')!
  assert.deepStrictEqual(first.swipes, ['first'])
  assert.strictEqual(first.swipeIndex, 0)
  assert.strictEqual(swipeCount(first), 1)
  mirrors(first)
  assert.deepStrictEqual(regenerated(first, 'second')!.swipes, ['first', 'second'])
}

// --- selectSwipe mirrors content, and clamps instead of throwing ----------
{
  const three = regenerated(regenerated(reply(1, 'a'), 'b')!, 'c')!
  const back = selectSwipe(three, 0)
  assert.strictEqual(back.content, 'a')
  mirrors(back)
  mirrors(selectSwipe(three, 1))

  assert.strictEqual(selectSwipe(three, -5).swipeIndex, 0)
  assert.strictEqual(selectSwipe(three, 99).swipeIndex, 2)
  mirrors(selectSwipe(three, -5))
  mirrors(selectSwipe(three, 99))

  // Selecting on a message that never regenerated seeds swipe 0 and stays put.
  const untouched = selectSwipe(reply(1, 'only'), 3)
  assert.deepStrictEqual(untouched.swipes, ['only'])
  assert.strictEqual(untouched.content, 'only')
  mirrors(untouched)
}

// --- an errored regenerate changes nothing --------------------------------
{
  const before = regenerated(reply(1, 'a'), 'b')!
  const snapshot = JSON.stringify(before)
  assert.strictEqual(regenerated(before, ''), null) // nothing streamed = nothing to store
  assert.strictEqual(JSON.stringify(before), snapshot)
}

// --- an aborted regenerate keeps the partial as a swipe -------------------
{
  const partial = regenerated(reply(1, 'a'), 'half a sen')!
  assert.deepStrictEqual(partial.swipes, ['a', 'half a sen'])
  assert.strictEqual(partial.content, 'half a sen')
}

// --- swiping message N leaves N+1 onward byte-identical --------------------
{
  const list = [reply(1, 'one'), reply(2, 'two'), reply(3, 'three')]
  const snapshot = JSON.stringify(list.slice(1))
  const swiped = regenerated(list[0], 'one again')!
  const after = [swiped, ...list.slice(1)]
  assert.strictEqual(JSON.stringify(after.slice(1)), snapshot)
  assert.strictEqual(after[0].content, 'one again')
  // Nothing about a swipe touches ids, timestamps or ordering.
  assert.strictEqual(swiped.id, 1)
  assert.strictEqual(swiped.createdAt, 1)
}

// --- snapshots stay parallel to swipes ------------------------------------
{
  // A message from before snapshots existed: swipe 0 has no entry, the new one does.
  const first = regenerated(reply(1, 'one'), 'two', '{"b":2}')!
  assert.strictEqual(first.requestSnapshots!.length, first.swipes!.length)
  assert.strictEqual(snapshotFor(first), '{"b":2}')
  assert.strictEqual(snapshotFor(selectSwipe(first, 0)), undefined)

  // And each further swipe keeps its own.
  const second = regenerated(first, 'three', '{"c":3}')!
  assert.strictEqual(second.requestSnapshots!.length, 3)
  assert.strictEqual(snapshotFor(second), '{"c":3}')
  assert.strictEqual(snapshotFor(selectSwipe(second, 1)), '{"b":2}')

  // A regeneration with nothing to store leaves a hole, not a shifted array.
  const third = regenerated(second, 'four')!
  assert.strictEqual(third.requestSnapshots!.length, 4)
  assert.strictEqual(snapshotFor(third), undefined)
  assert.strictEqual(snapshotFor(selectSwipe(third, 2)), '{"c":3}')
}

// --- reasonings stay parallel to swipes, same as snapshots ----------------
{
  const first = regenerated(reply(1, 'one'), 'two', undefined, 'because two')!
  assert.strictEqual(first.reasonings!.length, first.swipes!.length)
  assert.strictEqual(reasoningFor(first), 'because two')
  assert.strictEqual(reasoningFor(selectSwipe(first, 0)), undefined) // swipe 0 predates it

  // A re-roll with no reasoning leaves a hole, and earlier swipes keep theirs.
  const second = regenerated(first, 'three')!
  assert.strictEqual(second.reasonings!.length, 3)
  assert.strictEqual(reasoningFor(second), undefined)
  assert.strictEqual(reasoningFor(selectSwipe(second, 1)), 'because two')
}

// --- deleting swipes ------------------------------------------------------
{
  // one, two(+snap b), three(+snap c, reasoning r3)
  let m = regenerated(reply(1, 'one'), 'two', '{"b":2}')!
  m = regenerated(m, 'three', '{"c":3}', 'r3')!
  assert.strictEqual(swipeIndex(m), 2)

  // Dropping an earlier swipe slides the selection back and keeps parallel arrays aligned.
  const dropFirst = deletedSwipes(m, [0])!
  assert.deepStrictEqual(dropFirst.swipes, ['two', 'three'])
  assert.strictEqual(swipeIndex(dropFirst), 1)
  assert.strictEqual(dropFirst.content, 'three')
  assert.strictEqual(snapshotFor(dropFirst), '{"c":3}')
  assert.strictEqual(reasoningFor(dropFirst), 'r3')
  assert.strictEqual(snapshotFor(selectSwipe(dropFirst, 0)), '{"b":2}')

  // Dropping the selected last swipe lands on the new last one.
  const dropLast = deletedSwipes(m, [2])!
  assert.deepStrictEqual(dropLast.swipes, ['one', 'two'])
  assert.strictEqual(swipeIndex(dropLast), 1)
  assert.strictEqual(dropLast.content, 'two')
  assert.strictEqual(snapshotFor(dropLast), '{"b":2}')

  // Nothing left means the caller deletes the message.
  assert.strictEqual(deletedSwipes(m, [0, 1, 2]), null)
  assert.strictEqual(deletedSwipes(reply(2, 'only'), [0]), null)

  // A message with no swipes array still deletes its single swipe by index 0.
  const single = deletedSwipes(reply(3, 'only'), [1])!
  assert.deepStrictEqual(single.swipes, ['only'])
  assert.strictEqual(swipeCount(single), 1)
}

// --- continuing writes in place, and never adds a swipe -------------------
{
  // A message that was never re-rolled: still one swipe afterwards.
  const once = continued(reply(1, 'half a sen'), 'half a sentence')!
  assert.deepStrictEqual(once.swipes, ['half a sentence'])
  assert.strictEqual(swipeCount(once), 1)
  assert.strictEqual(once.swipeIndex, 0)
  mirrors(once)

  // Three swipes, sitting on the middle one: only that one changes.
  let m = regenerated(reply(1, 'one'), 'two', '{"b":2}', 'r2')!
  m = regenerated(m, 'three', '{"c":3}', 'r3')!
  const on = continued(selectSwipe(m, 1), 'two and more', '{"d":4}', 'r4')!
  assert.deepStrictEqual(on.swipes, ['one', 'two and more', 'three'])
  assert.strictEqual(swipeCount(on), 3)
  assert.strictEqual(swipeIndex(on), 1)
  mirrors(on)
  // The continuation's request is what produced the text as it now stands; reasoning accumulates.
  assert.strictEqual(snapshotFor(on), '{"d":4}')
  assert.strictEqual(reasoningFor(on), 'r2\n\nr4')
  // Its neighbours are untouched.
  assert.strictEqual(snapshotFor(selectSwipe(on, 2)), '{"c":3}')
  assert.strictEqual(reasoningFor(selectSwipe(on, 2)), 'r3')

  // A continuation that produced nothing changes nothing.
  const before = JSON.stringify(m)
  assert.strictEqual(continued(m, ''), null)
  assert.strictEqual(JSON.stringify(m), before)

  // No snapshot and no reasoning leave what was already there alone.
  const bare = continued(selectSwipe(m, 1), 'two and more')!
  assert.strictEqual(snapshotFor(bare), '{"b":2}')
  assert.strictEqual(reasoningFor(bare), 'r2')
}

// --- instructions stay parallel, and the chain stops at the selection ------
{
  // one, then a plain re-roll (no instruction), then two corrections.
  let m = regenerated(reply(1, 'one'), 'two')!
  m = regenerated(m, 'three', undefined, undefined, 'less dialogue')!
  m = regenerated(m, 'four', undefined, undefined, '  she should refuse  ')!
  assert.strictEqual(m.instructions!.length, m.swipes!.length)
  // Swipe 0 and 1 predate any instruction: they are holes rather than a shifted array.
  assert.deepStrictEqual(m.instructions, [undefined, undefined, 'less dialogue', 'she should refuse'])
  assert.deepStrictEqual(instructionChain(m), ['less dialogue', 'she should refuse'])

  // Swiping back drops the later gripes: that is how a correction is backed out of.
  assert.deepStrictEqual(instructionChain(selectSwipe(m, 2)), ['less dialogue'])
  assert.deepStrictEqual(instructionChain(selectSwipe(m, 1)), [])
  assert.deepStrictEqual(instructionChain(reply(9, 'untouched')), [])

  // Deleting a middle swipe keeps the array aligned with what is left.
  const dropped = deletedSwipes(m, [2])!
  assert.deepStrictEqual(dropped.swipes, ['one', 'two', 'four'])
  assert.deepStrictEqual(dropped.instructions, [undefined, undefined, 'she should refuse'])
  assert.deepStrictEqual(instructionChain(dropped), ['she should refuse'])

  // An empty instruction is a hole, not an empty string in the chain.
  const blank = regenerated(m, 'five', undefined, undefined, '   ')!
  assert.strictEqual(blank.instructions![4], undefined)
  assert.deepStrictEqual(instructionChain(blank), ['less dialogue', 'she should refuse'])

  // Continuing writes in place. It must not disturb the instructions either.
  const on = continued(selectSwipe(m, 2), 'three and more')!
  assert.deepStrictEqual(on.instructions, m.instructions)
  assert.deepStrictEqual(instructionChain(on), ['less dialogue'])
}

// --- Second Sweep arrays run parallel to swipes ---------------------------
{
  // A fresh take has not been passed: `regenerated` only pads, and the pass writes its own slot.
  const fresh = regenerated(reply(1, 'one'), 'two')!
  assert.strictEqual(fresh.passOriginals!.length, fresh.swipes!.length)
  assert.strictEqual(passOriginalFor(fresh), undefined)

  // A pass that changed the text stores what it replaced and leaves the swipe in place.
  const done = passed(fresh, 'two, tightened', 'two', 'cleaned, rewritten')
  assert.deepStrictEqual(done.swipes, ['one', 'two, tightened'])
  assert.strictEqual(done.content, 'two, tightened')
  assert.strictEqual(passOriginalFor(done), 'two')
  assert.strictEqual(passOriginalFor(selectSwipe(done, 0)), undefined) // swipe 0 predates the pass

  // A pass that changed nothing keeps no original: a comparison with nothing in it is noise.
  assert.strictEqual(passOriginalFor(passed(fresh, 'two', 'two')), undefined)

  // Padding: a swipe made with the pass off leaves a hole rather than shifting the array.
  const mixed = regenerated(done, 'three')!
  assert.strictEqual(mixed.passOriginals!.length, 3)
  assert.strictEqual(passOriginalFor(mixed), undefined)
  assert.strictEqual(passOriginalFor(selectSwipe(mixed, 1)), 'two')

  // Deleting a swipe takes its original with it. The arrays stay aligned.
  const pruned = deletedSwipes(mixed, [0])!
  assert.deepStrictEqual(pruned.swipes, ['two, tightened', 'three'])
  assert.strictEqual(passOriginalFor(selectSwipe(pruned, 0)), 'two')
  assert.strictEqual(passOriginalFor(selectSwipe(pruned, 1)), undefined)

  // A continuation writes in place and must not disturb what the pass recorded.
  const cont = continued(selectSwipe(mixed, 1), 'two, tightened and more')!
  assert.strictEqual(passOriginalFor(cont), 'two')

  // Reverting puts the original back in the swipe and forgets it.
  const back = revertPass(selectSwipe(mixed, 1))!
  assert.strictEqual(back.content, 'two')
  assert.strictEqual(back.swipes![1], 'two')
  assert.strictEqual(passOriginalFor(back), undefined)
  assert.strictEqual(revertPass(fresh), null)

  // A failure records the reason against the selected swipe and leaves the text alone.
  const failed = withPass(selectSwipe(mixed, 2), undefined, 'The rewrite came back empty.')
  assert.strictEqual(failed.passFailed![2], 'The rewrite came back empty.')
  assert.strictEqual(failed.content, mixed.content)
}

console.log('ok')
