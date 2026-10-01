// Its own file: the module's index registers the tab list without pulling in the view, which is
// lazily loaded.
export const tabs = [
  ['play', 'Play'],
  ['history', 'History'],
] as const
