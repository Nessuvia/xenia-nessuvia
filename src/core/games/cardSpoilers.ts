// Extension-ful imports on purpose: checkCardSpoilers runs this under node --experimental-strip-types.
import { sentences } from '../quality/sentences.ts'
import { rankPlural, type Rank } from './deck.ts'
import type { GoFishState } from './goFish.ts'
import type { BlackjackState } from './blackjack.ts'

const singular: Record<Rank, string> = {
  A: 'ace', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven',
  '8': 'eight', '9': 'nine', '10': 'ten', J: 'jack', Q: 'queen', K: 'king',
}

const suit = String.raw`(?:of\s+(?:hearts|spades|diamonds|clubs)\b|[♠♥♦♣])`
const lead = String.raw`(?:a|an|the|another|my|one|two|three|four|pair\s+of)`

/**
 * Card phrasing for one rank: "a seven", "the 7 of hearts", "sevens", "7♥", "7s". A lone number
 * ("seven years ago") is let through on purpose. ponytail: "she's a queen" still matches; a
 * tagger pass is the upgrade if false hits annoy.
 */
function rankPattern(rank: Rank): RegExp {
  const word = singular[rank]
  const names = /\d/.test(rank) ? `(?:${word}|${rank})` : word
  const plural = `(?:${rankPlural(rank)}|${/\d/.test(rank) ? `${rank}'?s` : `${word}s`})`
  return new RegExp(
    String.raw`\b(?:${lead}\s+${names}\b|${plural}\b|${names}\s*${suit})`,
    'i',
  )
}

/** A lone rank ("second six") counts only beside one of these: a sentence about the cards. */
const cardWord = /\b(?:cards?|pairs?|hand|drew|draws?|drawing|drawn|deck|pile|dealt|deals?|hits?|books?|fish(?:ed)?)\b/i

function lonePattern(rank: Rank): RegExp {
  const word = singular[rank]
  return new RegExp(String.raw`\b(?:${/\d/.test(rank) ? `${word}|${rank}` : word})\b`, 'i')
}

/** Offsets of the sentences in `text` that name one of the secret ranks. */
export function spoilerRanges(text: string, secret: Rank[]): { start: number; end: number }[] {
  if (!secret.length) return []
  const unique = [...new Set(secret)]
  const phrased = unique.map(rankPattern)
  const lone = unique.map(lonePattern)
  return sentences(text)
    .filter((s) => phrased.some((p) => p.test(s.text)) || (cardWord.test(s.text) && lone.some((p) => p.test(s.text))))
    .map(({ start, end }) => ({ start, end }))
}

/**
 * Ranks the player can't see. Blackjack: the hole card while it's down. Go Fish: the character's
 * hand, minus ranks the player already knows they hold (an ask shows one), plus whatever they last
 * drew.
 */
export function secretRanks(state: GoFishState | BlackjackState): Rank[] {
  if ('books' in state) {
    const held = state.hands.char.map((c) => c.rank)
    const hidden = held.filter((r) => !state.known.player.includes(r))
    // A draw is hidden even of a known rank: "that's three sevens now" tells the player a count.
    return state.drawn && held.includes(state.drawn) ? [...hidden, state.drawn] : hidden
  }
  return state.holeDown && state.hands.char[1] ? [state.hands.char[1].rank] : []
}
