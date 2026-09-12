// Natural-language input, text-adventure style: "got any sevens", "any 3s?", "queens".
// Returns null on anything it cannot read, including a rank the player does not hold. The caller
// shows the toast and logs nothing.

import type { Rank } from './deck.ts'

/** Rank spellings. Single letters live in `letters` below, not here: "got a jack?" must not read
 *  as an ace and a jack at once. */
const words: [string, Rank][] = [
  ['aces', 'A'], ['ace', 'A'],
  ['twos', '2'], ['two', '2'], ['deuces', '2'], ['2', '2'],
  ['threes', '3'], ['three', '3'], ['3', '3'],
  ['fours', '4'], ['four', '4'], ['4', '4'],
  ['fives', '5'], ['five', '5'], ['5', '5'],
  ['sixes', '6'], ['six', '6'], ['6', '6'],
  ['sevens', '7'], ['seven', '7'], ['7', '7'],
  ['eights', '8'], ['eight', '8'], ['8', '8'],
  ['nines', '9'], ['nine', '9'], ['9', '9'],
  ['tens', '10'], ['ten', '10'], ['10', '10'],
  ['jacks', 'J'], ['jack', 'J'],
  ['queens', 'Q'], ['queen', 'Q'],
  ['kings', 'K'], ['king', 'K'],
]

/** The one-letter shorthands. Read only when the spelled-out pass found nothing, and only from a
 *  token that is the letter alone. */
const letters: [string, Rank][] = [['a', 'A'], ['j', 'J'], ['q', 'Q'], ['k', 'K']]

/**
 * Read an ask out of free text. `legal` is the ranks the player holds: a rank outside it reads as
 * no move at all. Asking for what you do not hold is not a legal move rather than a different one.
 */
export function parseAsk(text: string, legal: Rank[]): Rank | null {
  // Tokenise on anything that is not a letter or digit: "any 3s?" and "3's" both split cleanly.
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const found = collect(tokens, words)
  // Two ranks in one line is ambiguous, not a move. "any threes or fours" gets a toast.
  const ranksFound = found.length ? found : collect(tokens, letters)
  if (ranksFound.length !== 1) return null
  return legal.includes(ranksFound[0]) ? ranksFound[0] : null
}

/** Blackjack's two decisions, and the words people reach for. */
const actionWords: [string, 'hit' | 'stand'][] = [
  ['hit', 'hit'], ['hits', 'hit'], ['twist', 'hit'], ['card', 'hit'], ['another', 'hit'],
  ['more', 'hit'], ['draw', 'hit'], ['deal', 'hit'], ['yes', 'hit'], ['please', 'hit'],
  ['stand', 'stand'], ['stands', 'stand'], ['stick', 'stand'], ['stay', 'stand'], ['hold', 'stand'],
  ['done', 'stand'], ['pass', 'stand'], ['enough', 'stand'], ['no', 'stand'], ['stop', 'stand'],
]

/**
 * Read a Blackjack decision out of free text. Two different decisions in one line is not a move,
 * the same way two ranks is not an ask.
 */
export function parseAction(text: string): 'hit' | 'stand' | null {
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const found: ('hit' | 'stand')[] = []
  for (const token of tokens) {
    const match = actionWords.find(([word]) => word === token)
    if (match && !found.includes(match[1])) found.push(match[1])
  }
  return found.length === 1 ? found[0] : null
}

function collect(tokens: string[], table: [string, Rank][]): Rank[] {
  const found: Rank[] = []
  for (const token of tokens) {
    // "3s" reduces to "3" by dropping a trailing s when the stem hits.
    const match = table.find(([word]) => word === token) ?? table.find(([word]) => word + 's' === token)
    if (match && !found.includes(match[1])) found.push(match[1])
  }
  return found
}
