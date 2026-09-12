// Run: node --experimental-strip-types src/core/games/checkDriver.ts
//
// The check that would have caught every stuck table: a game is driven the way the store drives it,
// and after every batch the board is asked whether anybody can move. A state where the driver has
// nothing to say, the player has nothing legal to do, and the game is not over is the bug.
import assert from 'node:assert'
import { drivers, driveGuard } from './driver.ts'
import type { AnyGameState } from './driver.ts'
import type { GameKind } from './gameEvent.ts'
import * as blackjack from './blackjack.ts'
import * as goFish from './goFish.ts'
import type { GoFishState } from './goFish.ts'
import type { BlackjackState } from './blackjack.ts'

/** Whether anybody at all can move: the driver, or the player. */
function stuck(kind: GameKind, state: AnyGameState): boolean {
  if (state.over) return false
  if (drivers[kind](state, { difficulty: 'average' })) return false
  if (kind === 'blackjack') return blackjack.legalActions(state as BlackjackState).length === 0
  const board = state as GoFishState
  return board.turn !== 'player' || goFish.legalAsks(board, 'player').length === 0
}

/** One game, played by a scripted player, driven the way the store drives it. */
function play(kind: GameKind, seed: number): { state: AnyGameState; turns: number } {
  let state: AnyGameState = kind === 'blackjack' ? blackjack.initialState(seed) : goFish.initialState(seed)
  let turns = 0
  let guard = 0
  while (!state.over && guard++ < driveGuard * 4) {
    assert.ok(!stuck(kind, state), `${kind} seed ${seed} wedged after ${guard} steps`)
    const batch = drivers[kind](state, { difficulty: 'average' })
    if (batch) {
      state = batch.reduce(
        (current, event) =>
          kind === 'blackjack'
            ? blackjack.reduce(current as BlackjackState, event as blackjack.BlackjackEvent)
            : goFish.reduce(current as GoFishState, event as goFish.GoFishEvent),
        state,
      )
      continue
    }
    turns++
    if (kind === 'blackjack') {
      const board = state as BlackjackState
      const action = blackjack.handValue(board.hands.player).total < blackjack.dealerStands ? 'hit' : 'stand'
      state = blackjack.resolveAction(board, action).reduce(blackjack.reduce, board)
    } else {
      const board = state as GoFishState
      const rank = goFish.legalAsks(board, 'player')[0]
      state = goFish.resolveAsk(board, 'player', rank).reduce(goFish.reduce, board)
    }
  }
  return { state, turns }
}

// --- neither game can strand itself, for any of forty seeds ---------------
{
  for (const kind of ['goFish', 'blackjack'] as GameKind[]) {
    for (let seed = 0; seed < 40; seed++) {
      const { state, turns } = play(kind, seed)
      assert.ok(state.over, `${kind} seed ${seed} never ended`)
      assert.ok(turns > 0, `${kind} seed ${seed} never asked the player anything`)
    }
  }
}

// --- the driver is silent exactly when the player is being waited on ------
{
  // Blackjack opens with no cards on the table: the driver deals rather than asking.
  const fresh = blackjack.initialState(3)
  assert.ok(drivers.blackjack(fresh, {}), 'a fresh shoe has to deal itself')
  const dealt = blackjack.dealRound(fresh).reduce(blackjack.reduce, fresh)
  if (dealt.turn === 'player') assert.strictEqual(drivers.blackjack(dealt, {}), null)

  // Go Fish deals in `initialState` and the player asks first. Nothing to drive.
  const start = goFish.initialState(3)
  assert.strictEqual(start.turn, 'player')
  assert.strictEqual(drivers.goFish(start, {}), null)
  const theirs: GoFishState = { ...start, turn: 'char' }
  assert.ok(drivers.goFish(theirs, {}), 'the character has to move on their own turn')
  assert.strictEqual(drivers.goFish({ ...theirs, over: true }, {}), null)
  // An empty hand is not a move, whatever the turn says.
  assert.strictEqual(drivers.goFish({ ...theirs, hands: { ...theirs.hands, char: [] } }, {}), null)
}

// --- difficulty reaches the character's choice ----------------------------
{
  const board: GoFishState = { ...goFish.initialState(11), turn: 'char' }
  const best = drivers.goFish(board, { difficulty: 'best' })
  const worst = drivers.goFish(board, { difficulty: 'worst' })
  assert.ok(best && worst)
  assert.strictEqual(best[0].kind, 'ask')
  // Not a rule, just this seed: the fixture is only useful while the two differ.
  assert.notDeepStrictEqual(best[0], worst[0], 'seed 11 stopped separating best from worst')
}

console.log('ok')
