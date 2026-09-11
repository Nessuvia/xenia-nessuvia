// Its own file so the module's index can register the tab list without pulling in the view, which
// is lazily loaded.
export const tabs = [
  ['connections', 'Connections'],
  ['textRules', 'Text'],
  // Its own tab rather than a card under Text: the rules under Text change what you see, and these
  // change what gets stored and sent back to the model on the next turn.
  ['secondPass', 'Second Pass'],
  // Its own tab next to Second Pass, not a card inside it: a different connection, a different
  // window, and it runs whether or not anything was flagged.
  ['goldPass', 'Gold Pass'],
  ['relay', 'Multiplayer'],
  ['debug', 'Misc'],
] as const
