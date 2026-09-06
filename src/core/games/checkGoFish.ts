// Run: node --experimental-strip-types src/core/games/checkGoFish.ts
import assert from 'node:assert'
import type { Card, Rank, Suit } from './deck.ts'
import { ranks } from './deck.ts'
import type { GoFishEvent, GoFishState, Side } from './goFish.ts'
import {
  chooseMove, initialState, isOver, legalAsks, reduce, replay, resolveAsk, winner,
} from './goFish.ts'
import { buildStateBlock, describeEvent } from './gameState.ts'

/** "7H 7S" -> two cards. Suits only matter for making four of a kind reachable. */
function hand(spec: string): Card[] {
  return spec.split(/\s+/).filter(Boolean).map((token) => ({
    rank: token.slice(0, -1) as Rank,
    suit: token.slice(-1) as Suit,
  }))
}

function state(patch: Partial<GoFishState>): GoFishState {
  return {
    deck: [],
    hands: { player: [], char: [] },
    books: { player: [], char: [] },
    asked: { player: [], char: [] },
    known: { player: [], char: [] },
    turn: 'player',
    over: false,
    ...patch,
  }
}

// --- the deal -------------------------------------------------------------
{
  const start = initialState(99)
  assert.strictEqual(start.deck.length + start.hands.player.length + start.hands.char.length + start.books.player.length * 4 + start.books.char.length * 4, 52)
  assert.strictEqual(start.turn, 'player')
  assert.strictEqual(start.over, false)
  // Five and five, unless a four of a kind was dealt and booked on the spot.
  for (const side of ['player', 'char'] as Side[]) {
    assert.strictEqual(start.hands[side].length + start.books[side].length * 4, 5)
  }
  assert.deepStrictEqual(initialState(99), initialState(99), 'the same seed dealt differently')
}

// --- a book of four is removed and scored ---------------------------------
{
  const before = state({
    turn: 'char',
    hands: { player: hand('7D'), char: hand('7H 7S 7C 2D') },
    deck: hand('9H'),
  })
  const events = resolveAsk(before, 'char', '7')
  const after = events.reduce(reduce, before)
  assert.ok(events.some((e) => e.kind === 'book' && e.by === 'char' && e.rank === '7'), 'no book event')
  assert.deepStrictEqual(after.books.char, ['7'])
  assert.strictEqual(after.hands.char.filter((c) => c.rank === '7').length, 0, 'booked cards stayed in hand')
  // The player was emptied by handing the card over, so they drew.
  assert.strictEqual(after.hands.player.length, 1)
}

// --- a hit keeps your turn, a miss passes it ------------------------------
{
  const hit = state({ turn: 'player', hands: { player: hand('3H'), char: hand('3S 8D') }, deck: hand('QH 2C') })
  assert.strictEqual(resolveAsk(hit, 'player', '3').reduce(reduce, hit).turn, 'player')

  const miss = state({ turn: 'player', hands: { player: hand('3H'), char: hand('8D') }, deck: hand('QH 2C') })
  const after = resolveAsk(miss, 'player', '3').reduce(reduce, miss)
  assert.strictEqual(after.turn, 'char')
  assert.strictEqual(after.hands.player.length, 2, 'the miss did not draw')
  assert.strictEqual(after.deck.length, 1)
}

// --- fishing the exact rank you asked for keeps the turn ------------------
{
  const before = state({ turn: 'player', hands: { player: hand('3H'), char: hand('8D') }, deck: hand('3C QH') })
  const after = resolveAsk(before, 'player', '3').reduce(reduce, before)
  assert.strictEqual(after.turn, 'player', 'fishing the asked rank should keep the turn')
  assert.strictEqual(after.hands.player.length, 2)
}

// --- you may only ask for what you hold -----------------------------------
{
  const board = state({ hands: { player: hand('3H 7D 7S'), char: hand('KC') } })
  assert.deepStrictEqual(legalAsks(board, 'player'), ['3', '7'])
  assert.deepStrictEqual(legalAsks(board, 'char'), ['K'])
  assert.deepStrictEqual(legalAsks(state({}), 'player'), [])
}

// --- the empty hand draws, and the deal runs out --------------------------
{
  // Deck spent and a hand empty: nothing more can happen, so the game ends.
  const before = state({ turn: 'char', hands: { player: hand('3H'), char: hand('3S') }, deck: [] })
  const events = resolveAsk(before, 'char', '3')
  const after = events.reduce(reduce, before)
  assert.strictEqual(after.hands.player.length, 0)
  assert.ok(isOver(after), 'an empty hand with an empty deck should end the game')
  assert.ok(events.some((e) => e.kind === 'end'), 'no end event')
  assert.strictEqual(after.over, true)
}

// --- what the player typed rides along, unrewritten -----------------------
{
  const before = state({ turn: 'player', hands: { player: hand('3H'), char: hand('3S 8D') }, deck: hand('QH') })
  const typed = "got any threes, you're not fooling anyone"
  const events = resolveAsk(before, 'player', '3', typed)
  const ask = events.find((e) => e.kind === 'ask')!
  assert.strictEqual(ask.kind === 'ask' && ask.text, typed, 'the typed text was dropped')
  // The rules read `rank` alone, so carrying the words changes nothing about the outcome.
  const withText = events.reduce(reduce, before)
  const withoutText = resolveAsk(before, 'player', '3').reduce(reduce, before)
  assert.deepStrictEqual(withText.hands, withoutText.hands)
  assert.deepStrictEqual(withText.books, withoutText.books)
  assert.strictEqual(withText.turn, withoutText.turn)
  // The character's asks are chosen by code and nobody typed them.
  const theirs = resolveAsk(state({ turn: 'char', hands: { player: hand('9D'), char: hand('9H') } }), 'char', '9')
  const theirAsk = theirs.find((e) => e.kind === 'ask')!
  assert.strictEqual(theirAsk.kind === 'ask' && theirAsk.text, undefined)
}

// --- reduce never mutates -------------------------------------------------
{
  const before = state({ hands: { player: hand('3H'), char: hand('3S') }, deck: hand('9H') })
  const snapshot = JSON.stringify(before)
  reduce(before, { kind: 'give', from: 'char', to: 'player', rank: '3', count: 1 })
  reduce(before, { kind: 'draw', by: 'player', rank: '9' })
  assert.strictEqual(JSON.stringify(before), snapshot, 'reduce mutated its input')
}

// --- a say event changes nothing -----------------------------------------
{
  const before = initialState(4)
  assert.deepStrictEqual(reduce(before, { kind: 'say', by: 'char', text: 'go fish' }), before)
}

// --- replay equals stepping, and a whole game terminates ------------------
{
  const seed = 2024
  const log: GoFishEvent[] = []
  let current = initialState(seed)
  let guard = 0
  while (!current.over && guard++ < 500) {
    const side = current.turn
    const rank = chooseMove(current, side, side === 'player' ? 'best' : 'average')
    assert.ok(rank, 'the side to move held nothing')
    const events = resolveAsk(current, side, rank)
    log.push(...events)
    current = events.reduce(reduce, current)
    log.push({ kind: 'say', by: 'char', text: describeEvent(events) })
  }
  assert.ok(current.over, 'the game never ended')
  assert.ok(log.length > 10)
  assert.deepStrictEqual(replay(seed, log), current, 'replay diverged from stepping')
  assert.deepStrictEqual(replay(seed, log, 0), initialState(seed))
  // Scrubbing to any point in the log is the same as having stepped there.
  for (const upTo of [1, 5, Math.floor(log.length / 2), log.length]) {
    assert.deepStrictEqual(replay(seed, log, upTo), log.slice(0, upTo).reduce(reduce, initialState(seed)))
  }
  // No card is ever created or lost.
  const accounted = current.deck.length + current.hands.player.length + current.hands.char.length +
    (current.books.player.length + current.books.char.length) * 4
  assert.strictEqual(accounted, 52, 'cards went missing')
  const champion = winner(current)
  assert.ok(champion === null || champion === 'player' || champion === 'char')
}

// --- fifty seeds all reach an end ----------------------------------------
{
  for (let seed = 0; seed < 50; seed++) {
    let current = initialState(seed)
    let guard = 0
    while (!current.over && guard++ < 500) {
      const rank = chooseMove(current, current.turn, 'best')
      assert.ok(rank, `seed ${seed}: the side to move held nothing`)
      const side = current.turn
      const previous = current.asked[side][current.asked[side].length - 1]
      // A rank asked twice running only makes sense when the first ask was answered, since a
      // failed ask proves the other side is empty of it. Repeating past that is the stuck opponent.
      // Unless it is the only rank in hand, in which case there is nothing else to ask.
      if (previous === rank && legalAsks(current, side).length > 1) {
        assert.ok(
          current.known[side].includes(rank),
          `seed ${seed}: ${side} re-asked ${rank} with no reason to think it is there`,
        )
      }
      current = resolveAsk(current, side, rank).reduce(reduce, current)
    }
    assert.ok(current.over, `seed ${seed} never ended`)
  }
}

// --- chooseMove ----------------------------------------------------------
{
  const board = state({
    hands: { player: hand('3H 7D 7S 9C'), char: hand('KC') },
    asked: { player: [], char: ['9'] },
    known: { player: ['9'], char: [] },
  })
  // The character asked for nines, so it held one: best play is to take them back.
  assert.strictEqual(chooseMove(board, 'player', 'best'), '9')
  // Once that ask has come back empty the read is spent, so it must not be asked again.
  const spent = state({
    hands: { player: hand('3H 7D 7S 9C'), char: hand('KC') },
    asked: { player: ['9'], char: ['9'] },
  })
  assert.notStrictEqual(chooseMove(spent, 'player', 'best'), '9')
  // Nothing known: ask where you hold the most.
  const blind = state({ hands: { player: hand('3H 7D 7S'), char: hand('KC') } })
  assert.strictEqual(chooseMove(blind, 'player', 'best'), '7')
  assert.strictEqual(chooseMove(blind, 'player', 'worst'), '3')
  assert.ok(legalAsks(blind, 'player').includes(chooseMove(blind, 'player', 'average')!))
  assert.strictEqual(chooseMove(state({}), 'player', 'best'), null)
}

// --- what the model is handed --------------------------------------------
{
  const board = state({
    turn: 'char',
    hands: { player: hand('2H'), char: hand('3H 3S 7D KC') },
    books: { player: ['2'], char: ['9'] },
    deck: hand('4H 5S'),
  })
  const block = buildStateBlock(board)
  assert.ok(block.startsWith('<gameState>\n') && block.endsWith('\n</gameState>'), block)
  assert.ok(block.includes('You are playing Go Fish.'), 'the block has to name the game')
  assert.ok(block.includes('Your hand: 3, 3, 7, K'), block)
  assert.ok(block.includes('Your books: 9'), block)
  assert.ok(block.includes('Their books: 2'), block)
  assert.ok(block.includes('Cards left in the deck: 2'), block)
  assert.ok(block.includes('Your turn.'), block)
  // No rank suggestion may reach the model: the only ask it sees is the one the code already made.
  assert.ok(!block.includes('would be'), block)
  // The player's hand is never in the block: the character cannot see it.
  assert.ok(!block.includes('2H'), block)

  assert.strictEqual(buildStateBlock(board, { tag: '' }).startsWith('You are playing Go Fish.'), true)

  // The block is built after the move landed, so cards handed over are already out of the hand.
  // Without `before` the character reads its own hand and denies holding what it just gave away.
  const after = state({
    turn: 'player',
    hands: { player: hand('2H'), char: hand('7D KC 5S') },
    books: { player: ['2'], char: ['9'] },
    deck: hand('4H'),
  })
  const moved = buildStateBlock(after, { before: board })
  assert.ok(moved.includes('Your hand: 5, 7, K'), moved)
  assert.ok(moved.includes('You held 3, 3 a moment ago and no longer do.'), moved)
  assert.ok(moved.includes('You just picked up 5.'), moved)
  // Nothing changed hands: neither line appears.
  const still = buildStateBlock(board, { before: board })
  assert.ok(!still.includes('a moment ago') && !still.includes('picked up'), still)

  const line = describeEvent([
    { kind: 'ask', by: 'player', rank: '7' },
    { kind: 'draw', by: 'player', rank: 'K' },
    { kind: 'turn', to: 'char' },
  ])
  assert.strictEqual(line, 'They asked you for sevens. They drew from the deck. It is your turn.')
  // A card the player drew is face down, so its rank must not leak into the line.
  assert.ok(!line.includes('K'))
  assert.strictEqual(
    describeEvent([{ kind: 'give', from: 'player', to: 'char', rank: '7', count: 2 }]),
    'They handed you 2 sevens.',
  )
  // The board's log reads from the player's side, so the same events flip.
  const fromPlayer = describeEvent(
    [{ kind: 'ask', by: 'player', rank: '7' }, { kind: 'draw', by: 'player', rank: 'K' }, { kind: 'turn', to: 'char' }],
    'player',
  )
  assert.strictEqual(fromPlayer, 'You asked them for sevens. You drew a K. It is their turn.')
}

// --- ranks are the thirteen we think they are ----------------------------
assert.strictEqual(ranks.length, 13)

console.log('ok')
