// Who the two sides of a table are called, for one reader.
//
// Every line a game writes is second person: the prompt is written to the character, the log on the
// board is written to the player. That left the other side as "they". In a game where the
// character is the dealer and the player is the persona, "they" is two people, and the model picks
// one. Naming the far side fixes it. The near side stays "you".

export type Side = 'player' | 'char'

/** The names of the two sides. Either may be missing; the pronoun is the fallback. */
export interface SideNames {
  player?: string
  char?: string
}

export interface Naming {
  /** Whether a side is the reader's own. */
  mine(side: Side): boolean
  /** Sentence subject for the far side: "Ivy drew a K." */
  they: string
  /** Object for the far side: "You asked Ivy for sevens." */
  them: string
  /** Possessive for the far side, mid-sentence: "It is Ivy's turn." */
  theirs: string
  /** The same possessive at the start of a line: "Ivy's hand: ..." */
  Theirs: string
}

export function naming(you: Side, names: SideNames = {}): Naming {
  const far = you === 'char' ? 'player' : 'char'
  const name = names[far]?.trim()
  return {
    mine: (side) => side === you,
    they: name || 'They',
    them: name || 'them',
    theirs: name ? `${name}'s` : 'their',
    Theirs: name ? `${name}'s` : 'Their',
  }
}
