import assert from 'node:assert'
import { forgetMotion, isFlying, motionSettled, noteMotion, type Settleable } from './cardMotion.ts'

/** An animation whose end this test controls. */
function fake(playState = 'running') {
  let done!: () => void
  let fail!: (err: unknown) => void
  const finished = new Promise((resolve, reject) => {
    done = () => resolve(undefined)
    fail = reject
  })
  // A rejection nobody has attached to yet is an unhandled rejection in node.
  finished.catch(() => {})
  return { animation: { playState, finished } as Settleable, done, fail }
}

/** Resolved yet? A microtask drain is enough: nothing here waits on a real timer. */
async function settledYet(promise: Promise<void>) {
  let flag = false
  void promise.then(() => {
    flag = true
  })
  await new Promise((r) => setTimeout(r, 0))
  return flag
}

async function run() {
  forgetMotion()

  // Nothing noted: the gate is open.
  assert.equal(await settledYet(motionSettled()), true, 'empty gate should not wait')

  // One running animation holds the gate until it finishes.
  const a = fake()
  noteMotion([a.animation])
  const first = motionSettled()
  assert.equal(await settledYet(first), false, 'gate should wait on a running animation')
  a.done()
  await first

  // A cancelled animation rejects `finished`, and that still settles the gate.
  const b = fake()
  noteMotion([b.animation])
  const second = motionSettled()
  b.fail(new Error('cancelled'))
  await second

  // Every animation, not just the first.
  const c = fake()
  const d = fake()
  noteMotion([c.animation, d.animation])
  const third = motionSettled()
  c.done()
  assert.equal(await settledYet(third), false, 'gate should wait on all of them')
  d.done()
  await third

  // Finished animations are dropped rather than kept, or the list grows all game.
  noteMotion([fake('finished').animation, fake('idle').animation])
  assert.equal(await settledYet(motionSettled()), true, 'finished animations should not be held')

  // A wedged animation costs a slow turn.
  const stuck = fake()
  noteMotion([stuck.animation])
  const start = Date.now()
  await motionSettled(20)
  assert.ok(Date.now() - start < 1000, 'gate should give up at the timeout')

  // Waiting consumes: a second wait does not block on the same animations again.
  assert.equal(await settledYet(motionSettled()), true, 'gate should clear after a wait')

  // forgetMotion drops anything outstanding.
  noteMotion([fake().animation])
  forgetMotion()
  assert.equal(await settledYet(motionSettled()), true, 'forgetMotion should empty the gate')

  // A card is in flight while any animation on it is running or paused, and settled once they have
  // all ended. The board measures on the settled ones only: a moving card cannot be measured.
  assert.equal(isFlying([]), false, 'a card with no animations is not flying')
  assert.equal(isFlying([{ playState: 'running' }]), true, 'running is flying')
  assert.equal(isFlying([{ playState: 'paused' }]), true, 'paused is flying')
  assert.equal(
    isFlying([{ playState: 'finished' }, { playState: 'idle' }]),
    false,
    'finished and idle are not flying',
  )
  assert.equal(
    isFlying([{ playState: 'finished' }, { playState: 'running' }]),
    true,
    'one running animation is enough',
  )

  console.log('cardMotion ok')
}

await run()
