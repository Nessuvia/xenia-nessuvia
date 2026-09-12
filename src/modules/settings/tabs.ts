// Its own file so the module's index can register the tab list without pulling in the view, which
// is lazily loaded.
export const tabs = [
  ['connections', 'Connections'],
  ['textRules', 'Text'],
  // Its own tab rather than a card under Text: the rules under Text change what you see, and this
  // changes what gets stored and sent back to the model on the next turn.
  ['nessuPass', "Nessu's Pass"],
  ['relay', 'Multiplayer'],
  ['debug', 'Misc'],
] as const
