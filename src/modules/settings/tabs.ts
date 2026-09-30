// Its own file: the module's index can register the tab list without pulling in the view, which
// is lazily loaded.
export const tabs = [
  ['connections', 'Connections'],
  ['relay', 'Multiplayer'],
  ['debug', 'Misc'],
  ['xenia', 'Xenia Prompts'],
] as const
