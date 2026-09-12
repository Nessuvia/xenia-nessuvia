// Run: node --experimental-strip-types src/core/games/checkBlackjack.ts
import assert from 'node:assert'
import type { Card, Rank, Suit } from './deck.ts'
import type { BlackjackEvent, BlackjackState } from './blackjack.ts'
import { buildStateBlock, describeEvent } from './blackjackState.ts'
import {
  dealRound, dealerStands, handValue, initialState, isBlackjack, isBust, legalActions, nextEvents,
  reduce, replay, resolveAction, roundOutcome, shoeFloor, visibleHand, winner,
} from './blackjack.ts'

/** The table playing itself out to the end of the round in hand: what the store's driver loop does,
 *  stopped at the settle. The next deal must not overwrite what is being asserted. */
function runOut(start: BlackjackState): { events: BlackjackEvent[]; state: BlackjackState } {
  const events: BlackjackEvent[] = []
  let current = start
  let guard = 0
  while (guard++ < 400) {
    const batch = nextEvents(current)
    if (!batch) break
    events.push(...batch)
    current = batch.reduce(reduce, current)
    if (batch.some((e) => e.kind === 'settle')) break
  }
  return { events, state: current }
}

function hand(spec: string): Card[] {
  return spec.split(/\s+/).filter(Boolean).map((token) => ({
    rank: token.slice(0, -1) as Rank,
    suit: token.slice(-1) as Suit,
  }))
}

function state(patch: Partial<BlackjackState>): BlackjackState {
  return {
    deck: [],
    hands: { player: [], char: [] },
    holeDown: true,
    score: { player: 0, char: 0 },
    turn: 'player',
    round: 0,
    outcome: null,
    over: false,
    ...patch,
  }
}

// --- counting a hand ------------------------------------------------------
{
  assert.strictEqual(handValue(hand('KS 9H')).total, 19)
  assert.strictEqual(handValue(hand('KS QH JS')).total, 30)
  assert.strictEqual(handValue(hand('AS')).total, 11)
  assert.strictEqual(handValue(hand('AS AH')).total, 12, 'two aces is 12, not 22')
  assert.strictEqual(handValue(hand('AS KH')).total, 21)
  // Every ace drops to one only as far as it has to.
  assert.strictEqual(handValue(hand('AS AH 9D')).total, 21)
  assert.strictEqual(handValue(hand('AS 5H 9D')).total, 15)
  assert.strictEqual(handValue(hand('AS 5H 9D KC')).total, 25)
  assert.strictEqual(handValue(hand('2S 3H')).total, 5)
  assert.strictEqual(handValue([]).total, 0)

  assert.strictEqual(handValue(hand('AS 6H')).soft, true)
  assert.strictEqual(handValue(hand('AS 6H KD')).soft, false, 'an ace forced to one is not soft')

  assert.ok(isBlackjack(hand('AS KH')))
  assert.ok(!isBlackjack(hand('KS 6H 5D')), 'three-card 21 is not blackjack')
  assert.ok(!isBlackjack(hand('KS 9H')))
  assert.ok(isBust(hand('KS QH 5D')))
  assert.ok(!isBust(hand('KS QH AD')), 'the ace drops to one rather than busting')
}

// --- the deal -------------------------------------------------------------
{
  const start = initialState(7)
  assert.strictEqual(start.deck.length, 52)
  assert.strictEqual(start.turn, null, 'nobody acts before the cards are out')
  assert.deepStrictEqual(initialState(7), initialState(7))

  const events = dealRound(start)
  const after = events.reduce(reduce, start)
  assert.strictEqual(after.hands.player.length, 2)
  assert.strictEqual(after.hands.char.length, 2)
  assert.strictEqual(after.deck.length, 48)
  // The hole card is face down until the dealer plays, and it is not in what you can see.
  if (after.turn === 'player') {
    assert.strictEqual(after.holeDown, true)
    assert.strictEqual(visibleHand(after).length, 1)
  }
  assert.strictEqual(visibleHand({ ...after, holeDown: false }).length, 2)
}

// --- a natural settles without asking anyone anything ---------------------
{
  // Player is dealt A K (cards 0 and 2), dealer 9 5 (cards 1 and 3).
  const start = state({ deck: hand('AS 9H KD 5C 7S 8H 2D 3C 4S 6H JD QC KH AC 2S 3H 4D'), turn: null })
  const events = dealRound(start)
  const after = events.reduce(reduce, start)
  assert.ok(isBlackjack(after.hands.player), 'the fixture did not deal a natural')
  assert.ok(events.some((e) => e.kind === 'settle'), 'a natural should settle on the spot')
  assert.strictEqual(after.outcome, 'player')
  assert.strictEqual(after.score.player, 1)
  assert.strictEqual(after.turn, null)
  assert.strictEqual(after.holeDown, false, 'settling turns the hole card over')
  assert.deepStrictEqual(legalActions(after), [], 'no decision is open once a round has settled')
}

// --- hitting, and busting -------------------------------------------------
{
  const board = state({ hands: { player: hand('KS 6H'), char: hand('9D 7C') }, deck: hand('QH 5S 8D 2C 3H 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  assert.deepStrictEqual(legalActions(board), ['hit', 'stand'])

  const events = resolveAction(board, 'hit')
  const busted = events.reduce(reduce, board)
  assert.ok(events.some((e) => e.kind === 'bust' && e.by === 'player'), 'K 6 Q should bust')
  assert.strictEqual(busted.turn, 'char', 'a bust hands the table over rather than ending there')
  assert.ok(!events.some((e) => e.kind === 'settle'), 'resolveAction settles nothing itself')

  const run = runOut(busted)
  assert.strictEqual(run.state.outcome, 'char')
  assert.strictEqual(run.state.score.char, 1)
  // A busted player does not make the dealer draw: nothing left to beat.
  assert.strictEqual(run.state.hands.char.length, 2)
  assert.ok(run.events.some((e) => e.kind === 'reveal'))
}

// --- a hit that does not bust leaves the decision open --------------------
{
  const board = state({ hands: { player: hand('5S 6H'), char: hand('9D 7C') }, deck: hand('3H 5S 8D 2C 3D 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  const after = resolveAction(board, 'hit').reduce(reduce, board)
  assert.strictEqual(after.turn, 'player', 'still your hand')
  assert.strictEqual(handValue(after.hands.player).total, 14)
  assert.strictEqual(after.outcome, null, 'nothing settled')
}

// --- twenty-one needs no decision -----------------------------------------
// This is the table that used to wedge: hitting to 21 left the turn with a player who had no legal
// action. Nothing else could move.
{
  const board = state({ hands: { player: hand('5S 6H'), char: hand('9D 7C') }, deck: hand('QH 5S 8D 2C 3D 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  const events = resolveAction(board, 'hit')
  const stood = events.reduce(reduce, board)
  assert.strictEqual(handValue(stood.hands.player).total, 21)
  assert.ok(events.some((e) => e.kind === 'stand' && e.by === 'player'), '21 is stood, not asked about')
  assert.strictEqual(stood.turn, 'char', 'the table is never left waiting on a hand of 21')
  assert.ok(nextEvents(stood), 'the driver has to have something to do here')
  assert.strictEqual(runOut(stood).state.turn, null)
}

// --- a settled round opens the next one, and nothing else does -------------
{
  const settled = state({ turn: null, deck: hand('AS 9H KD 5C 7S 8H 2D 3C 4S 6H JD QC KH AC 2S 3H 4D 5S 6D') })
  const batch = nextEvents(settled)
  assert.ok(batch?.some((e) => e.kind === 'deal'), 'a table waiting on nobody deals the next round')
  // A natural settles inside the deal, and the driver picks it straight back up: this is the hand
  // that used to sit there forever. Only a player action ever opened a round.
  const after = batch!.reduce(reduce, settled)
  assert.ok(isBlackjack(after.hands.player), 'the fixture did not deal a natural')
  assert.strictEqual(after.turn, null)
  assert.ok(nextEvents(after), 'the driver has to pick a settled natural back up')

  assert.strictEqual(nextEvents(state({ turn: 'player' })), null, 'the player is being waited on')
  assert.strictEqual(nextEvents(state({ turn: null, over: true })), null, 'a finished game moves')
}

// --- standing hands the table over, and the dealer plays to 17 ------------
{
  const board = state({ hands: { player: hand('KS 8H'), char: hand('9D 5C') }, deck: hand('2H 3S 8D 2C 3D 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  const stood = resolveAction(board, 'stand')
  assert.deepStrictEqual(stood, [{ kind: 'stand', by: 'player' }], 'standing decides one thing')
  const run = runOut(stood.reduce(reduce, board))
  const events = run.events
  const after = run.state
  assert.ok(events.some((e) => e.kind === 'reveal'))
  // 14, hit to 16, hit to 19, stop.
  assert.ok(handValue(after.hands.char).total >= dealerStands, 'the dealer stopped short of 17')
  assert.ok(!isBust(after.hands.char))
  assert.ok(events.some((e) => e.kind === 'stand' && e.by === 'char'))
  // Player stood on 18; the dealer drew 14, 16, 19 and took it.
  assert.strictEqual(handValue(after.hands.char).total, 19)
  assert.strictEqual(after.outcome, 'char')
}

// --- the dealer can bust too ----------------------------------------------
{
  const board = state({ hands: { player: hand('KS 8H'), char: hand('9D 6C') }, deck: hand('KH 3S 8D 2C 3D 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  const after = runOut(resolveAction(board, 'stand').reduce(reduce, board)).state
  assert.ok(isBust(after.hands.char), '9 6 K should bust the dealer')
  assert.strictEqual(after.outcome, 'player')
  assert.strictEqual(after.score.player, 1)
}

// --- who took the round ---------------------------------------------------
{
  const at = (player: string, char: string) => roundOutcome(state({ hands: { player: hand(player), char: hand(char) } }))
  assert.strictEqual(at('KS 9H', 'KD 8C'), 'player')
  assert.strictEqual(at('KS 7H', 'KD 8C'), 'char')
  assert.strictEqual(at('KS 9H', 'KD 9C'), 'push')
  assert.strictEqual(at('KS QH 5D', 'KD 8C'), 'char', 'a bust loses even against a low dealer')
  assert.strictEqual(at('KS 9H', 'KD QC 5S'), 'player', 'a dealer bust wins it')
  assert.strictEqual(at('AS KH', 'KD 6C 5S'), 'player', 'blackjack beats a three-card 21')
  assert.strictEqual(at('AS KH', 'AD QC'), 'push', 'two naturals push')
}

// --- reduce never mutates -------------------------------------------------
{
  const board = state({ hands: { player: hand('5S 6H'), char: hand('9D 7C') }, deck: hand('3H 5S') })
  const snapshot = JSON.stringify(board)
  reduce(board, { kind: 'hit', by: 'player', rank: '3' })
  reduce(board, { kind: 'settle', outcome: 'player' })
  assert.strictEqual(JSON.stringify(board), snapshot, 'reduce mutated its input')
  assert.deepStrictEqual(reduce(board, { kind: 'say', by: 'char', text: 'hm' }), board)
}

// --- a whole game plays out, and replay equals stepping -------------------
{
  const seed = 88
  const log: BlackjackEvent[] = []
  let current = initialState(seed)
  let guard = 0
  const step = (events: BlackjackEvent[]) => {
    log.push(...events)
    current = events.reduce(reduce, current)
  }
  while (!current.over && guard++ < 400) {
    const batch = nextEvents(current)
    // Basic strategy, near enough: draw under 17.
    step(batch ?? resolveAction(current, handValue(current.hands.player).total < dealerStands ? 'hit' : 'stand'))
  }
  assert.ok(current.over, 'the game never ended')
  assert.ok(current.round > 1, 'only one round was played')
  assert.ok(current.deck.length < shoeFloor, 'the game ended with a full shoe')
  assert.strictEqual(current.score.player + current.score.char <= current.round, true)
  assert.deepStrictEqual(replay(seed, log), current, 'replay diverged from stepping')
  assert.deepStrictEqual(replay(seed, log, 0), initialState(seed))
  for (const upTo of [1, 4, Math.floor(log.length / 2), log.length]) {
    assert.deepStrictEqual(replay(seed, log, upTo), log.slice(0, upTo).reduce(reduce, initialState(seed)))
  }
  const champion = winner(current)
  assert.ok(champion === null || champion === 'player' || champion === 'char')
}

// --- forty seeds all terminate --------------------------------------------
{
  for (let seed = 0; seed < 40; seed++) {
    let current = initialState(seed)
    let guard = 0
    while (!current.over && guard++ < 400) {
      const batch =
        nextEvents(current) ??
        resolveAction(current, handValue(current.hands.player).total < dealerStands ? 'hit' : 'stand')
      current = batch.reduce(reduce, current)
    }
    assert.ok(current.over, `seed ${seed} never ended`)
    // No card is ever created: dealt hands plus what is left has to account for the shoe.
    assert.ok(current.deck.length >= 0 && current.deck.length < shoeFloor)
  }
}

// --- the state block says the reading, not just the total ----------------
{
  // A bust is a word in the block. Left as `(24)` the model had to compare it to 21 itself.
  // The round it got wrong was the one where it told the player they had gone bust.
  const busted = buildStateBlock(state({ hands: { player: hand('KS 9H 5D'), char: hand('7S 8H') }, turn: 'char' }))
  assert.ok(busted.includes('Their hand: K, 9, 5 (24, bust)'), busted)
  assert.ok(!busted.includes('Your hand: 7, 8 (15, bust)'), busted)

  const natural = buildStateBlock(state({ hands: { player: hand('AS KH'), char: hand('7S 8H') } }))
  assert.ok(natural.includes('(soft 21, blackjack)'), natural)

  // Between rounds the hands on the table are the settled round's, and the block says so.
  const settled = state({
    hands: { player: hand('KS 9H 5D'), char: hand('7S 8H') },
    holeDown: false,
    turn: null,
    round: 2,
    outcome: 'char',
    score: { player: 1, char: 2 },
  })
  const after = buildStateBlock(settled)
  assert.ok(after.includes('Round 2.'), after)
  assert.ok(after.includes('You took the last round, the other hand went bust.'), after)

  // Mid-round there is no result to report and the round is the one being played.
  const live = buildStateBlock(state({ hands: { player: hand('KS 9H'), char: hand('7S 8H') }, round: 2 }))
  assert.ok(live.includes('Round 3.'), live)
  assert.ok(!live.includes('last round'), live)
}

// --- the far side is named, the near side is 'you' ------------------------
{
  const names = { player: 'Ivy', char: 'Damien' }
  const settled = state({
    hands: { player: hand('KS 9H 5D'), char: hand('7S 8H') },
    holeDown: false,
    turn: null,
    round: 1,
    outcome: 'char',
  })
  const block = buildStateBlock(settled, { names })
  assert.ok(block.includes("Ivy's hand: K, 9, 5 (24, bust)"), block)
  assert.ok(block.includes('Rounds won: you 0, Ivy 0'), block)
  assert.ok(block.includes('Ivy took the last round') === false, block)
  assert.ok(block.includes('You took the last round, the other hand went bust.'), block)
  assert.ok(!block.includes('Their'), block)

  const events: BlackjackEvent[] = [
    { kind: 'hit', by: 'player', rank: '5' },
    { kind: 'bust', by: 'player' },
  ]
  // To the character: they are 'you', the player is named.
  assert.strictEqual(describeEvent(events, 'char', names), 'Ivy drew a 5. Ivy went bust.')
  // To the player, in the log: the same events from the other seat.
  assert.strictEqual(describeEvent(events, 'player', names), 'You drew a 5. You went bust.')
  assert.strictEqual(
    describeEvent([{ kind: 'reveal' }, { kind: 'settle', outcome: 'char' }], 'player', names),
    'Damien turned the hole card over. Damien took the round.',
  )
  // No names is the pronoun the boards used before, unchanged.
  assert.strictEqual(describeEvent(events, 'char'), 'They drew a 5. They went bust.')
}

console.log('ok')
