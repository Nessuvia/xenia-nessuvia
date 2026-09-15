// Its own file: the module's index can register the tab list without pulling in the view, which
// is lazily loaded.
export const tabs = [
  ['connections', 'Connections'],
  ['textRules', 'Text'],
  ['relay', 'Multiplayer'],
  ['debug', 'Misc'],
] as const
